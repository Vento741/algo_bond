# SuperTrend Squeeze v2 - Design Specification

**Дата:** 2026-04-10
**Baseline:** +16.33% PnL, 6.6% DD, 1.28 Sharpe на BTC 15m
**Подход:** инкрементальный апгрейд существующего engine

---

## Секция 1: Volatility Regime Adaptation (УТВЕРЖДЕНА)

### Описание
Определяем текущий рыночный режим и адаптируем поведение стратегии.

### Режимы
1. **trending** - ADX > adx_trending (25) + BB expanding (bandwidth > prev)
2. **ranging** - ADX < adx_ranging (20) + BB contracting
3. **high_vol** - ATR percentile > atr_high_vol_pct (75)

### Поведение
- **ranging** -> пропускаем сигналы (score не набирается)
- **high_vol** -> умножаем stop_atr_mult и trailing_atr_mult на vol_scale (1.5)
- **trending** -> стандартное поведение

### Config
```python
"regime": {
    "use": True,
    "adx_trending": 25,
    "adx_ranging": 20,
    "atr_high_vol_pct": 75,  # ATR percentile threshold
    "atr_lookback": 100,     # окно для расчета percentile
    "vol_scale": 1.5,        # множитель стопов в high_vol
    "skip_ranging": True,    # пропускать сигналы в ranging
}
```

### Реализация
- Функция `atr_percentile(atr_vals, lookback)` -> массив 0-100
- Функция `bb_bandwidth(upper, lower, basis)` -> массив
- В generate_signals: вычислить regime на каждом баре
- ranging bars -> обнулить long_condition/short_condition
- high_vol bars -> масштабировать ATR multipliers

---

## Секция 2: Squeeze Duration Weighting (УТВЕРЖДЕНА)

### Описание
Длительность squeeze (consecutive True bars) влияет на силу сигнала при release.

### Логика
- `squeeze_duration(squeeze_on)` - считает consecutive True bars (resets на False)
- `min_squeeze_duration = 10` - фильтр коротких squeeze (< 10 баров не считается)
- `squeeze_weight = min(duration / norm_period, max_weight)` - множитель для confluence score squeeze-сигналов

### Config
```python
"squeeze": {
    ...existing...,
    "min_duration": 10,     # минимум баров squeeze перед release
    "duration_norm": 30,    # нормализация (30 баров = weight 1.0)
    "max_weight": 2.0,      # максимальный множитель
}
```

### Реализация
- Функция `squeeze_duration(squeeze_on: NDArray) -> NDArray[int]` в oscillators.py
- В generate_signals: фильтр squeeze_release по min_duration
- При squeeze entry: confluence_score *= squeeze_weight

---

## Секция 3: Adaptive Trailing Stop

### Описание
Trailing stop адаптируется к волатильности: tight в спокойном рынке, wide в волатильном.

### Формула
```
atr_pct = atr_percentile(atr_vals, lookback=100)  # 0-100

# Линейная интерполяция между tight и wide
trail_mult = trail_low + (trail_high - trail_low) * atr_pct / 100

trailing_atr = trail_mult * atr_val
```

### Config
```python
"risk": {
    ...existing...,
    "adaptive_trailing": True,    # включить адаптивный trailing
    "trail_low_mult": 3.0,       # множитель при low vol (ATR pct ~0)
    "trail_high_mult": 8.0,      # множитель при high vol (ATR pct ~100)
}
```

### Поведение
- Low vol (ATR pct ~0-25): tight trailing (3.0 * ATR) - быстрее фиксируем прибыль
- Mid vol (ATR pct ~25-75): средний trailing (~5.5 * ATR)
- High vol (ATR pct ~75-100): wide trailing (8.0 * ATR) - даем пространство

### Реализация
- Функция `atr_percentile()` переиспользуется из Секции 1
- В generate_signals: если adaptive_trailing, рассчитать trail_mult per bar
- Заменить фиксированный trailing_atr_mult на per-signal адаптивный
- При adaptive_trailing=False - старое поведение (backward compatible)

---

## Секция 4: Multi-TF Confirmation

### Описание
Фильтрация сигналов по направлению тренда на старшем таймфрейме.

### Архитектура (вариант C - pre-computed в service layer)
1. **Service layer** загружает свечи старшего TF (1H для 15m, 4H для 1H)
2. Вычисляет массив trend direction: EMA(50) slope + SuperTrend(10, 3.0)
3. Передает как `htf_trend: list[int]` в config стратегии (1=bull, -1=bear, 0=neutral)
4. Также передает `htf_timestamps: list[int]` для маппинга на свечи младшего TF

### Маппинг TF
| Рабочий TF | Старший TF | Свечей старшего TF |
|-----------|------------|-------------------|
| 5m        | 1H         | 500 (= 500*12 5m баров) |
| 15m       | 4H         | 500 (= 500*16 15m баров) |
| 1H        | 4H         | 500 |
| 4H        | 1D         | 500 |

### Фильтрация
- Long: разрешен только если htf_trend == 1 (bullish)
- Short: разрешен только если htf_trend == -1 (bearish)
- htf_trend == 0 (neutral): разрешены оба направления

### Config
```python
"multi_tf": {
    "use": False,           # выключено по умолчанию (нужен service layer)
    "htf_trend": [],        # pre-computed от service layer
    "htf_timestamps": [],   # timestamps для маппинга
}
```

### Реализация
- В StrategyService.evaluate_signals: загрузить HTF данные, вычислить trend
- Передать массив trend через config
- В generate_signals: если use=True и htf_trend непустой, маппить и фильтровать
- Функция `map_htf_trend(htf_trend, htf_ts, ltf_ts)` - nearest timestamp matching

---

## Секция 5: Auto Pair Screening

### Описание
Скрипт для автоматического поиска пар, пригодных для стратегии.

### Метрики отбора
1. **ATR%** - Average True Range в % от цены (волатильность)
2. **Avg Daily Range** - средний дневной диапазон
3. **Volume** - средний дневной объем в USD
4. **Trend Strength** - ADX средний за период
5. **Squeeze Frequency** - как часто бывает squeeze (хорошо для стратегии)

### Алгоритм
1. Получить список всех USDT linear futures с Bybit
2. Отфильтровать по min volume ($1M daily)
3. Для каждой пары загрузить 500 свечей 15m
4. Рассчитать метрики
5. Отсортировать по composite score
6. Top-10 -> прогнать бэктест с best config
7. Вывести таблицу результатов

### Config скрипта
```python
MIN_DAILY_VOLUME_USD = 1_000_000
MIN_ATR_PCT = 1.0          # минимум 1% ATR
MAX_ATR_PCT = 15.0         # максимум 15% ATR (слишком волатильные)
MIN_ADX = 15               # минимум средний ADX
TIMEFRAME = "15"
CANDLES = 500
TOP_N = 10
```

### Выход
- `backend/scripts/pair_screener.py` - standalone скрипт
- Результат: JSON + таблица в stdout
- Можно запускать по cron

---

## Порядок реализации

1. **Volatility Regime Adaptation** - новый config section + логика в generate_signals
2. **Squeeze Duration Weighting** - новая функция + интеграция
3. **Adaptive Trailing Stop** - модификация risk section
4. **Multi-TF Confirmation** - service layer + engine filter
5. **Auto Pair Screening** - отдельный скрипт

Каждый шаг: код -> тесты -> deploy -> бэктест -> сравнение с baseline.
