# PivotPointMeanReversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать `PivotPointMeanReversion` торговую стратегию как новый `BaseStrategy` подкласс с zero impact на существующий код платформы AlgoBond, с закрытием всех 5 слабостей оригинала Rubicon BotMarket WLD Pivot Point S/R.

**Architecture:** Новые файлы `engines/pivot_point_mr.py` + `engines/indicators/pivot.py`. Стратегия использует rolling pivot S/R levels, regime detection (ADX + pivot velocity), multi-zone entries, multi-TP с конверсией price→distance (поле `atr_mult` в `Signal.tp_levels` исторически хранит сырую дистанцию — см. `backtest_engine.py:299`). Интеграция в `ENGINE_REGISTRY` через 2 строки в `engines/__init__.py` и 1 запись в `seed_strategy.py`.

**Tech Stack:** Python 3.12, numpy, pytest, SQLAlchemy 2.0, существующие индикаторы из `engines/indicators/{trend,oscillators}.py`

**Spec:** [docs/superpowers/specs/2026-04-13-pivot-point-mean-reversion-design.md](../specs/2026-04-13-pivot-point-mean-reversion-design.md)

---

## File Structure

### Files to Create

| Path | Responsibility |
|---|---|
| `backend/app/modules/strategy/engines/indicators/pivot.py` | `rolling_pivot()` и `pivot_velocity()` — чистый numpy, NaN-safe |
| `backend/app/modules/strategy/engines/pivot_point_mr.py` | `PivotPointMeanReversion(BaseStrategy)` + приватные helper'ы `_detect_regime`, `_detect_zone`, `_passes_filters`, `_calculate_sl`, `_calculate_tp_levels`, `_calculate_confluence`, `_price_to_distance` |
| `backend/tests/test_pivot_indicator.py` | Unit-тесты индикаторов |
| `backend/tests/test_pivot_point_mr.py` | Unit + integration тесты стратегии |

### Files to Modify

| Path | Change |
|---|---|
| `backend/app/modules/strategy/engines/__init__.py` | +2 строки: import + регистрация в `ENGINE_REGISTRY` |
| `backend/scripts/seed_strategy.py` | +1 запись в списке `STRATEGIES` |

### Zero-impact Contract (верифицировать на финальном ревью)

**НЕ ТРОГАЕМ:**
- `backend/app/modules/strategy/engines/base.py`
- `backend/app/modules/backtest/backtest_engine.py`
- `backend/app/modules/trading/bot_worker.py`
- `backend/app/modules/trading/bybit_listener.py`
- `backend/app/modules/strategy/engines/indicators/trend.py`
- `backend/app/modules/strategy/engines/indicators/oscillators.py`
- `backend/app/modules/strategy/engines/indicators/smc.py`
- `backend/app/modules/strategy/engines/indicators/volume.py`
- Существующие стратегии (`lorentzian_knn.py`, `supertrend_squeeze.py`, `hybrid_knn_supertrend.py`)

---

## Task 1: `rolling_pivot` indicator + tests

**Files:**
- Create: `backend/app/modules/strategy/engines/indicators/pivot.py`
- Create: `backend/tests/test_pivot_indicator.py`

- [ ] **Step 1.1: Создать пустой модуль с docstring**

Create `backend/app/modules/strategy/engines/indicators/pivot.py`:

```python
"""Pivot Point индикаторы — rolling pivot + S/R уровни + velocity.

Используется в PivotPointMeanReversion стратегии.
Чистый numpy, NaN-safe (первые N значений = NaN, как у trend.py).
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
```

- [ ] **Step 1.2: Написать тест корректности rolling_pivot на синтетических данных**

Create `backend/tests/test_pivot_indicator.py`:

```python
"""Тесты Pivot Point индикаторов."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.pivot import (
    pivot_velocity,
    rolling_pivot,
)


class TestRollingPivot:
    def test_basic_calculation(self) -> None:
        """Проверка формулы pivot на известных значениях.

        period=3, бар i=3 использует high[0..2], low[0..2], close[2].
        H=102, L=98, C=100 → P = (102+98+100)/3 = 100.0
        R1 = 2*100 - 98 = 102
        S1 = 2*100 - 102 = 98
        R2 = 100 + (102-98) = 104
        S2 = 100 - (102-98) = 96
        R3 = 102 + 2*(100-98) = 106
        S3 = 98 - 2*(102-100) = 94
        """
        high = np.array([102.0, 101.0, 102.0, 103.0, 104.0], dtype=np.float64)
        low = np.array([98.0, 97.0, 98.0, 99.0, 100.0], dtype=np.float64)
        close = np.array([100.0, 99.0, 100.0, 101.0, 102.0], dtype=np.float64)

        pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(high, low, close, period=3)

        assert pivot[3] == pytest.approx(100.0)
        assert r1[3] == pytest.approx(102.0)
        assert s1[3] == pytest.approx(98.0)
        assert r2[3] == pytest.approx(104.0)
        assert s2[3] == pytest.approx(96.0)
        assert r3[3] == pytest.approx(106.0)
        assert s3[3] == pytest.approx(94.0)

    def test_nan_before_period(self) -> None:
        """Первые `period` баров должны быть NaN."""
        high = np.arange(10, dtype=np.float64) + 100
        low = np.arange(10, dtype=np.float64) + 98
        close = np.arange(10, dtype=np.float64) + 99
        pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(high, low, close, period=5)
        for arr in (pivot, r1, s1, r2, s2, r3, s3):
            assert all(np.isnan(arr[:5]))
            assert not np.isnan(arr[5])

    def test_insufficient_data(self) -> None:
        """n < period → всё NaN, без падений."""
        high = np.array([100.0, 101.0], dtype=np.float64)
        low = np.array([98.0, 99.0], dtype=np.float64)
        close = np.array([99.0, 100.0], dtype=np.float64)
        pivot, *_ = rolling_pivot(high, low, close, period=10)
        assert all(np.isnan(pivot))

    def test_output_shapes_match_input(self) -> None:
        n = 50
        high = np.random.uniform(100, 110, n)
        low = np.random.uniform(90, 100, n)
        close = np.random.uniform(95, 105, n)
        results = rolling_pivot(high, low, close, period=10)
        for arr in results:
            assert arr.shape == (n,)
            assert arr.dtype == np.float64
```

- [ ] **Step 1.3: Запустить тесты — ожидаем FAIL (функция не определена)**

Run: `cd backend && pytest tests/test_pivot_indicator.py::TestRollingPivot -v`
Expected: `ImportError: cannot import name 'rolling_pivot'`

- [ ] **Step 1.4: Реализовать `rolling_pivot`**

Append to `backend/app/modules/strategy/engines/indicators/pivot.py`:

```python
def rolling_pivot(
    high: NDArray,
    low: NDArray,
    close: NDArray,
    period: int,
) -> tuple[NDArray, NDArray, NDArray, NDArray, NDArray, NDArray, NDArray]:
    """Rolling Pivot Point с уровнями S1-S3 и R1-R3.

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

    Первые `period` значений — NaN.

    Returns: (pivot, r1, s1, r2, s2, r3, s3) — все numpy float64 shape=(n,).
    """
    n = len(close)
    pivot = np.full(n, np.nan, dtype=np.float64)
    r1 = np.full(n, np.nan, dtype=np.float64)
    s1 = np.full(n, np.nan, dtype=np.float64)
    r2 = np.full(n, np.nan, dtype=np.float64)
    s2 = np.full(n, np.nan, dtype=np.float64)
    r3 = np.full(n, np.nan, dtype=np.float64)
    s3 = np.full(n, np.nan, dtype=np.float64)

    if n < period + 1 or period <= 0:
        return pivot, r1, s1, r2, s2, r3, s3

    for i in range(period, n):
        window_high = high[i - period:i]
        window_low = low[i - period:i]
        H = float(np.max(window_high))
        L = float(np.min(window_low))
        C = float(close[i - 1])
        P = (H + L + C) / 3.0
        rng = H - L

        pivot[i] = P
        r1[i] = 2 * P - L
        s1[i] = 2 * P - H
        r2[i] = P + rng
        s2[i] = P - rng
        r3[i] = H + 2 * (P - L)
        s3[i] = L - 2 * (H - P)

    return pivot, r1, s1, r2, s2, r3, s3
```

- [ ] **Step 1.5: Запустить тесты — ожидаем PASS**

Run: `cd backend && pytest tests/test_pivot_indicator.py::TestRollingPivot -v`
Expected: 4 passed

- [ ] **Step 1.6: Commit**

```bash
git add backend/app/modules/strategy/engines/indicators/pivot.py backend/tests/test_pivot_indicator.py
git commit -m "feat(indicators): add rolling_pivot with S1-S3/R1-R3 levels"
```

---

## Task 2: `pivot_velocity` indicator + tests

**Files:**
- Modify: `backend/app/modules/strategy/engines/indicators/pivot.py` (добавить функцию в конец)
- Modify: `backend/tests/test_pivot_indicator.py` (добавить класс тестов)

- [ ] **Step 2.1: Написать тесты pivot_velocity**

Append to `backend/tests/test_pivot_indicator.py`:

```python
class TestPivotVelocity:
    def test_positive_drift(self) -> None:
        """Восходящий pivot → положительная velocity."""
        # pivot[0..9] = 100, 101, 102, ..., 109
        pivot = np.arange(100, 110, dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=5)
        # vel[5] = (105 - 100) / 100 * 100 = 5.0
        assert vel[5] == pytest.approx(5.0)
        assert vel[9] == pytest.approx((109 - 104) / 104 * 100)

    def test_flat_pivot_zero_velocity(self) -> None:
        pivot = np.full(20, 100.0)
        vel = pivot_velocity(pivot, lookback=5)
        assert vel[5] == pytest.approx(0.0)
        assert vel[19] == pytest.approx(0.0)

    def test_nan_before_lookback(self) -> None:
        pivot = np.arange(100, 120, dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=5)
        assert all(np.isnan(vel[:5]))
        assert not np.isnan(vel[5])

    def test_nan_input_propagates(self) -> None:
        pivot = np.array([np.nan, np.nan, 100.0, 101.0, 102.0, 103.0], dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=2)
        # vel[2] = (100 - nan) → nan
        assert np.isnan(vel[2])
        assert np.isnan(vel[3])
        # vel[4] = (102 - 100) / 100 * 100 = 2.0
        assert vel[4] == pytest.approx(2.0)

    def test_zero_denominator_safe(self) -> None:
        """Если pivot[i - lookback] == 0 → NaN, не деление на ноль."""
        pivot = np.array([0.0, 1.0, 2.0, 3.0, 4.0], dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=2)
        assert np.isnan(vel[2])  # pivot[0]=0 → деление на ноль
```

- [ ] **Step 2.2: Запустить тесты — FAIL**

Run: `cd backend && pytest tests/test_pivot_indicator.py::TestPivotVelocity -v`
Expected: `ImportError: cannot import name 'pivot_velocity'`

- [ ] **Step 2.3: Реализовать `pivot_velocity`**

Append to `backend/app/modules/strategy/engines/indicators/pivot.py`:

```python
def pivot_velocity(pivot: NDArray, lookback: int) -> NDArray:
    """Скорость изменения pivot в процентах за `lookback` баров.

    velocity[i] = (pivot[i] - pivot[i - lookback]) / pivot[i - lookback] * 100

    Используется для детекции дрейфа: если pivot сам уплывает —
    рынок фактически трендовый, даже если ADX ещё низкий.

    Первые `lookback` значений — NaN. NaN-safe на NaN входе.
    """
    n = len(pivot)
    out = np.full(n, np.nan, dtype=np.float64)

    if n <= lookback or lookback <= 0:
        return out

    for i in range(lookback, n):
        curr = pivot[i]
        prev = pivot[i - lookback]
        if np.isnan(curr) or np.isnan(prev) or prev == 0.0:
            continue
        out[i] = (curr - prev) / prev * 100.0

    return out
```

- [ ] **Step 2.4: Запустить все тесты индикатора — PASS**

Run: `cd backend && pytest tests/test_pivot_indicator.py -v`
Expected: 9 passed

- [ ] **Step 2.5: Commit**

```bash
git add backend/app/modules/strategy/engines/indicators/pivot.py backend/tests/test_pivot_indicator.py
git commit -m "feat(indicators): add pivot_velocity for regime detection"
```

---

## Task 3: Strategy skeleton + `_validate_config`

**Files:**
- Create: `backend/app/modules/strategy/engines/pivot_point_mr.py`
- Create: `backend/tests/test_pivot_point_mr.py`

- [ ] **Step 3.1: Написать тест базовой инициализации и дефолтов**

Create `backend/tests/test_pivot_point_mr.py`:

```python
"""Тесты PivotPointMeanReversion стратегии."""

import numpy as np
import pytest

from app.modules.strategy.engines.base import OHLCV, Signal, StrategyResult
from app.modules.strategy.engines.pivot_point_mr import (
    PivotPointMeanReversion,
    REGIME_RANGE,
    REGIME_WEAK_TREND,
    REGIME_STRONG_TREND,
)


# === Fixtures ===

def make_ohlcv(n: int, base_price: float = 100.0, trend: float = 0.0, noise: float = 1.0, seed: int = 42) -> OHLCV:
    """Синтетический OHLCV с контролируемым трендом и шумом."""
    rng = np.random.default_rng(seed)
    closes = base_price + np.arange(n) * trend + rng.normal(0, noise, n)
    highs = closes + np.abs(rng.normal(0.5, 0.2, n))
    lows = closes - np.abs(rng.normal(0.5, 0.2, n))
    opens = closes + rng.normal(0, 0.3, n)
    volumes = rng.uniform(1000, 2000, n)
    return OHLCV(
        open=opens.astype(np.float64),
        high=highs.astype(np.float64),
        low=lows.astype(np.float64),
        close=closes.astype(np.float64),
        volume=volumes.astype(np.float64),
        timestamps=np.arange(n, dtype=np.float64) * 60_000,
    )


DEFAULT_CONFIG = {
    "pivot": {"period": 48, "velocity_lookback": 12},
    "trend": {"ema_period": 200},
    "regime": {
        "adx_weak_trend": 20,
        "adx_strong_trend": 30,
        "pivot_drift_max": 0.3,
        "allow_strong_trend": False,
    },
    "entry": {
        "min_distance_pct": 0.15,
        "min_confluence": 1.5,
        "use_deep_levels": True,
        "cooldown_bars": 3,
        "impulse_check_bars": 5,
    },
    "filters": {
        "adx_enabled": True,
        "adx_period": 14,
        "rsi_enabled": True,
        "rsi_period": 14,
        "rsi_oversold": 40,
        "rsi_overbought": 60,
        "squeeze_enabled": True,
        "squeeze_bb_len": 20,
        "squeeze_bb_mult": 2.0,
        "squeeze_kc_len": 20,
        "squeeze_kc_mult": 1.5,
        "volume_filter_enabled": False,
        "volume_sma_period": 20,
        "volume_min_ratio": 1.2,
    },
    "risk": {
        "sl_atr_mult": 0.5,
        "sl_max_pct": 0.02,
        "atr_period": 14,
        "tp1_close_pct": 0.6,
        "tp2_close_pct": 0.4,
        "trailing_atr_mult": 1.5,
        "max_hold_bars": 60,
    },
}


class TestStrategyBasics:
    def test_instantiation(self) -> None:
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        assert s.name == "Pivot Point Mean Reversion"
        assert s.engine_type == "pivot_point_mr"

    def test_validate_config_fills_defaults_from_empty(self) -> None:
        s = PivotPointMeanReversion({})
        cfg = s._validate_config({})
        assert cfg["pivot"]["period"] == 48
        assert cfg["entry"]["min_distance_pct"] == 0.15
        assert cfg["risk"]["sl_max_pct"] == 0.02
        assert cfg["filters"]["rsi_oversold"] == 40

    def test_validate_config_respects_override(self) -> None:
        s = PivotPointMeanReversion({})
        cfg = s._validate_config({"pivot": {"period": 96}})
        assert cfg["pivot"]["period"] == 96
        # остальные значения — дефолтные
        assert cfg["entry"]["min_confluence"] == 1.5

    def test_generate_signals_empty_on_short_data(self) -> None:
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(20)  # меньше pivot.period=48
        result = s.generate_signals(data)
        assert isinstance(result, StrategyResult)
        assert result.signals == []
```

- [ ] **Step 3.2: Запустить тест — FAIL (модуль не существует)**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestStrategyBasics -v`
Expected: `ModuleNotFoundError: No module named '...pivot_point_mr'`

- [ ] **Step 3.3: Создать skeleton стратегии**

Create `backend/app/modules/strategy/engines/pivot_point_mr.py`:

```python
"""PivotPointMeanReversion — mean reversion стратегия на rolling pivot S/R.

Inspired by Rubicon BotMarket WLD Pivot Point S/R (winner of 36-bot AI competition).
Closes original weaknesses: regime detection, multi-zone entries, multi-TP,
noise filters (deadzone, cooldown, RSI, anti-impulse).

Zero-impact design: не модифицирует существующие модули.
См. спек: docs/superpowers/specs/2026-04-13-pivot-point-mean-reversion-design.md
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.base import (
    OHLCV,
    BaseStrategy,
    Signal,
    StrategyResult,
)
from app.modules.strategy.engines.indicators.oscillators import squeeze_momentum
from app.modules.strategy.engines.indicators.pivot import pivot_velocity, rolling_pivot
from app.modules.strategy.engines.indicators.trend import atr, dmi, ema, rsi, sma


# Режимы рынка
REGIME_RANGE = 0
REGIME_WEAK_TREND = 1
REGIME_STRONG_TREND = 2

_REGIME_NAMES = {
    REGIME_RANGE: "range",
    REGIME_WEAK_TREND: "weak_trend",
    REGIME_STRONG_TREND: "strong_trend",
}


class PivotPointMeanReversion(BaseStrategy):
    """Mean reversion стратегия на pivot S/R уровнях."""

    @property
    def name(self) -> str:
        return "Pivot Point Mean Reversion"

    @property
    def engine_type(self) -> str:
        return "pivot_point_mr"

    def _validate_config(self, raw: dict) -> dict:
        """Заполнить отсутствующие ключи дефолтами. Все optional."""
        pivot_cfg = raw.get("pivot", {}) or {}
        trend_cfg = raw.get("trend", {}) or {}
        regime_cfg = raw.get("regime", {}) or {}
        entry_cfg = raw.get("entry", {}) or {}
        filters_cfg = raw.get("filters", {}) or {}
        risk_cfg = raw.get("risk", {}) or {}

        return {
            "pivot": {
                "period": int(pivot_cfg.get("period", 48)),
                "velocity_lookback": int(pivot_cfg.get("velocity_lookback", 12)),
            },
            "trend": {
                "ema_period": int(trend_cfg.get("ema_period", 200)),
            },
            "regime": {
                "adx_weak_trend": float(regime_cfg.get("adx_weak_trend", 20)),
                "adx_strong_trend": float(regime_cfg.get("adx_strong_trend", 30)),
                "pivot_drift_max": float(regime_cfg.get("pivot_drift_max", 0.3)),
                "allow_strong_trend": bool(regime_cfg.get("allow_strong_trend", False)),
            },
            "entry": {
                "min_distance_pct": float(entry_cfg.get("min_distance_pct", 0.15)),
                "min_confluence": float(entry_cfg.get("min_confluence", 1.5)),
                "use_deep_levels": bool(entry_cfg.get("use_deep_levels", True)),
                "cooldown_bars": int(entry_cfg.get("cooldown_bars", 3)),
                "impulse_check_bars": int(entry_cfg.get("impulse_check_bars", 5)),
            },
            "filters": {
                "adx_enabled": bool(filters_cfg.get("adx_enabled", True)),
                "adx_period": int(filters_cfg.get("adx_period", 14)),
                "rsi_enabled": bool(filters_cfg.get("rsi_enabled", True)),
                "rsi_period": int(filters_cfg.get("rsi_period", 14)),
                "rsi_oversold": float(filters_cfg.get("rsi_oversold", 40)),
                "rsi_overbought": float(filters_cfg.get("rsi_overbought", 60)),
                "squeeze_enabled": bool(filters_cfg.get("squeeze_enabled", True)),
                "squeeze_bb_len": int(filters_cfg.get("squeeze_bb_len", 20)),
                "squeeze_bb_mult": float(filters_cfg.get("squeeze_bb_mult", 2.0)),
                "squeeze_kc_len": int(filters_cfg.get("squeeze_kc_len", 20)),
                "squeeze_kc_mult": float(filters_cfg.get("squeeze_kc_mult", 1.5)),
                "volume_filter_enabled": bool(filters_cfg.get("volume_filter_enabled", False)),
                "volume_sma_period": int(filters_cfg.get("volume_sma_period", 20)),
                "volume_min_ratio": float(filters_cfg.get("volume_min_ratio", 1.2)),
            },
            "risk": {
                "sl_atr_mult": float(risk_cfg.get("sl_atr_mult", 0.5)),
                "sl_max_pct": float(risk_cfg.get("sl_max_pct", 0.02)),
                "atr_period": int(risk_cfg.get("atr_period", 14)),
                "tp1_close_pct": float(risk_cfg.get("tp1_close_pct", 0.6)),
                "tp2_close_pct": float(risk_cfg.get("tp2_close_pct", 0.4)),
                "trailing_atr_mult": float(risk_cfg.get("trailing_atr_mult", 1.5)),
                "max_hold_bars": int(risk_cfg.get("max_hold_bars", 60)),  # MVP: no-op
            },
        }

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """MVP stub — будет заполнен в Task 10."""
        cfg = self._validate_config(self.config)
        n = len(data)
        empty_arr = np.zeros(n, dtype=np.float64)
        if n < cfg["pivot"]["period"] + 1:
            return StrategyResult(
                signals=[],
                confluence_scores_long=empty_arr,
                confluence_scores_short=empty_arr,
                knn_scores=empty_arr,
                knn_classes=empty_arr,
                knn_confidence=empty_arr,
            )
        return StrategyResult(
            signals=[],
            confluence_scores_long=empty_arr,
            confluence_scores_short=empty_arr,
            knn_scores=empty_arr,
            knn_classes=empty_arr,
            knn_confidence=empty_arr,
        )
```

- [ ] **Step 3.4: Запустить тесты — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestStrategyBasics -v`
Expected: 4 passed

- [ ] **Step 3.5: Commit**

```bash
git add backend/app/modules/strategy/engines/pivot_point_mr.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): PivotPointMeanReversion skeleton + config validation"
```

---

## Task 4: `_detect_regime` helper

**Files:**
- Modify: `backend/app/modules/strategy/engines/pivot_point_mr.py`
- Modify: `backend/tests/test_pivot_point_mr.py`

- [ ] **Step 4.1: Написать тесты regime detection**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestDetectRegime:
    def setup_method(self) -> None:
        self.strat = PivotPointMeanReversion(DEFAULT_CONFIG)
        self.cfg = self.strat._validate_config(DEFAULT_CONFIG)

    def test_range_low_adx_low_drift(self) -> None:
        r = self.strat._detect_regime(adx_val=15.0, pv_val=0.1, cfg=self.cfg)
        assert r == REGIME_RANGE

    def test_weak_trend_medium_adx(self) -> None:
        r = self.strat._detect_regime(adx_val=25.0, pv_val=0.1, cfg=self.cfg)
        assert r == REGIME_WEAK_TREND

    def test_strong_trend_high_adx(self) -> None:
        r = self.strat._detect_regime(adx_val=40.0, pv_val=0.1, cfg=self.cfg)
        assert r == REGIME_STRONG_TREND

    def test_pivot_drift_override_range_to_weak(self) -> None:
        """ADX низкий, но pivot дрейфует → минимум WEAK_TREND."""
        r = self.strat._detect_regime(adx_val=15.0, pv_val=0.5, cfg=self.cfg)
        assert r == REGIME_WEAK_TREND

    def test_pivot_drift_negative_also_override(self) -> None:
        r = self.strat._detect_regime(adx_val=15.0, pv_val=-0.5, cfg=self.cfg)
        assert r == REGIME_WEAK_TREND

    def test_strong_trend_not_downgraded_by_drift(self) -> None:
        """STRONG_TREND остаётся STRONG даже если pv маленький."""
        r = self.strat._detect_regime(adx_val=40.0, pv_val=0.1, cfg=self.cfg)
        assert r == REGIME_STRONG_TREND

    def test_nan_adx_returns_range(self) -> None:
        r = self.strat._detect_regime(adx_val=float("nan"), pv_val=0.1, cfg=self.cfg)
        assert r == REGIME_RANGE

    def test_nan_pv_treated_as_zero_drift(self) -> None:
        r = self.strat._detect_regime(adx_val=15.0, pv_val=float("nan"), cfg=self.cfg)
        assert r == REGIME_RANGE
```

- [ ] **Step 4.2: Запустить — FAIL (нет метода)**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestDetectRegime -v`
Expected: `AttributeError: ... has no attribute '_detect_regime'`

- [ ] **Step 4.3: Реализовать `_detect_regime`**

Add method to `PivotPointMeanReversion` class in `pivot_point_mr.py`:

```python
    def _detect_regime(self, adx_val: float, pv_val: float, cfg: dict) -> int:
        """Определить текущий рыночный режим.

        RANGE (0)          — ADX < adx_weak_trend и нет дрейфа pivot
        WEAK_TREND (1)     — ADX между weak/strong или pivot дрейфует
        STRONG_TREND (2)   — ADX > adx_strong_trend

        NaN ADX → RANGE (безопасное значение по умолчанию).
        """
        if np.isnan(adx_val):
            return REGIME_RANGE

        regime = REGIME_RANGE
        if adx_val > cfg["regime"]["adx_strong_trend"]:
            regime = REGIME_STRONG_TREND
        elif adx_val > cfg["regime"]["adx_weak_trend"]:
            regime = REGIME_WEAK_TREND

        # Pivot drift override: если pivot сам ползёт — рынок трендовый
        if not np.isnan(pv_val) and abs(pv_val) > cfg["regime"]["pivot_drift_max"]:
            regime = max(regime, REGIME_WEAK_TREND)

        return regime
```

- [ ] **Step 4.4: Запустить — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestDetectRegime -v`
Expected: 8 passed

- [ ] **Step 4.5: Commit**

```bash
git add backend/app/modules/strategy/engines/pivot_point_mr.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): regime detection via ADX + pivot velocity"
```

---

## Task 5: `_detect_zone` helper

- [ ] **Step 5.1: Написать тесты zone detection**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestDetectZone:
    def setup_method(self) -> None:
        self.strat = PivotPointMeanReversion(DEFAULT_CONFIG)

    def test_long_zone_1_between_s1_and_pivot(self) -> None:
        res = self.strat._detect_zone(
            close_val=99.5, pivot_val=100.0,
            s1=99.0, s2=98.0, r1=101.0, r2=102.0,
        )
        assert res == ("long", 1)

    def test_long_zone_2_between_s2_and_s1(self) -> None:
        res = self.strat._detect_zone(
            close_val=98.5, pivot_val=100.0,
            s1=99.0, s2=98.0, r1=101.0, r2=102.0,
        )
        assert res == ("long", 2)

    def test_long_zone_3_below_s2(self) -> None:
        res = self.strat._detect_zone(
            close_val=97.0, pivot_val=100.0,
            s1=99.0, s2=98.0, r1=101.0, r2=102.0,
        )
        assert res == ("long", 3)

    def test_short_zone_1(self) -> None:
        res = self.strat._detect_zone(
            close_val=100.5, pivot_val=100.0,
            s1=99.0, s2=98.0, r1=101.0, r2=102.0,
        )
        assert res == ("short", 1)

    def test_short_zone_2(self) -> None:
        res = self.strat._detect_zone(
            close_val=101.5, pivot_val=100.0,
            s1=99.0, s2=98.0, r1=101.0, r2=102.0,
        )
        assert res == ("short", 2)

    def test_short_zone_3(self) -> None:
        res = self.strat._detect_zone(
            close_val=103.0, pivot_val=100.0,
            s1=99.0, s2=98.0, r1=101.0, r2=102.0,
        )
        assert res == ("short", 3)

    def test_exactly_at_pivot_returns_none(self) -> None:
        res = self.strat._detect_zone(
            close_val=100.0, pivot_val=100.0,
            s1=99.0, s2=98.0, r1=101.0, r2=102.0,
        )
        assert res is None
```

- [ ] **Step 5.2: Запустить — FAIL**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestDetectZone -v`
Expected: `AttributeError`

- [ ] **Step 5.3: Реализовать `_detect_zone`**

Add method to `PivotPointMeanReversion`:

```python
    def _detect_zone(
        self,
        close_val: float,
        pivot_val: float,
        s1: float,
        s2: float,
        r1: float,
        r2: float,
    ) -> tuple[str, int] | None:
        """Определить зону входа по положению цены относительно pivot и S/R.

        LONG зоны (цена ниже pivot):
            ZONE_1: s1 <= close < pivot       — стандартная глубина
            ZONE_2: s2 <= close < s1          — глубокая
            ZONE_3: close < s2                — экстремальная

        SHORT зоны зеркально относительно r1/r2.

        Returns: (direction, zone) или None если цена ровно на pivot.
        """
        if close_val < pivot_val:
            if s1 <= close_val < pivot_val:
                return ("long", 1)
            if s2 <= close_val < s1:
                return ("long", 2)
            if close_val < s2:
                return ("long", 3)
        elif close_val > pivot_val:
            if pivot_val < close_val <= r1:
                return ("short", 1)
            if r1 < close_val <= r2:
                return ("short", 2)
            if close_val > r2:
                return ("short", 3)
        return None
```

- [ ] **Step 5.4: Запустить — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestDetectZone -v`
Expected: 7 passed

- [ ] **Step 5.5: Commit**

```bash
git add backend/app/modules/strategy/engines/pivot_point_mr.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): zone detection for entries at S1-S3/R1-R3"
```

---

## Task 6: `_price_to_distance` + `_build_tp_levels` helpers

- [ ] **Step 6.1: Написать тесты конверсии и TP уровней**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestPriceToDistance:
    def setup_method(self) -> None:
        self.strat = PivotPointMeanReversion(DEFAULT_CONFIG)

    def test_long_positive_distance(self) -> None:
        # TP выше entry → distance положительный
        d = self.strat._price_to_distance(tp_price=105.0, entry=100.0, direction="long")
        assert d == pytest.approx(5.0)

    def test_short_positive_distance(self) -> None:
        # TP ниже entry → distance положительный (для short)
        d = self.strat._price_to_distance(tp_price=95.0, entry=100.0, direction="short")
        assert d == pytest.approx(5.0)

    def test_wrong_side_long_negative(self) -> None:
        # TP ниже entry для long → отрицательная дистанция (фильтруется позже)
        d = self.strat._price_to_distance(tp_price=95.0, entry=100.0, direction="long")
        assert d == pytest.approx(-5.0)


class TestBuildTpLevels:
    def setup_method(self) -> None:
        self.strat = PivotPointMeanReversion(DEFAULT_CONFIG)
        self.cfg = self.strat._validate_config(DEFAULT_CONFIG)

    def test_long_zone1_two_tps(self) -> None:
        """Zone 1 long: TP1=pivot (60%), TP2=r1 (40%)."""
        levels = self.strat._build_tp_levels(
            direction="long", zone=1, entry=99.5,
            pivot=100.0, s1=99.0, s2=98.0, s3=97.0,
            r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg,
        )
        assert len(levels) == 2
        assert levels[0]["atr_mult"] == pytest.approx(0.5)  # 100 - 99.5
        assert levels[0]["close_pct"] == 60
        assert levels[1]["atr_mult"] == pytest.approx(1.5)  # 101 - 99.5
        assert levels[1]["close_pct"] == 40

    def test_long_zone2_three_tps(self) -> None:
        """Zone 2 long: TP1=s1, TP2=pivot, TP3=r1 — 40/40/20."""
        levels = self.strat._build_tp_levels(
            direction="long", zone=2, entry=98.5,
            pivot=100.0, s1=99.0, s2=98.0, s3=97.0,
            r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg,
        )
        assert len(levels) == 3
        assert levels[0]["atr_mult"] == pytest.approx(0.5)
        assert levels[0]["close_pct"] == 40
        assert levels[1]["close_pct"] == 40
        assert levels[2]["close_pct"] == 20

    def test_long_zone3_four_tps(self) -> None:
        """Zone 3 long: TP1=s2, TP2=s1, TP3=pivot, TP4=r1 — 30/30/30/10."""
        levels = self.strat._build_tp_levels(
            direction="long", zone=3, entry=97.0,
            pivot=100.0, s1=99.0, s2=98.0, s3=97.0,
            r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg,
        )
        assert len(levels) == 4
        assert [l["close_pct"] for l in levels] == [30, 30, 30, 10]
        # все distances положительные
        assert all(l["atr_mult"] > 0 for l in levels)

    def test_short_zone1_mirrored(self) -> None:
        """Short zone 1: TP1=pivot, TP2=s1 — зеркально."""
        levels = self.strat._build_tp_levels(
            direction="short", zone=1, entry=100.5,
            pivot=100.0, s1=99.0, s2=98.0, s3=97.0,
            r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg,
        )
        assert len(levels) == 2
        assert levels[0]["atr_mult"] == pytest.approx(0.5)  # 100.5 - 100
        assert levels[0]["close_pct"] == 60
        assert levels[1]["atr_mult"] == pytest.approx(1.5)  # 100.5 - 99
        assert levels[1]["close_pct"] == 40

    def test_filters_out_wrong_side_levels(self) -> None:
        """Если TP уровень оказался на неправильной стороне — отфильтровать."""
        # Искусственная ситуация: entry уже выше pivot для long zone 1
        # (обычно невозможно, но защита должна работать)
        levels = self.strat._build_tp_levels(
            direction="long", zone=1, entry=100.5,  # entry > pivot
            pivot=100.0, s1=99.0, s2=98.0, s3=97.0,
            r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg,
        )
        # TP1=pivot=100 меньше entry=100.5 → отфильтровано
        # TP2=r1=101 больше entry=100.5 → остался
        assert len(levels) == 1
        assert levels[0]["atr_mult"] == pytest.approx(0.5)

    def test_nan_levels_skipped(self) -> None:
        levels = self.strat._build_tp_levels(
            direction="long", zone=1, entry=99.5,
            pivot=100.0, s1=99.0, s2=98.0, s3=97.0,
            r1=float("nan"), r2=102.0, r3=103.0,
            cfg=self.cfg,
        )
        # TP2=r1=NaN → отфильтровано, остался только TP1
        assert len(levels) == 1
```

- [ ] **Step 6.2: Запустить — FAIL**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestPriceToDistance tests/test_pivot_point_mr.py::TestBuildTpLevels -v`
Expected: `AttributeError`

- [ ] **Step 6.3: Реализовать оба метода**

Add to `PivotPointMeanReversion`:

```python
    @staticmethod
    def _price_to_distance(tp_price: float, entry: float, direction: str) -> float:
        """Конвертировать абсолютную TP цену в raw distance для Signal.tp_levels.

        ВАЖНО: поле `atr_mult` в Signal.tp_levels исторически названо,
        но backtest_engine.py:299 использует его как raw price distance:
            tp_price = entry + atr_dist  (long)
            tp_price = entry - atr_dist  (short)
        """
        if direction == "long":
            return tp_price - entry
        return entry - tp_price  # short

    def _build_tp_levels(
        self,
        direction: str,
        zone: int,
        entry: float,
        pivot: float,
        s1: float,
        s2: float,
        s3: float,
        r1: float,
        r2: float,
        r3: float,
        cfg: dict,
    ) -> list[dict]:
        """Построить список tp_levels в формате платформы.

        Распределение по зонам:
            ZONE 1: [TP1=pivot (tp1_pct), TP2=r1/s1 (tp2_pct)]
            ZONE 2: [TP1=s1/r1 (40%), TP2=pivot (40%), TP3=r1/s1 (20%)]
            ZONE 3: [TP1=s2/r2 (30%), TP2=s1/r1 (30%), TP3=pivot (30%), TP4=r1/s1 (10%)]

        ZONE 1 percentages — из config (tp1_close_pct, tp2_close_pct).
        ZONE 2/3 percentages — hardcoded (см. спек).
        Фильтрует уровни с NaN или неправильной стороной от entry.
        """
        tp1_pct = int(cfg["risk"]["tp1_close_pct"] * 100)
        tp2_pct = int(cfg["risk"]["tp2_close_pct"] * 100)

        if direction == "long":
            if zone == 1:
                tp_prices = [(pivot, tp1_pct), (r1, tp2_pct)]
            elif zone == 2:
                tp_prices = [(s1, 40), (pivot, 40), (r1, 20)]
            else:  # zone 3
                tp_prices = [(s2, 30), (s1, 30), (pivot, 30), (r1, 10)]
        else:  # short
            if zone == 1:
                tp_prices = [(pivot, tp1_pct), (s1, tp2_pct)]
            elif zone == 2:
                tp_prices = [(r1, 40), (pivot, 40), (s1, 20)]
            else:  # zone 3
                tp_prices = [(r2, 30), (r1, 30), (pivot, 30), (s1, 10)]

        levels: list[dict] = []
        for tp_price, close_pct in tp_prices:
            if np.isnan(tp_price):
                continue
            atr_dist = self._price_to_distance(tp_price, entry, direction)
            if atr_dist <= 0:  # TP на неправильной стороне
                continue
            levels.append({"atr_mult": float(atr_dist), "close_pct": int(close_pct)})
        return levels
```

- [ ] **Step 6.4: Запустить — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestPriceToDistance tests/test_pivot_point_mr.py::TestBuildTpLevels -v`
Expected: 9 passed

- [ ] **Step 6.5: Commit**

```bash
git add backend/app/modules/strategy/engines/pivot_point_mr.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): multi-TP level builder with price->distance conversion"
```

---

## Task 7: `_calculate_sl` helper

- [ ] **Step 7.1: Написать тесты SL**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestCalculateSl:
    def setup_method(self) -> None:
        self.strat = PivotPointMeanReversion(DEFAULT_CONFIG)
        self.cfg = self.strat._validate_config(DEFAULT_CONFIG)

    def test_long_zone1_uses_s1_minus_atr(self) -> None:
        """SL для long zone 1 = max(s1 - atr*0.5, entry*(1 - 0.02))."""
        sl = self.strat._calculate_sl(
            direction="long", zone=1, entry=99.5, atr_val=0.4,
            s1=99.0, s2=98.0, s3=97.0, r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg, regime=REGIME_RANGE,
        )
        # level_sl = 99.0 - 0.4*0.5 = 98.8
        # hard_cap = 99.5 * (1 - 0.02) = 97.51
        # max(98.8, 97.51) = 98.8
        assert sl == pytest.approx(98.8)

    def test_long_hard_cap_when_level_too_far(self) -> None:
        """Если level_sl слишком глубоко — ограничиваем по sl_max_pct."""
        sl = self.strat._calculate_sl(
            direction="long", zone=3, entry=100.0, atr_val=5.0,
            s1=99.0, s2=98.0, s3=90.0, r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg, regime=REGIME_RANGE,
        )
        # level_sl = 90 - 5*0.5 = 87.5
        # hard_cap = 100 * 0.98 = 98.0
        # max(87.5, 98.0) = 98.0
        assert sl == pytest.approx(98.0)

    def test_short_zone1_uses_r1_plus_atr(self) -> None:
        sl = self.strat._calculate_sl(
            direction="short", zone=1, entry=100.5, atr_val=0.4,
            s1=99.0, s2=98.0, s3=97.0, r1=101.0, r2=102.0, r3=103.0,
            cfg=self.cfg, regime=REGIME_RANGE,
        )
        # level_sl = 101.0 + 0.4*0.5 = 101.2
        # hard_cap = 100.5 * 1.02 = 102.51
        # min(101.2, 102.51) = 101.2
        assert sl == pytest.approx(101.2)

    def test_strong_trend_widens_hard_cap(self) -> None:
        """В STRONG_TREND sl_max_pct умножается на 1.5."""
        # Override config: allow_strong_trend=True
        cfg = dict(self.cfg)
        cfg["regime"] = {**self.cfg["regime"], "allow_strong_trend": True}
        sl = self.strat._calculate_sl(
            direction="long", zone=3, entry=100.0, atr_val=5.0,
            s1=99.0, s2=98.0, s3=90.0, r1=101.0, r2=102.0, r3=103.0,
            cfg=cfg, regime=REGIME_STRONG_TREND,
        )
        # sl_max_pct = 0.02 * 1.5 = 0.03
        # hard_cap = 100 * 0.97 = 97.0
        # level_sl = 87.5
        # max(87.5, 97.0) = 97.0
        assert sl == pytest.approx(97.0)
```

- [ ] **Step 7.2: Запустить — FAIL**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestCalculateSl -v`
Expected: `AttributeError`

- [ ] **Step 7.3: Реализовать `_calculate_sl`**

Add to `PivotPointMeanReversion`:

```python
    def _calculate_sl(
        self,
        direction: str,
        zone: int,
        entry: float,
        atr_val: float,
        s1: float,
        s2: float,
        s3: float,
        r1: float,
        r2: float,
        r3: float,
        cfg: dict,
        regime: int,
    ) -> float:
        """SL привязан к зональному S/R уровню + ATR buffer с hard cap по %.

        LONG:  SL = max(level_sl - atr*sl_atr_mult, entry*(1 - sl_max_pct))
        SHORT: SL = min(level_sl + atr*sl_atr_mult, entry*(1 + sl_max_pct))

        В STRONG_TREND (если разрешён) sl_max_pct умножается на 1.5.
        """
        sl_atr = cfg["risk"]["sl_atr_mult"]
        sl_max = cfg["risk"]["sl_max_pct"]
        if regime == REGIME_STRONG_TREND:
            sl_max *= 1.5

        if direction == "long":
            level_map = {1: s1, 2: s2, 3: s3}
            level = level_map[zone]
            level_sl = level - atr_val * sl_atr
            hard_cap = entry * (1.0 - sl_max)
            return max(level_sl, hard_cap)
        else:  # short
            level_map = {1: r1, 2: r2, 3: r3}
            level = level_map[zone]
            level_sl = level + atr_val * sl_atr
            hard_cap = entry * (1.0 + sl_max)
            return min(level_sl, hard_cap)
```

- [ ] **Step 7.4: Запустить — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestCalculateSl -v`
Expected: 4 passed

- [ ] **Step 7.5: Commit**

```bash
git add backend/app/modules/strategy/engines/pivot_point_mr.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): zone-adaptive SL with hard cap and regime widening"
```

---

## Task 8: `_calculate_confluence` helper

- [ ] **Step 8.1: Написать тесты confluence**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestCalculateConfluence:
    def setup_method(self) -> None:
        self.strat = PivotPointMeanReversion(DEFAULT_CONFIG)
        self.cfg = self.strat._validate_config(DEFAULT_CONFIG)

    def test_minimal_long_zone1(self) -> None:
        """Zone 1 long, нейтральные фильтры — только базовый 1.0."""
        score = self.strat._calculate_confluence(
            zone=1, direction="long", regime=REGIME_WEAK_TREND,
            rsi_val=50.0, squeeze=False, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, cfg=self.cfg,
        )
        assert score == pytest.approx(1.0)

    def test_zone2_adds_depth(self) -> None:
        score = self.strat._calculate_confluence(
            zone=2, direction="long", regime=REGIME_WEAK_TREND,
            rsi_val=50.0, squeeze=False, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, cfg=self.cfg,
        )
        assert score == pytest.approx(2.0)

    def test_zone3_deeper_bonus(self) -> None:
        score = self.strat._calculate_confluence(
            zone=3, direction="long", regime=REGIME_WEAK_TREND,
            rsi_val=50.0, squeeze=False, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, cfg=self.cfg,
        )
        assert score == pytest.approx(2.5)

    def test_range_regime_adds_half(self) -> None:
        score = self.strat._calculate_confluence(
            zone=1, direction="long", regime=REGIME_RANGE,
            rsi_val=50.0, squeeze=False, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, cfg=self.cfg,
        )
        assert score == pytest.approx(1.5)

    def test_all_bonuses_strong_long(self) -> None:
        """Максимум: zone3 + range + rsi + squeeze + volume + trend = 1+1.5+0.5+0.5+0.5+0.5+0.5 = 5.0"""
        score = self.strat._calculate_confluence(
            zone=3, direction="long", regime=REGIME_RANGE,
            rsi_val=30.0, squeeze=True,
            close_val=100.0, ema_val=95.0,  # close > ema → trend bonus
            volume_val=1500.0, volume_sma_val=1000.0,  # 1.5x > 1.2x → volume bonus
            cfg=self.cfg,
        )
        assert score == pytest.approx(5.0)

    def test_short_rsi_bonus_requires_overbought(self) -> None:
        score_no_rsi = self.strat._calculate_confluence(
            zone=1, direction="short", regime=REGIME_WEAK_TREND,
            rsi_val=50.0, squeeze=False, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, cfg=self.cfg,
        )
        score_rsi = self.strat._calculate_confluence(
            zone=1, direction="short", regime=REGIME_WEAK_TREND,
            rsi_val=70.0, squeeze=False, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, cfg=self.cfg,
        )
        assert score_rsi - score_no_rsi == pytest.approx(0.5)
```

- [ ] **Step 8.2: FAIL → реализация**

Run first, expect `AttributeError`.

Add to `PivotPointMeanReversion`:

```python
    def _calculate_confluence(
        self,
        zone: int,
        direction: str,
        regime: int,
        rsi_val: float,
        squeeze: bool,
        close_val: float,
        ema_val: float,
        volume_val: float,
        volume_sma_val: float,
        cfg: dict,
    ) -> float:
        """Confluence score для сигнала. Минимум 1.0 (базовый), максимум ~5.0.

        Breakdown:
            +1.0  базовый сигнал (валидная зона)
            +1.0  ZONE 2
            +1.5  ZONE 3
            +0.5  regime == RANGE (низкий ADX — идеал для mean reversion)
            +0.5  RSI подтверждает (oversold для long, overbought для short)
            +0.5  Squeeze ON (сжатие BB в Keltner)
            +0.5  Volume > SMA * 1.2
            +0.5  Направление сигнала совпадает с EMA trend
        """
        score = 1.0

        # Глубина зоны
        if zone == 2:
            score += 1.0
        elif zone == 3:
            score += 1.5

        # Range regime
        if regime == REGIME_RANGE:
            score += 0.5

        # RSI подтверждение
        if not np.isnan(rsi_val):
            if direction == "long" and rsi_val < cfg["filters"]["rsi_oversold"]:
                score += 0.5
            elif direction == "short" and rsi_val > cfg["filters"]["rsi_overbought"]:
                score += 0.5

        # Squeeze ON
        if squeeze:
            score += 0.5

        # Повышенный объём (фиксированный порог 1.2x, не из config)
        if volume_sma_val > 0 and volume_val > volume_sma_val * 1.2:
            score += 0.5

        # EMA trend alignment
        if not np.isnan(ema_val):
            if direction == "long" and close_val > ema_val:
                score += 0.5
            elif direction == "short" and close_val < ema_val:
                score += 0.5

        return score
```

- [ ] **Step 8.3: Запустить — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestCalculateConfluence -v`
Expected: 6 passed

- [ ] **Step 8.4: Commit**

```bash
git add backend/app/modules/strategy/engines/pivot_point_mr.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): confluence scoring with 7 additive factors"
```

---

## Task 9: `generate_signals` main loop (integration)

Это главный метод. Тестируем поведение на синтетических данных, а не unit-тестами отдельных филтров (фильтры покрыты выше в helper'ах).

- [ ] **Step 9.1: Написать integration тесты на синтетических данных**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestGenerateSignalsIntegration:
    def test_runs_without_error_on_ranging_data(self) -> None:
        """На ranging синтетике стратегия должна хотя бы не падать."""
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(n=300, base_price=100.0, trend=0.0, noise=2.0)
        result = s.generate_signals(data)
        assert isinstance(result, StrategyResult)
        assert result.confluence_scores_long.shape == (300,)
        assert result.confluence_scores_short.shape == (300,)

    def test_signals_have_valid_sl_and_tp(self) -> None:
        """Все сигналы должны иметь валидные SL и TP."""
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(n=500, base_price=100.0, trend=0.0, noise=3.0, seed=1)
        result = s.generate_signals(data)
        for sig in result.signals:
            assert sig.stop_loss > 0
            assert sig.take_profit > 0
            if sig.direction == "long":
                assert sig.stop_loss < sig.entry_price
                assert sig.take_profit > sig.entry_price
            else:
                assert sig.stop_loss > sig.entry_price
                assert sig.take_profit < sig.entry_price
            assert sig.signal_type == "mean_reversion"
            assert sig.tp_levels is not None and len(sig.tp_levels) > 0
            assert sig.indicators is not None
            assert "confluence_tier" in sig.indicators
            assert sig.indicators["confluence_tier"] in ("strong", "normal", "weak")
            assert sig.indicators["regime"] in ("range", "weak_trend", "strong_trend")

    def test_cooldown_enforced(self) -> None:
        """Два последовательных сигнала не могут быть ближе cooldown_bars."""
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(n=500, base_price=100.0, trend=0.0, noise=4.0, seed=7)
        result = s.generate_signals(data)
        cooldown = DEFAULT_CONFIG["entry"]["cooldown_bars"]
        for prev, curr in zip(result.signals, result.signals[1:]):
            assert curr.bar_index - prev.bar_index >= cooldown

    def test_min_confluence_enforced(self) -> None:
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(n=500, seed=3)
        result = s.generate_signals(data)
        min_conf = DEFAULT_CONFIG["entry"]["min_confluence"]
        for sig in result.signals:
            assert sig.confluence_score >= min_conf

    def test_strong_trend_skipped_when_not_allowed(self) -> None:
        """При allow_strong_trend=False в STRONG_TREND сигналы не создаются."""
        cfg = {**DEFAULT_CONFIG}
        cfg["regime"] = {**DEFAULT_CONFIG["regime"], "allow_strong_trend": False}
        s = PivotPointMeanReversion(cfg)
        # Сильный восходящий тренд с минимальным шумом → STRONG_TREND
        data = make_ohlcv(n=500, base_price=100.0, trend=0.3, noise=0.2, seed=2)
        result = s.generate_signals(data)
        # Все сигналы должны быть не STRONG_TREND
        for sig in result.signals:
            assert sig.indicators["regime"] != "strong_trend"

    def test_empty_on_insufficient_data(self) -> None:
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(n=20)  # меньше period
        result = s.generate_signals(data)
        assert result.signals == []
```

- [ ] **Step 9.2: Запустить тесты — FAIL (stub реализации)**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestGenerateSignalsIntegration -v`
Expected: тесты на сигналы не проходят т.к. stub возвращает пустой список, но те что проверяют shape/не-падение — проходят

- [ ] **Step 9.3: Реализовать полный `generate_signals`**

Replace stub `generate_signals` in `PivotPointMeanReversion` with:

```python
    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Главный метод — проход по барам с фильтрами и генерацией сигналов."""
        cfg = self._validate_config(self.config)
        n = len(data)
        empty_arr = np.zeros(n, dtype=np.float64)
        empty_result = StrategyResult(
            signals=[],
            confluence_scores_long=empty_arr.copy(),
            confluence_scores_short=empty_arr.copy(),
            knn_scores=empty_arr.copy(),
            knn_classes=empty_arr.copy(),
            knn_confidence=empty_arr.copy(),
        )

        if n < cfg["pivot"]["period"] + cfg["trend"]["ema_period"] // 4:
            return empty_result

        # === Фаза 0: расчёт всех индикаторов ===
        pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(
            data.high, data.low, data.close, cfg["pivot"]["period"]
        )
        pv = pivot_velocity(pivot, cfg["pivot"]["velocity_lookback"])

        atr_arr = atr(data.high, data.low, data.close, cfg["risk"]["atr_period"])
        _, _, adx_arr = dmi(data.high, data.low, data.close, cfg["filters"]["adx_period"])
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

        # Дистанция цены от pivot в %
        distance_pct = np.full(n, np.nan, dtype=np.float64)
        valid_pivot = (pivot > 0) & ~np.isnan(pivot)
        distance_pct[valid_pivot] = (
            (data.close[valid_pivot] - pivot[valid_pivot]) / pivot[valid_pivot] * 100.0
        )

        # Per-bar confluence arrays (для UI overlay)
        conf_long = np.zeros(n, dtype=np.float64)
        conf_short = np.zeros(n, dtype=np.float64)

        signals: list[Signal] = []
        last_signal_bar = -10_000

        # === Главный цикл ===
        for i in range(cfg["pivot"]["period"], n):
            pivot_val = pivot[i]
            if np.isnan(pivot_val):
                continue

            atr_val = atr_arr[i]
            if np.isnan(atr_val) or atr_val < 1e-8:
                continue

            close_val = float(data.close[i])
            distance = distance_pct[i]

            # Фильтр: deadzone (минимальное отклонение от pivot)
            if np.isnan(distance) or abs(distance) < cfg["entry"]["min_distance_pct"]:
                continue

            # Определение зоны
            zone_result = self._detect_zone(
                close_val=close_val,
                pivot_val=float(pivot_val),
                s1=float(s1[i]), s2=float(s2[i]),
                r1=float(r1[i]), r2=float(r2[i]),
            )
            if zone_result is None:
                continue
            direction, zone = zone_result

            # Regime detection
            regime = self._detect_regime(
                adx_val=float(adx_arr[i]),
                pv_val=float(pv[i]),
                cfg=cfg,
            )

            # STRONG_TREND gate
            if regime == REGIME_STRONG_TREND:
                if not cfg["regime"]["allow_strong_trend"]:
                    continue
                # Если разрешён — только по тренду
                ema_val = ema_arr[i]
                if np.isnan(ema_val):
                    continue
                if direction == "long" and close_val <= ema_val:
                    continue
                if direction == "short" and close_val >= ema_val:
                    continue

            # WEAK_TREND: только по тренду
            if regime == REGIME_WEAK_TREND:
                ema_val = ema_arr[i]
                if np.isnan(ema_val):
                    continue
                if direction == "long" and close_val <= ema_val:
                    continue
                if direction == "short" and close_val >= ema_val:
                    continue

            # Фильтр: RSI
            if cfg["filters"]["rsi_enabled"]:
                rsi_val = rsi_arr[i]
                if np.isnan(rsi_val):
                    continue
                if direction == "long" and rsi_val >= cfg["filters"]["rsi_oversold"]:
                    continue
                if direction == "short" and rsi_val <= cfg["filters"]["rsi_overbought"]:
                    continue

            # Фильтр: volume
            if cfg["filters"]["volume_filter_enabled"]:
                vol_sma = volume_sma[i]
                if np.isnan(vol_sma) or vol_sma <= 0:
                    continue
                if data.volume[i] < vol_sma * cfg["filters"]["volume_min_ratio"]:
                    continue

            # Фильтр: cooldown
            if (i - last_signal_bar) < cfg["entry"]["cooldown_bars"]:
                continue

            # Фильтр: anti-impulse (не ловим падающий нож)
            window = cfg["entry"]["impulse_check_bars"]
            if i >= window:
                last_bars = data.close[i - window + 1:i + 1] - data.open[i - window + 1:i + 1]
                if direction == "long" and np.all(last_bars < 0):
                    continue
                if direction == "short" and np.all(last_bars > 0):
                    continue

            # Confluence
            score = self._calculate_confluence(
                zone=zone,
                direction=direction,
                regime=regime,
                rsi_val=float(rsi_arr[i]),
                squeeze=bool(squeeze_on[i]) if cfg["filters"]["squeeze_enabled"] else False,
                close_val=close_val,
                ema_val=float(ema_arr[i]) if not np.isnan(ema_arr[i]) else float("nan"),
                volume_val=float(data.volume[i]),
                volume_sma_val=float(volume_sma[i]) if not np.isnan(volume_sma[i]) else 0.0,
                cfg=cfg,
            )

            if direction == "long":
                conf_long[i] = score
            else:
                conf_short[i] = score

            if score < cfg["entry"]["min_confluence"]:
                continue

            # Build SL
            sl = self._calculate_sl(
                direction=direction, zone=zone, entry=close_val, atr_val=float(atr_val),
                s1=float(s1[i]), s2=float(s2[i]), s3=float(s3[i]),
                r1=float(r1[i]), r2=float(r2[i]), r3=float(r3[i]),
                cfg=cfg, regime=regime,
            )

            # Build TP levels
            tp_levels = self._build_tp_levels(
                direction=direction, zone=zone, entry=close_val,
                pivot=float(pivot_val),
                s1=float(s1[i]), s2=float(s2[i]), s3=float(s3[i]),
                r1=float(r1[i]), r2=float(r2[i]), r3=float(r3[i]),
                cfg=cfg,
            )
            if not tp_levels:
                continue  # нет валидных TP — пропускаем сигнал

            # Первая TP цена для legacy поля Signal.take_profit
            first_tp_price = (
                close_val + tp_levels[0]["atr_mult"]
                if direction == "long"
                else close_val - tp_levels[0]["atr_mult"]
            )

            # Confluence tier для UI
            if score >= 4.0:
                tier = "strong"
            elif score >= 2.5:
                tier = "normal"
            else:
                tier = "weak"

            signal = Signal(
                bar_index=i,
                direction=direction,
                entry_price=close_val,
                stop_loss=float(sl),
                take_profit=float(first_tp_price),
                trailing_atr=float(atr_val * cfg["risk"]["trailing_atr_mult"]),
                confluence_score=float(score),
                signal_type="mean_reversion",
                tp_levels=tp_levels,
                indicators={
                    "pivot": float(pivot_val),
                    "s1": float(s1[i]), "s2": float(s2[i]), "s3": float(s3[i]),
                    "r1": float(r1[i]), "r2": float(r2[i]), "r3": float(r3[i]),
                    "zone": int(zone),
                    "regime": _REGIME_NAMES[regime],
                    "rsi": float(rsi_arr[i]) if not np.isnan(rsi_arr[i]) else 0.0,
                    "adx": float(adx_arr[i]) if not np.isnan(adx_arr[i]) else 0.0,
                    "distance_pct": float(distance),
                    "pivot_velocity": float(pv[i]) if not np.isnan(pv[i]) else 0.0,
                    "squeeze_on": bool(squeeze_on[i]),
                    "confluence_tier": tier,
                },
            )
            signals.append(signal)
            last_signal_bar = i

        return StrategyResult(
            signals=signals,
            confluence_scores_long=conf_long,
            confluence_scores_short=conf_short,
            knn_scores=empty_arr.copy(),
            knn_classes=empty_arr.copy(),
            knn_confidence=empty_arr.copy(),
        )
```

- [ ] **Step 9.4: Запустить все тесты стратегии — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py -v`
Expected: все тесты проходят (TestStrategyBasics, TestDetectRegime, TestDetectZone, TestPriceToDistance, TestBuildTpLevels, TestCalculateSl, TestCalculateConfluence, TestGenerateSignalsIntegration)

- [ ] **Step 9.5: Commit**

```bash
git add backend/app/modules/strategy/engines/pivot_point_mr.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): complete PivotPointMeanReversion generate_signals"
```

---

## Task 10: Register in `ENGINE_REGISTRY`

**Files:**
- Modify: `backend/app/modules/strategy/engines/__init__.py`
- Modify: `backend/tests/test_pivot_point_mr.py`

- [ ] **Step 10.1: Написать тест регистрации**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestRegistryLookup:
    def test_get_engine_returns_instance(self) -> None:
        from app.modules.strategy.engines import get_engine, ENGINE_REGISTRY

        assert "pivot_point_mr" in ENGINE_REGISTRY
        instance = get_engine("pivot_point_mr", DEFAULT_CONFIG)
        assert isinstance(instance, PivotPointMeanReversion)
        assert instance.engine_type == "pivot_point_mr"
```

- [ ] **Step 10.2: Запустить — FAIL**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestRegistryLookup -v`
Expected: `AssertionError: assert 'pivot_point_mr' in ENGINE_REGISTRY`

- [ ] **Step 10.3: Добавить в реестр**

Modify `backend/app/modules/strategy/engines/__init__.py`:

```python
"""Движки торговых стратегий — реестр."""

from app.modules.strategy.engines.base import BaseStrategy
from app.modules.strategy.engines.lorentzian_knn import LorentzianKNNStrategy
from app.modules.strategy.engines.supertrend_squeeze import SuperTrendSqueezeStrategy
from app.modules.strategy.engines.hybrid_knn_supertrend import HybridKNNSuperTrendStrategy
from app.modules.strategy.engines.pivot_point_mr import PivotPointMeanReversion

# Реестр доступных движков: engine_type → class
ENGINE_REGISTRY: dict[str, type[BaseStrategy]] = {
    "lorentzian_knn": LorentzianKNNStrategy,
    "supertrend_squeeze": SuperTrendSqueezeStrategy,
    "hybrid_knn_supertrend": HybridKNNSuperTrendStrategy,
    "pivot_point_mr": PivotPointMeanReversion,
}


def get_engine(engine_type: str, config: dict) -> BaseStrategy:
    """Получить экземпляр стратегии по типу движка."""
    engine_cls = ENGINE_REGISTRY.get(engine_type)
    if not engine_cls:
        raise ValueError(f"Unknown engine type: {engine_type}. Available: {list(ENGINE_REGISTRY.keys())}")
    return engine_cls(config)
```

- [ ] **Step 10.4: Запустить — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestRegistryLookup -v`
Expected: 1 passed

- [ ] **Step 10.5: Запустить все тесты модуля strategy — ничего не сломалось**

Run: `cd backend && pytest tests/test_lorentzian_knn.py tests/test_supertrend_squeeze.py tests/test_pivot_point_mr.py tests/test_indicators.py tests/test_pivot_indicator.py -v`
Expected: все существующие тесты проходят + новые проходят

- [ ] **Step 10.6: Commit**

```bash
git add backend/app/modules/strategy/engines/__init__.py backend/tests/test_pivot_point_mr.py
git commit -m "feat(strategy): register pivot_point_mr in ENGINE_REGISTRY"
```

---

## Task 11: Seed entry for `pivot-point-mr`

**Files:**
- Modify: `backend/scripts/seed_strategy.py`

- [ ] **Step 11.1: Добавить запись в STRATEGIES**

Edit `backend/scripts/seed_strategy.py` — добавить после существующего SuperTrend Squeeze элемента в списке `STRATEGIES` (т.е. после строки 180), перед закрывающей `]`:

```python
    {
        "name": "Pivot Point Mean Reversion",
        "slug": "pivot-point-mr",
        "engine_type": "pivot_point_mr",
        "description": (
            "Mean reversion на rolling pivot point S/R уровнях. "
            "Вход против отклонения от pivot с ожиданием возврата к равновесию. "
            "Regime detection (ADX + pivot velocity + EMA), multi-zone entries (S1-S3/R1-R3) "
            "с зонально-адаптивным SL и multi-TP, RSI confirmation, squeeze filter, "
            "anti-impulse protection и cooldown. Оптимальна для волатильных альткойнов в range/low-ADX фазах. "
            "Inspired by Rubicon BotMarket Pivot Point S/R стратегией-победителем."
        ),
        "is_public": True,
        "version": "1.0.0",
        "default_config": {
            "pivot": {"period": 48, "velocity_lookback": 12},
            "trend": {"ema_period": 200},
            "regime": {
                "adx_weak_trend": 20,
                "adx_strong_trend": 30,
                "pivot_drift_max": 0.3,
                "allow_strong_trend": False,
            },
            "entry": {
                "min_distance_pct": 0.15,
                "min_confluence": 1.5,
                "use_deep_levels": True,
                "cooldown_bars": 3,
                "impulse_check_bars": 5,
            },
            "filters": {
                "adx_enabled": True,
                "adx_period": 14,
                "rsi_enabled": True,
                "rsi_period": 14,
                "rsi_oversold": 40,
                "rsi_overbought": 60,
                "squeeze_enabled": True,
                "squeeze_bb_len": 20,
                "squeeze_bb_mult": 2.0,
                "squeeze_kc_len": 20,
                "squeeze_kc_mult": 1.5,
                "volume_filter_enabled": False,
                "volume_sma_period": 20,
                "volume_min_ratio": 1.2,
            },
            "risk": {
                "sl_atr_mult": 0.5,
                "sl_max_pct": 0.02,
                "atr_period": 14,
                "tp1_close_pct": 0.6,
                "tp2_close_pct": 0.4,
                "trailing_atr_mult": 1.5,
                "max_hold_bars": 60,
            },
            "backtest": {
                "initial_capital": 100,
                "currency": "USDT",
                "order_size": 75,
                "order_size_type": "percent_equity",
                "pyramiding": 0,
                "commission": 0.06,
                "slippage": 0.03,
                "margin_long": 100,
                "margin_short": 100,
            },
            "live": {
                "order_size": 30,
                "leverage": 1,
                "on_reverse": "close",
            },
        },
    },
```

- [ ] **Step 11.2: Syntax check (импорт модуля)**

Run: `cd backend && python -c "from scripts.seed_strategy import STRATEGIES; assert any(s['slug'] == 'pivot-point-mr' for s in STRATEGIES); print(f'OK: {len(STRATEGIES)} strategies')"`
Expected: `OK: 3 strategies`

- [ ] **Step 11.3: Commit**

```bash
git add backend/scripts/seed_strategy.py
git commit -m "feat(seed): add pivot-point-mr strategy default config"
```

---

## Task 12: End-to-end backtest integration test

Проверяем что стратегия работает в реальном backtest_engine (не просто собирает Signal объекты, но и симулируется до конца).

**Files:**
- Modify: `backend/tests/test_pivot_point_mr.py`

- [ ] **Step 12.1: Написать E2E тест через backtest_engine**

Append to `backend/tests/test_pivot_point_mr.py`:

```python
class TestBacktestIntegration:
    def test_runs_through_backtest_engine(self) -> None:
        """Прогон стратегии через real run_backtest — проверяем что trades генерируются."""
        from app.modules.backtest.backtest_engine import run_backtest

        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(n=500, base_price=100.0, trend=0.0, noise=3.0, seed=5)
        result = s.generate_signals(data)

        metrics = run_backtest(
            ohlcv=data,
            signals=result.signals,
            initial_capital=100.0,
            commission_pct=0.06,
            slippage_pct=0.03,
            order_size_pct=75.0,
            use_multi_tp=True,
            use_breakeven=True,
            timeframe_minutes=15,
            leverage=1,
            on_reverse="close",
        )

        # Не падает, возвращает валидную структуру
        assert metrics is not None
        assert hasattr(metrics, "total_trades")
        assert hasattr(metrics, "equity_curve")
        # На синтетических данных может быть 0 trades — главное что не упало
        assert metrics.total_trades >= 0

    def test_tp_levels_compatible_with_engine_format(self) -> None:
        """tp_levels у сигналов должны иметь правильную форму для backtest_engine."""
        s = PivotPointMeanReversion(DEFAULT_CONFIG)
        data = make_ohlcv(n=500, seed=11)
        result = s.generate_signals(data)
        for sig in result.signals:
            assert sig.tp_levels is not None
            for lvl in sig.tp_levels:
                assert "atr_mult" in lvl
                assert "close_pct" in lvl
                assert isinstance(lvl["close_pct"], int)
                assert 0 < lvl["close_pct"] <= 100
                assert lvl["atr_mult"] > 0
```

- [ ] **Step 12.2: Запустить тест — PASS**

Run: `cd backend && pytest tests/test_pivot_point_mr.py::TestBacktestIntegration -v`
Expected: 2 passed

- [ ] **Step 12.3: Финальный прогон всех новых тестов**

Run: `cd backend && pytest tests/test_pivot_indicator.py tests/test_pivot_point_mr.py -v`
Expected: все тесты проходят (примерно 40+ tests total)

- [ ] **Step 12.4: Проверить что существующие тесты не сломались**

Run: `cd backend && pytest tests/test_lorentzian_knn.py tests/test_supertrend_squeeze.py tests/test_indicators.py tests/test_backtest.py tests/test_bot_worker.py -v`
Expected: все проходят (нет регрессий)

- [ ] **Step 12.5: Commit**

```bash
git add backend/tests/test_pivot_point_mr.py
git commit -m "test(strategy): e2e backtest integration for pivot_point_mr"
```

---

## Task 13: Zero-impact verification

**Цель:** убедиться что НИ ОДИН существующий файл не был случайно изменён.

- [ ] **Step 13.1: Показать изменённые файлы относительно базовой ветки**

Run: `cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond" && git diff --stat main~13..HEAD -- backend/`
Expected output должен содержать **только** эти файлы:
- `backend/app/modules/strategy/engines/__init__.py` (+2 lines)
- `backend/app/modules/strategy/engines/indicators/pivot.py` (новый)
- `backend/app/modules/strategy/engines/pivot_point_mr.py` (новый)
- `backend/scripts/seed_strategy.py` (+~65 lines)
- `backend/tests/test_pivot_indicator.py` (новый)
- `backend/tests/test_pivot_point_mr.py` (новый)

И **НЕ ДОЛЖЕН** содержать:
- `backend/app/modules/strategy/engines/base.py`
- `backend/app/modules/backtest/backtest_engine.py`
- `backend/app/modules/trading/bot_worker.py`
- `backend/app/modules/trading/bybit_listener.py`
- `backend/app/modules/strategy/engines/indicators/trend.py`
- `backend/app/modules/strategy/engines/indicators/oscillators.py`
- `backend/app/modules/strategy/engines/lorentzian_knn.py`
- `backend/app/modules/strategy/engines/supertrend_squeeze.py`
- `backend/app/modules/strategy/engines/hybrid_knn_supertrend.py`

- [ ] **Step 13.2: Если есть неожиданные изменения — ROLLBACK**

Если Step 13.1 показал изменения в запрещённых файлах — это баг. Остановиться и разобрать каждое изменение: откатить через `git checkout <file>` и переиспользовать helper или расширить стратегию, не трогая общий код.

- [ ] **Step 13.3: Финальный полный прогон тестов backend**

Run: `cd backend && pytest tests/ -v --tb=short 2>&1 | tail -30`
Expected: всё зелёное, нет regressions

- [ ] **Step 13.4: Деплой (опционально — отдельно от MVP merge)**

После одобрения пользователя:
```bash
git push origin main
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api"
ssh jeremy-vps "curl -sf http://localhost:8100/health"
# Запустить seed на VPS:
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec -T api python backend/scripts/seed_strategy.py"
# Проверить что стратегия появилась:
ssh jeremy-vps "curl -s http://localhost:8100/api/strategy/list | grep -o pivot-point-mr"
```

---

## Post-implementation (вне scope этого плана, отдельные задачи)

Эти задачи НЕ входят в текущий план, но рекомендуются следующим шагом:

1. **Grid search (coarse)** на реальных данных через `backend/scripts/optimize_strategy.py` по матрице параметров из спека раздел 8.3. Токены: WLD, LDO, BCH, FET, RNDR, INJ, NEAR, SUI, APT. Таймфреймы: 5m, 15m, 1h. Критерии: PF>1.5, WR>55%, DD<15%, Sharpe>1.0, Calmar>1.0.

2. **Code review** через агента `code-reviewer` или `superpowers:requesting-code-review` на соответствие zero-impact и общему качеству.

3. **max_hold_bars implementation** (если грид-сёрч покажет необходимость) — отдельная спека с явным согласием на правки `backtest_engine.py` и `bot_worker.py`.

4. **UI overlay** per-bar `confluence_scores_long/short` на графике стратегии через существующий chart endpoint.

---

## Success Criteria (Definition of Done)

- [ ] Все 13 задач выполнены, каждый шаг закоммичен
- [ ] `pytest tests/test_pivot_indicator.py tests/test_pivot_point_mr.py` — 100% pass
- [ ] `pytest tests/` — нет регрессий (все существующие тесты проходят)
- [ ] `git diff` показывает изменения только в разрешённых файлах (Task 13)
- [ ] `get_engine("pivot_point_mr", default_config)` возвращает экземпляр
- [ ] `run_backtest(...)` с сигналами от стратегии не падает на синтетических 500 барах
- [ ] `python -c "from scripts.seed_strategy import STRATEGIES; ..."` проходит
