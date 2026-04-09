# Редизайн вкладки "Сигналы" - Спецификация

## Цель

Переработать вкладку "Сигналы" на странице бота: из простой таблицы в карточки с визуальным scorecard индикаторов, filter chips и расширенным indicators_snapshot.

## Текущее состояние

Таблица с колонками: Время, Направление, Сила, KNN Класс, KNN Уверенность, Confluence (бар + число), Исполнен. В `indicators_snapshot` хранится только: entry_price, stop_loss, take_profit, signal_type, tp1/tp2 info.

## Новый дизайн

### Filter Chips (сверху)

Кнопки-фильтры:
- `Все (N)` - активный по умолчанию, белый фон
- `SHORT (N)` - красная рамка
- `LONG (N)` - зелёная рамка

N = количество сигналов каждого типа. Один активный фильтр за раз. Фильтрация на клиенте.

### Свёрнутая строка сигнала

```
┌─ [3px color border] ─────────────────────────────────────────────────────┐
│  SHORT   BULL 22.8%   10.805   R/R 1:2.1          ✓  09.04, 07:16  ▼  │
└──────────────────────────────────────────────────────────────────────────┘
```

Элементы:
- Left border: `#FF1744` для SHORT, `#00E676` для LONG
- Direction badge: как в позициях
- KNN class + confidence: `BULL 22.8%` с цветом класса (BULL=blue, BEAR=red, NEUTRAL=gray)
- Entry price: mono, white
- R/R ratio: gold, mono - вычисляется из entry/SL/TP в indicators_snapshot
- Executed badge: зелёный checkmark или серый dash
- Time: приглушённый
- Chevron: expand/collapse

### Развёрнутый вид

#### 1. Цены (слитные ячейки)

```
┌──────────┬──────────┬──────────┬──────────┐
│ Entry    │ SL       │ TP       │ R/R      │
│ 10.805   │ 11.223   │ 9.944    │ 1:2.1    │
└──────────┴──────────┴──────────┴──────────┘
```

Данные из `indicators_snapshot`: entry_price, stop_loss, take_profit.
R/R = |TP - entry| / |SL - entry|.

#### 2. Индикаторы - пиллы по группам

Каждый индикатор = пилл с цветной точкой (5px circle) + название + значение.

Цвета точки:
- Зелёный `#00E676` = bullish / благоприятно
- Красный `#FF1744` = bearish / неблагоприятно
- Серый `#888` = neutral / нет данных

Фон пилла = rgba версия цвета точки (0.06 opacity). Border = rgba (0.1 opacity).

**Группа "Тренд":**

| Индикатор | Значение | Bull | Bear | Neutral |
|-----------|----------|------|------|---------|
| EMA | ↑ / ↓ | fast > slow | fast < slow | - |
| Ribbon | BULL / BEAR | ribbon_bull | ribbon_bear | - |
| ADX | число (напр. 32.1) | > threshold (trending) | - | <= threshold |

**Группа "Осцилляторы":**

| Индикатор | Значение | Bull | Bear | Neutral |
|-----------|----------|------|------|---------|
| RSI | число (напр. 45.2) | < 30 (oversold) | > 70 (overbought) | 30-70 |
| Vol | ↑ Nx / - | volume_spike = true | - | false |
| BB | upper / lower / mid | price < lower | price > upper | between |

**Группа "Order Flow":**

| Индикатор | Значение | Bull | Bear | Neutral |
|-----------|----------|------|------|---------|
| VWAP | ↑ / ↓ | price > vwap | price < vwap | - |
| CVD | bull / bear | of_bull | of_bear | - |
| SMC | bull / bear / - | smc_bull | smc_bear | нет сигнала |

#### 3. Footer

```
KNN: BULL 22.8%  |  Confluence: 5.00/6  |  Тип: trend  |  ATR: 0.186
```

## Бэкенд-изменения

### Расширение indicators_snapshot

В `backend/app/modules/trading/bot_worker.py`, при создании `TradeSignal`, расширить `indicators_snapshot`:

```python
indicators_snapshot={
    # Существующие поля
    "entry_price": latest_signal.entry_price,
    "stop_loss": latest_signal.stop_loss,
    "take_profit": latest_signal.take_profit,
    "signal_type": latest_signal.signal_type,
    # Новые поля - индикаторы на момент сигнала
    "ema_trend": "bull" | "bear",        # ema_fast vs ema_slow
    "ribbon": "bull" | "bear" | None,     # ribbon_filter state
    "adx": float,                         # adx value
    "rsi": float,                         # rsi value
    "volume_spike": bool,                 # volume > sma * mult
    "volume_ratio": float,                # volume / volume_sma
    "bb_position": "upper" | "lower" | "mid",  # price vs BB bands
    "vwap_position": "above" | "below" | None,  # price vs VWAP
    "cvd": "bull" | "bear" | None,        # CVD signal
    "smc": "bull" | "bear" | None,        # SMC signal
    "atr": float,                         # ATR value
}
```

Все значения вычисляются в `generate_signals()` в `lorentzian_knn.py` и уже доступны в scope `_run_bot_cycle()` через `StrategyResult`. Нужно прокинуть их из engine в bot_worker.

### Прокидывание данных из engine

Расширить `Signal` dataclass в `base.py`:

```python
@dataclass
class Signal:
    bar_index: int
    direction: str
    entry_price: float
    stop_loss: float
    take_profit: float
    trailing_atr: float | None = None
    confluence_score: float = 0.0
    signal_type: str = ""
    tp_levels: list[dict] | None = None
    # Новые поля для snapshot
    indicators: dict | None = None  # snapshot индикаторов
```

В `lorentzian_knn.py` при создании Signal заполнять `indicators` dict из текущих значений массивов по `bar_index`.

## Фронтенд-изменения

### Файл: `frontend/src/pages/BotDetail.tsx`

1. **Заменить таблицу сигналов** на компонент `SignalsList`
2. **Новый компонент `SignalCard`** - свёрнутая/развёрнутая карточка сигнала
3. **Filter chips** - состояние фильтра в useState, фильтрация на клиенте
4. **Вычисление R/R** из indicators_snapshot (entry/SL/TP) на клиенте

### Обратная совместимость

Старые сигналы без новых полей в indicators_snapshot отображаются без scorecard индикаторов (только цены и R/R). Пиллы индикаторов рендерятся только если соответствующее поле присутствует в snapshot.

## Стилизация

- Палитра проекта: #0d0d1a (фон), #00E676 (profit), #FF1744 (loss), #FFD700 (premium)
- KNN class цвета: BULL=#3b82f6 (blue), BEAR=#FF1744 (red), NEUTRAL=#888
- Шрифт цифр: font-mono (JetBrains Mono)
- Пиллы: 10px font, 3px 8px padding, 4px border-radius
- Группы: 8px uppercase label, 4px gap между пиллами
