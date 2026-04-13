# PivotPointMeanReversion — Strategy Design Spec

**Дата:** 2026-04-13
**Автор:** Денис + Claude (brainstorming session)
**Статус:** Design approved, ready for plan
**Тип:** Новая торговая стратегия + конфиги + seed
**Движок:** `engine_type = "pivot_point_mr"`

---

## 1. Контекст и мотивация

### 1.1 Оригинал
WLD Pivot Point S/R — mean reversion стратегия с платформы Rubicon BotMarket (код: https://welcometorubicon.com/pythonscripts5/). Победитель соревнования 36 AI-ботов: **46.2% за 48 часов, Profit Factor 2.53, Win Rate 63%**.

### 1.2 Слабости оригинала
| Слабость | Проявление |
|---|---|
| Нет фильтра тренда | Убыточен в трендовых фазах (fade против импульса) |
| Только центральный pivot | Уровни S1/S2/R1/R2 не используются — теряется часть сигналов и точный SL |
| Сигнал на каждом баре | Шум, переторговка, съедается комиссиями |
| Нет multi-TP | Один выход — либо рано, либо просадка |
| Зависимость от нулевых комиссий | На Bybit (0.06%) экономика ломается |

### 1.3 Почему эта стратегия в AlgoBond
В платформе уже есть **трендовые** движки (SuperTrend Squeeze v2, Hybrid KNN+SuperTrend) и **ML-классификатор** (Lorentzian KNN). Нет **чистой mean reversion** стратегии. PivotPointMR закрывает эту нишу — работает в range/low-ADX фазах, где трендовые молчат, и диверсифицирует портфель ботов.

---

## 2. Жёсткое ограничение: zero impact на существующий код

**Принципиальное требование пользователя:** реализация НЕ должна ломать существующую логику.

**Что НЕ трогаем:**
- `backend/app/modules/strategy/engines/base.py` — интерфейс `BaseStrategy`, `OHLCV`, `Signal`, `StrategyResult`
- `backend/app/modules/backtest/backtest_engine.py` — функция `run_backtest` и её контракт
- `backend/app/modules/trading/bot_worker.py` — цикл `run_bot_cycle`, `_place_order`, `_manage_position`
- `backend/app/modules/trading/bybit_listener.py` — WS обработчики
- Существующие индикаторы в `engines/indicators/` (trend, oscillators, smc, volume)

**Что создаём (новые файлы):**
- `backend/app/modules/strategy/engines/pivot_point_mr.py` — класс стратегии
- `backend/app/modules/strategy/engines/indicators/pivot.py` — Pivot Point индикатор

**Что правим минимально:**
- `backend/app/modules/strategy/engines/__init__.py` — 2 строки: import + регистрация в `ENGINE_REGISTRY`
- `backend/scripts/seed_strategy.py` — 1 запись в списке `STRATEGIES`

### 2.1 Решения по несоответствиям между ТЗ и платформой

Брейншторм выявил 4 несовместимости между первоначальным ТЗ и текущей платформой. Приняты zero-impact решения:

| # | Проблема | Решение |
|---|---|---|
| 1 | `tp_levels` — платформа поддерживает только формат `{"atr_mult": N, "close_pct": N}`, а ТЗ требует абсолютные цены (pivot, S1, R1) | **Конвертация price → atr_mult внутри стратегии**. Стратегия сама вычисляет `atr_mult = (tp_price - entry) / atr[i]` для long (и зеркально для short). Backtest engine реконструирует ту же цену обратно через `entry + atr * atr_mult`. Lossless. Движки не трогаем. |
| 2 | `max_hold_bars` — движки не поддерживают форс-выход по времени | **Выкидываем из MVP.** Параметр остаётся в конфиге как no-op с TODO-маркером. Риск зависания в убытке частично закрывают `trailing_atr` (активен после TP1) и жёсткий потолок `sl_max_pct = 2%`. Если бэктесты покажут что max_hold критичен — добавим в следующей итерации отдельной задачей с явной правкой движков. |
| 3 | `signal_type` — ТЗ хочет `"strong"/"normal"/"weak"`, платформа ожидает семантику паттерна (`"trend"/"breakout"/"mean_reversion"`) | **`signal_type = "mean_reversion"` всегда**, уровень силы кладётся в `Signal.indicators["confluence_tier"] = "strong"|"normal"|"weak"`. `indicators` — свободный словарь, никто его не валидирует. |
| 4 | Close-percentages для ZONE_2 (40/40/20) и ZONE_3 (30/30/30/10) | **Hardcoded в коде стратегии.** В конфиге — только `tp1_close_pct`/`tp2_close_pct` для ZONE_1 (60/40), как в ТЗ. Если потом понадобится — парметризуем локально, никого не касается. |

---

## 3. Архитектура

### 3.1 Файловая структура

```
backend/app/modules/strategy/engines/
├── base.py                      # НЕ ТРОГАТЬ (BaseStrategy, OHLCV, Signal, StrategyResult)
├── __init__.py                  # +2 строки: import + registry
├── pivot_point_mr.py            # НОВЫЙ — PivotPointMeanReversion(BaseStrategy)
└── indicators/
    ├── trend.py                 # НЕ ТРОГАТЬ (ema, atr, adx, rsi — переиспользуем)
    ├── oscillators.py           # НЕ ТРОГАТЬ (squeeze_momentum — переиспользуем)
    └── pivot.py                 # НОВЫЙ — rolling_pivot(), pivot_velocity()

backend/scripts/
└── seed_strategy.py             # +1 запись в STRATEGIES
```

### 3.2 Контракт стратегии

```python
class PivotPointMeanReversion(BaseStrategy):
    @property
    def name(self) -> str:
        return "Pivot Point Mean Reversion"

    @property
    def engine_type(self) -> str:
        return "pivot_point_mr"

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        ...
```

Контракт — ровно тот же что и у `LorentzianKNNStrategy`/`SuperTrendSqueezeStrategy`. Backtest и live движки автоматически подхватывают через `get_engine("pivot_point_mr", config)`.

---

## 4. Индикаторы

### 4.1 Новый модуль `engines/indicators/pivot.py`

Две функции на чистом numpy, NaN-safe (первые `period` баров = NaN, как у существующих индикаторов).

#### `rolling_pivot(high, low, close, period) → (pivot, r1, s1, r2, s2, r3, s3)`

```python
def rolling_pivot(
    high: NDArray,
    low: NDArray,
    close: NDArray,
    period: int,
) -> tuple[NDArray, NDArray, NDArray, NDArray, NDArray, NDArray, NDArray]:
    """
    Rolling Pivot Point с уровнями S1-S3 и R1-R3.

    Для каждого бара i >= period:
        H = max(high[i-period:i])
        L = min(low[i-period:i])
        C = close[i-1]
        P = (H + L + C) / 3
        R1 = 2*P - L
        S1 = 2*P - H
        R2 = P + (H - L)
        S2 = P - (H - L)
        R3 = H + 2*(P - L)
        S3 = L - 2*(H - P)

    Первые period значений — NaN.
    """
```

**Реализация:** используем `np.full(n, np.nan)` и векторизованный расчёт через rolling max/min (аналогично как `atr_percentile()` в `trend.py`).

#### `pivot_velocity(pivot, lookback) → NDArray`

```python
def pivot_velocity(pivot: NDArray, lookback: int) -> NDArray:
    """
    Скорость изменения pivot в процентах за lookback баров.

    velocity[i] = (pivot[i] - pivot[i - lookback]) / pivot[i - lookback] * 100

    Первые lookback + period значений — NaN.
    Используется для детекции дрейфа pivot (pivot сам уплывает → тренд).
    """
```

### 4.2 Переиспользуемые индикаторы (zero new code)

Из `engines/indicators/trend.py`:
- `ema(close, period)` — EMA для `trend.ema_period = 200`
- `atr(high, low, close, period)` — ATR для SL и trailing
- `adx(high, low, close, period)` — из `dmi()`, для regime detection
- `rsi(close, period)` — для RSI confirmation
- `sma(array, period)` — для volume SMA

Из `engines/indicators/oscillators.py`:
- `squeeze_momentum(high, low, close, bb_len, bb_mult, kc_len, kc_mult)` — возвращает `(squeeze_on, momentum, ...)`. Берём только `squeeze_on` boolean массив.

---

## 5. Логика `generate_signals`

### 5.1 Фаза 0 — Расчёт индикаторов

```python
def generate_signals(self, data: OHLCV) -> StrategyResult:
    cfg = self._validate_config(self.config)
    n = len(data)

    # Pivot levels
    pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(
        data.high, data.low, data.close, cfg["pivot"]["period"]
    )

    # Pivot velocity (для regime detection)
    pv = pivot_velocity(pivot, cfg["pivot"]["velocity_lookback"])

    # Дистанция цены от pivot в %
    distance_pct = np.where(
        (pivot > 0) & ~np.isnan(pivot),
        (data.close - pivot) / pivot * 100,
        np.nan,
    )

    # Фильтры
    atr_arr = atr(data.high, data.low, data.close, cfg["risk"]["atr_period"])
    adx_arr = adx(data.high, data.low, data.close, cfg["filters"]["adx_period"])
    ema_arr = ema(data.close, cfg["trend"]["ema_period"])
    rsi_arr = rsi(data.close, cfg["filters"]["rsi_period"])
    volume_sma = sma(data.volume, cfg["filters"]["volume_sma_period"])
    squeeze_on, _, _ = squeeze_momentum(
        data.high, data.low, data.close,
        bb_period=cfg["filters"]["squeeze_bb_len"],
        bb_mult=cfg["filters"]["squeeze_bb_mult"],
        kc_period=cfg["filters"]["squeeze_kc_len"],
        kc_mult=cfg["filters"]["squeeze_kc_mult"],
    )
```

### 5.2 Фаза 1 — Regime detection

Закрывает слабость «нет фильтра тренда».

```python
# Константы режимов
REGIME_RANGE = 0
REGIME_WEAK_TREND = 1
REGIME_STRONG_TREND = 2

def _detect_regime(adx_val: float, pv_val: float, cfg: dict) -> int:
    if np.isnan(adx_val):
        return REGIME_RANGE
    regime = REGIME_RANGE
    if adx_val > cfg["regime"]["adx_strong_trend"]:    # 30
        regime = REGIME_STRONG_TREND
    elif adx_val > cfg["regime"]["adx_weak_trend"]:    # 20
        regime = REGIME_WEAK_TREND
    # Проверка дрейфа pivot: если pivot сам ползёт — рынок трендовый
    if not np.isnan(pv_val) and abs(pv_val) > cfg["regime"]["pivot_drift_max"]:
        regime = max(regime, REGIME_WEAK_TREND)
    return regime
```

**Поведение:**
- `RANGE` → полная торговля, все направления разрешены
- `WEAK_TREND` → торговля **только** в направлении тренда (если `close > ema` → only LONG; если `close < ema` → only SHORT)
- `STRONG_TREND` → если `allow_strong_trend == false` → **полный пропуск** сигнала; если `true` → только по тренду с увеличенным SL (`sl_max_pct * 1.5`)

### 5.3 Фаза 2 — Фильтры входа

Закрывает слабость «сигнал на каждом баре».

Все фильтры должны пройти (кроме squeeze — он только добавляет confluence, не блокирует):

```python
def _passes_filters(i, direction, cfg, arrays) -> bool:
    # a) Pivot рассчитан
    if np.isnan(arrays["pivot"][i]):
        return False

    # b) Deadzone — цена не слишком близко к pivot
    if abs(arrays["distance_pct"][i]) < cfg["entry"]["min_distance_pct"]:
        return False

    # c) RSI confirmation
    if cfg["filters"]["rsi_enabled"]:
        rsi_val = arrays["rsi"][i]
        if np.isnan(rsi_val):
            return False
        if direction == "long" and rsi_val >= cfg["filters"]["rsi_oversold"]:
            return False
        if direction == "short" and rsi_val <= cfg["filters"]["rsi_overbought"]:
            return False

    # d) Volume confirmation (optional)
    if cfg["filters"]["volume_filter_enabled"]:
        vol_ratio = arrays["volume"][i] / arrays["volume_sma"][i]
        if vol_ratio < cfg["filters"]["volume_min_ratio"]:
            return False

    # f) Cooldown — прошло достаточно баров с последнего сигнала
    if (i - state.last_signal_bar) < cfg["entry"]["cooldown_bars"]:
        return False

    # g) Anti-impulse — не ловим падающий нож
    window = cfg["entry"]["impulse_check_bars"]
    if i >= window:
        last_bars = arrays["close"][i-window+1:i+1] - arrays["open"][i-window+1:i+1]
        if direction == "long" and np.all(last_bars < 0):
            return False  # все свечи красные → пропуск
        if direction == "short" and np.all(last_bars > 0):
            return False  # все свечи зелёные → пропуск

    return True
```

**Примечание (e) Squeeze:** не блокирует вход, только добавляет `+0.5` к confluence (см. Фаза 5).

### 5.4 Фаза 3 — Определение зоны входа

Закрывает слабость «нет уровней S1/S2/R1/R2».

```python
def _detect_zone(close_val, pivot_val, s1_val, s2_val, r1_val, r2_val) -> tuple[str, int] | None:
    # LONG зоны (цена ниже pivot)
    if s1_val <= close_val < pivot_val:
        return ("long", 1)
    if s2_val <= close_val < s1_val:
        return ("long", 2)
    if close_val < s2_val:
        return ("long", 3)
    # SHORT зоны (цена выше pivot)
    if pivot_val < close_val <= r1_val:
        return ("short", 1)
    if r1_val < close_val <= r2_val:
        return ("short", 2)
    if close_val > r2_val:
        return ("short", 3)
    return None
```

### 5.5 Фаза 4 — SL и TP (адаптивные, привязаны к уровням)

Закрывает слабость «нет multi-TP».

#### Stop Loss

```python
def _calculate_sl(direction, zone, entry, atr_val, levels, cfg) -> float:
    sl_atr = cfg["risk"]["sl_atr_mult"]    # 0.5
    sl_max = cfg["risk"]["sl_max_pct"]     # 0.02 (2%)

    if direction == "long":
        level_map = {1: levels["s1"], 2: levels["s2"], 3: levels["s3"]}
        level_sl = level_map[zone] - atr_val * sl_atr
        hard_cap = entry * (1 - sl_max)
        return max(level_sl, hard_cap)  # выбираем более высокий SL (меньше риска)
    else:  # short
        level_map = {1: levels["r1"], 2: levels["r2"], 3: levels["r3"]}
        level_sl = level_map[zone] + atr_val * sl_atr
        hard_cap = entry * (1 + sl_max)
        return min(level_sl, hard_cap)
```

**В STRONG_TREND** (если разрешён): `sl_max *= 1.5`.

#### Take Profit — price-based → atr_mult конверсия

Конверсия необходима т.к. платформа принимает `tp_levels` только в формате atr_mult:

```python
def _price_to_atr_mult(tp_price: float, entry: float, atr_val: float, direction: str) -> float:
    if direction == "long":
        return (tp_price - entry) / atr_val
    else:  # short — atr_mult положительный если TP ниже entry
        return (entry - tp_price) / atr_val
```

**TP распределение по зонам:**

```python
# LONG ZONE_1: TP1=pivot (60%), TP2=r1 (40%)
tp_prices_zone1_long = [
    (pivot_val,  cfg["risk"]["tp1_close_pct"]),  # 0.6
    (r1_val,     cfg["risk"]["tp2_close_pct"]),  # 0.4
]

# LONG ZONE_2: TP1=s1 (40%), TP2=pivot (40%), TP3=r1 (20%)
tp_prices_zone2_long = [
    (s1_val,     0.40),  # hardcoded
    (pivot_val,  0.40),
    (r1_val,     0.20),
]

# LONG ZONE_3: TP1=s2 (30%), TP2=s1 (30%), TP3=pivot (30%), TP4=r1 (10%)
tp_prices_zone3_long = [
    (s2_val,     0.30),
    (s1_val,     0.30),
    (pivot_val,  0.30),
    (r1_val,     0.10),
]

# SHORT — зеркально по r1/r2/r3
```

**Конверсия в формат платформы:**

```python
tp_levels = []
for tp_price, close_pct in tp_prices:
    if tp_price > 0 and not np.isnan(tp_price):
        atr_mult = _price_to_atr_mult(tp_price, entry, atr_val, direction)
        if atr_mult > 0:  # TP в правильную сторону от entry
            tp_levels.append({"atr_mult": atr_mult, "close_pct": close_pct * 100})
```

**Важно:** `close_pct` в формате backtest_engine — проценты 0-100, а не доля 0-1 (см. `multi_tp` логику в `backtest_engine.py:296-310`). В коде конверсии умножаем на 100.

#### Trailing stop

```python
trailing_atr_val = atr_val * cfg["risk"]["trailing_atr_mult"]  # 1.5
# Активируется после TP1 (breakeven логика в движках уже это делает)
```

#### Breakeven

Управляется самим движком: после срабатывания первого TP в `tp_levels` backtest_engine переводит SL на entry автоматически. Мы передаём `use_breakeven=True` через конфиг бэктеста (см. раздел 6).

### 5.6 Фаза 5 — Confluence score

```python
def _calculate_confluence(i, zone, direction, regime, arrays, cfg) -> float:
    score = 0.0

    # Базовый сигнал
    score += 1.0

    # Глубина зоны
    if zone == 2:
        score += 1.0
    elif zone == 3:
        score += 1.5

    # Range regime (низкий ADX — идеал для mean reversion)
    if regime == REGIME_RANGE:
        score += 0.5

    # RSI подтверждение (уже прошёл фильтр, но дополнительный вес)
    rsi_val = arrays["rsi"][i]
    if direction == "long" and rsi_val < cfg["filters"]["rsi_oversold"]:
        score += 0.5
    elif direction == "short" and rsi_val > cfg["filters"]["rsi_overbought"]:
        score += 0.5

    # Squeeze ON (сжатие волатильности — предвестник взрыва)
    if arrays["squeeze_on"][i]:
        score += 0.5

    # Повышенный объём
    if arrays["volume"][i] > arrays["volume_sma"][i] * 1.2:
        score += 0.5

    # Совпадение с EMA trend
    ema_val = arrays["ema"][i]
    if direction == "long" and arrays["close"][i] > ema_val:
        score += 0.5
    elif direction == "short" and arrays["close"][i] < ema_val:
        score += 0.5
    # Контр-тренд — 0 баллов (не штрафуем, но и не поощряем)

    return score
```

**Фильтрация по минимальному confluence:**
```python
if score < cfg["entry"]["min_confluence"]:  # 1.5
    skip  # не создаём Signal
```

**Confluence tier (для `indicators["confluence_tier"]`):**
- `score >= 4.0` → `"strong"`
- `score >= 2.5` → `"normal"`
- `score >= 1.5` → `"weak"`

**Важно:** `signal_type = "mean_reversion"` всегда (используем существующее значение enum базового интерфейса). Сила — через `indicators["confluence_tier"]`.

### 5.7 Финальный Signal

```python
signal = Signal(
    bar_index=i,
    direction=direction,
    entry_price=float(entry),
    stop_loss=float(sl),
    take_profit=float(tp_prices[0][0]),  # первая TP цена для legacy-поля (остальные — в tp_levels)
    trailing_atr=float(atr_val * cfg["risk"]["trailing_atr_mult"]),
    confluence_score=float(score),
    signal_type="mean_reversion",
    tp_levels=tp_levels,
    indicators={
        "pivot": float(pivot_val),
        "s1": float(s1_val), "s2": float(s2_val), "s3": float(s3_val),
        "r1": float(r1_val), "r2": float(r2_val), "r3": float(r3_val),
        "zone": zone,
        "regime": regime_name,  # "range" | "weak_trend" | "strong_trend"
        "rsi": float(rsi_arr[i]),
        "adx": float(adx_arr[i]),
        "distance_pct": float(distance_pct[i]),
        "pivot_velocity": float(pv[i]),
        "squeeze_on": bool(squeeze_on[i]),
        "confluence_tier": tier,  # "strong" | "normal" | "weak"
    },
)
state.last_signal_bar = i
signals.append(signal)
```

### 5.8 StrategyResult

```python
return StrategyResult(
    signals=signals,
    confluence_scores_long=confluence_long_arr,   # per-bar, для UI overlay
    confluence_scores_short=confluence_short_arr,
    knn_scores=np.zeros(n),       # заглушка (стратегия не KNN)
    knn_classes=np.zeros(n),
    knn_confidence=np.zeros(n),
)
```

---

## 6. Конфигурация (default_config для seed)

```json
{
  "pivot": {
    "period": 48,
    "velocity_lookback": 12
  },
  "trend": {
    "ema_period": 200
  },
  "regime": {
    "adx_weak_trend": 20,
    "adx_strong_trend": 30,
    "pivot_drift_max": 0.3,
    "allow_strong_trend": false
  },
  "entry": {
    "min_distance_pct": 0.15,
    "min_confluence": 1.5,
    "use_deep_levels": true,
    "cooldown_bars": 3,
    "impulse_check_bars": 5
  },
  "filters": {
    "adx_enabled": true,
    "adx_period": 14,
    "rsi_enabled": true,
    "rsi_period": 14,
    "rsi_oversold": 40,
    "rsi_overbought": 60,
    "squeeze_enabled": true,
    "squeeze_bb_len": 20,
    "squeeze_bb_mult": 2.0,
    "squeeze_kc_len": 20,
    "squeeze_kc_mult": 1.5,
    "volume_filter_enabled": false,
    "volume_sma_period": 20,
    "volume_min_ratio": 1.2
  },
  "risk": {
    "sl_atr_mult": 0.5,
    "sl_max_pct": 0.02,
    "atr_period": 14,
    "tp1_close_pct": 0.6,
    "tp2_close_pct": 0.4,
    "trailing_atr_mult": 1.5,
    "max_hold_bars": 60,
    "_max_hold_note": "NOT IMPLEMENTED in MVP — no-op. Engines don't support forced time-based exit. TODO: add after grid search validates necessity."
  },
  "backtest": {
    "commission": 0.0006,
    "slippage": 0.0003
  },
  "live": {
    "commission": 0.0006
  }
}
```

**Валидация** (`_validate_config`): все параметры через `.get()` с дефолтами. Стратегия НЕ падает на отсутствующих ключах — использует значения выше как fallback.

---

## 7. Регистрация и seed

### 7.1 `engines/__init__.py` (+2 строки)

```python
from .pivot_point_mr import PivotPointMeanReversion  # +1

ENGINE_REGISTRY: dict[str, type[BaseStrategy]] = {
    "lorentzian_knn": LorentzianKNNStrategy,
    "supertrend_squeeze": SuperTrendSqueezeStrategy,
    "hybrid_knn_supertrend": HybridKNNSuperTrendStrategy,
    "pivot_point_mr": PivotPointMeanReversion,  # +1
}
```

### 7.2 `backend/scripts/seed_strategy.py`

Добавить в список `STRATEGIES`:

```python
{
    "name": "Pivot Point Mean Reversion",
    "slug": "pivot-point-mr",
    "engine_type": "pivot_point_mr",
    "description": (
        "Mean reversion strategy based on rolling pivot point S/R levels. "
        "Fades deviations from pivot expecting price to return to equilibrium. "
        "Features regime detection (range/weak/strong trend via ADX + pivot velocity), "
        "multi-zone entries (S1-S3 / R1-R3) with zone-adaptive SL and multi-TP, "
        "RSI confirmation, squeeze filter, anti-impulse protection, cooldown. "
        "Best suited for volatile altcoins in ranging/low-ADX regimes. "
        "Inspired by Rubicon BotMarket Pivot Point S/R winner strategy, "
        "with closed weaknesses: trend filter, deep levels, multi-TP, noise filters."
    ),
    "default_config": {...},  # из раздела 6
    "version": "1.0.0",
    "is_public": True,
},
```

Скрипт идемпотентный — проверяет по slug, пропускает существующие.

---

## 8. Валидация и тестирование

### 8.1 Unit-тесты `backend/tests/strategy/test_pivot_point_mr.py`

1. **`test_rolling_pivot_correctness`** — знаем H/L/C за период → проверяем P, R1, S1, R2, S2 вручную
2. **`test_rolling_pivot_nan_safe`** — первые `period` баров = NaN, не падаем
3. **`test_pivot_velocity_positive_drift`** — синтетический восходящий pivot → velocity > 0
4. **`test_detect_zone_long_zone1`** — цена между S1 и Pivot → `("long", 1)`
5. **`test_detect_zone_long_zone3`** — цена ниже S2 → `("long", 3)`
6. **`test_detect_regime_range`** — ADX=15, pv=0.1 → RANGE
7. **`test_detect_regime_strong_trend`** — ADX=40 → STRONG_TREND
8. **`test_detect_regime_pivot_drift_override`** — ADX=15, pv=0.5 → минимум WEAK_TREND
9. **`test_filter_cooldown`** — два сигнала подряд с cooldown=3 → второй пропускается
10. **`test_filter_anti_impulse`** — 5 красных свечей → long сигнал блокируется
11. **`test_sl_hard_cap`** — SL не глубже `sl_max_pct`
12. **`test_tp_price_to_atr_mult`** — обратная конверсия даёт ту же цену
13. **`test_tp_levels_zone1_long`** — зона 1, проверяем pivot и r1 в tp_levels
14. **`test_confluence_score_strong`** — все бонусы → score >= 4.0 → tier "strong"
15. **`test_signal_skipped_below_min_confluence`** — score < 1.5 → сигнал не создаётся
16. **`test_generate_signals_empty_on_insufficient_data`** — n < period → пустой результат
17. **`test_strong_trend_skip`** — `allow_strong_trend=false` + STRONG_TREND → сигнал скипается
18. **`test_weak_trend_only_direction`** — WEAK_TREND + close>ema → только long, short блокируется

**Fixture для свечей:** синтетический OHLCV с настраиваемой формой (ranging, trending, volatile), аналогично существующим тестам стратегий.

### 8.2 Интеграционные тесты

1. **`test_pivot_point_mr_runs_in_backtest_engine`** — запуск `run_backtest(ohlcv, signals, use_multi_tp=True, ...)` на синтетических данных, проверка что не падает и trades_log не пустой
2. **`test_registry_lookup`** — `get_engine("pivot_point_mr", default_config)` возвращает экземпляр
3. **`test_seed_idempotent`** — запуск seed дважды не создаёт дубликат

### 8.3 Grid search параметры (для `optimize_strategy.py`)

| Параметр | Coarse значения |
|---|---|
| `pivot.period` | 24, 48, 96, 144, 288 |
| `entry.min_distance_pct` | 0.05, 0.10, 0.15, 0.25, 0.40 |
| `entry.min_confluence` | 1.0, 1.5, 2.0, 2.5 |
| `risk.sl_max_pct` | 0.01, 0.015, 0.02, 0.03 |
| `regime.adx_strong_trend` | 25, 30, 35, 45 |
| `filters.rsi_oversold` | 30, 35, 40, 45 (симметрично rsi_overbought) |
| `entry.cooldown_bars` | 1, 3, 5, 10 |

**Токены:** WLD (оригинал), LDO, BCH, FET, RNDR, INJ, NEAR, SUI, APT.
**Таймфреймы:** 5m (оригинал), 15m, 1h.

**Критерии успеха:**
- Profit Factor > 1.5
- Win Rate > 55%
- Max Drawdown < 15%
- Sharpe > 1.0
- Calmar > 1.0

---

## 9. Карта закрытия слабостей оригинала

| Слабость оригинала | Как закрыта | Раздел спека |
|---|---|---|
| Нет фильтра тренда | Regime detection (ADX + pivot velocity + EMA direction). STRONG_TREND блокируется | 5.2 |
| Нет уровней S1/S2/R1/R2 | Rolling pivot + 3 зоны входа с адаптивным SL и многоуровневым TP | 4.1, 5.4, 5.5 |
| Сигнал на каждом баре | Deadzone + cooldown + RSI + anti-impulse + min confluence | 5.3 |
| Нет multi-TP | 2-4 уровня TP привязанных к S/R + trailing + breakeven | 5.5 |
| Зависимость от нулевых комиссий | Cooldown + deadzone снижают частоту; бэктест с commission=0.06% (Bybit) в конфиге | 5.3, 6 |

---

## 10. Ограничения MVP (явно НЕ входит)

1. **`max_hold_bars`** — no-op, только в конфиге. Добавим после валидации грид-сёрча что это критично.
2. **`method: "floor"`** параметр (floor/weekly/session pivots) — только rolling period. Добавим если понадобится.
3. **Auto-pair screening** — не входит, используется существующий `optimize_strategy.py` workflow.
4. **UI параметров на фронте** — не входит. Конфиг редактируется через общий JSONB-редактор StrategyConfig.

---

## 11. Риски и открытые вопросы

| Риск | Митигация |
|---|---|
| Отсутствие `max_hold_bars` → зависание в убытке на флете | `sl_max_pct = 2%` жёсткий потолок + trailing после TP1. Мониторим avg_hold_duration в бэктесте |
| `_price_to_atr_mult` даёт отрицательный результат → TP в неправильную сторону | Явная проверка `if atr_mult > 0` перед добавлением в tp_levels, иначе пропускаем уровень |
| ATR=0 → деление на ноль при конверсии TP | Guard: `if atr_val < 1e-8: skip signal` |
| Pivot velocity на первых барах NaN → regime fallback | `_detect_regime` обрабатывает NaN → RANGE по умолчанию |
| Бэктест на 0.06% комиссиях показывает убыток | Ожидаемый сценарий — оптимизируем через grid search. Если даже после оптимизации PF < 1.3 — стратегия не жизнеспособна на Bybit, документируем и закрываем |

---

## 12. Definition of Done

- [ ] `engines/indicators/pivot.py` с `rolling_pivot()` и `pivot_velocity()` + unit-тесты
- [ ] `engines/pivot_point_mr.py` с полным `PivotPointMeanReversion` классом
- [ ] Регистрация в `engines/__init__.py`
- [ ] Seed запись в `seed_strategy.py`
- [ ] 18 unit-тестов проходят
- [ ] 3 интеграционных теста проходят
- [ ] `get_engine("pivot_point_mr", default_config)` возвращает экземпляр без ошибок
- [ ] `run_backtest(ohlcv, engine.generate_signals(ohlcv).signals, use_multi_tp=True)` не падает на реальных данных (WLD 5m 30 дней)
- [ ] Grid search (coarse) запущен на минимум 3 токенах, топ-конфиги сохранены
- [ ] НИ ОДНОГО изменения в `base.py`, `backtest_engine.py`, `bot_worker.py`, `bybit_listener.py`, существующих индикаторах
- [ ] Код-ревью от `code-reviewer` агента
- [ ] Деплой на VPS, `curl http://localhost:8100/api/strategy/list` показывает новую стратегию

---

## 13. Команда реализации (оркестрация)

| Агент | Задача |
|---|---|
| `algorithm-engineer` | Реализация `rolling_pivot`, `pivot_velocity`, `PivotPointMeanReversion.generate_signals` (включая регime detection, фильтры, zone detection, SL/TP конверсию, confluence) |
| `backend-dev` | Правки `engines/__init__.py`, `seed_strategy.py`, написание unit + integration тестов |
| `market-analyst` | Валидация default_config на реальных свечах WLD/LDO/BCH (визуально в Jupyter через service.evaluate_signals), запуск coarse grid search |
| `code-reviewer` | Финальное ревью на соответствие zero-impact требованию и спеку |

Координация через `orchestrator`. После каждого этапа — `/simplify` ревью.
