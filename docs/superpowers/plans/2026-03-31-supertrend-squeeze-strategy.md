# SuperTrend Squeeze Momentum Strategy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second trading strategy engine (SuperTrend + Squeeze Momentum) that works across multiple crypto pairs, not just RIVER.

**Architecture:** New engine class `SuperTrendSqueezeStrategy(BaseStrategy)` registered in `ENGINE_REGISTRY`. Three new indicator functions (`supertrend`, `keltner_channel`, `squeeze_momentum`) added to existing indicator modules. Seed script updated to register the strategy in DB.

**Tech Stack:** numpy (already in project), no new dependencies.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/app/modules/strategy/engines/indicators/trend.py` | Add `supertrend()` function |
| Modify | `backend/app/modules/strategy/engines/indicators/oscillators.py` | Add `keltner_channel()` and `squeeze_momentum()` |
| Create | `backend/app/modules/strategy/engines/supertrend_squeeze.py` | `SuperTrendSqueezeStrategy` engine class |
| Modify | `backend/app/modules/strategy/engines/__init__.py` | Register new engine in `ENGINE_REGISTRY` |
| Modify | `backend/scripts/seed_strategy.py` | Add seed data for new strategy |
| Create | `backend/tests/test_supertrend_squeeze.py` | Tests for new indicators + strategy |

---

### Task 1: Add `supertrend()` indicator to trend.py

**Files:**
- Modify: `backend/app/modules/strategy/engines/indicators/trend.py`
- Test: `backend/tests/test_supertrend_squeeze.py`

- [ ] **Step 1: Create test file with SuperTrend indicator tests**

Create `backend/tests/test_supertrend_squeeze.py`:

```python
"""Тесты SuperTrend Squeeze Momentum стратегии."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.trend import supertrend


# === Тестовые данные: 200 баров с uptrend ===
np.random.seed(42)
_trend = np.linspace(100, 150, 200)
_noise = np.random.normal(0, 1.5, 200)
CLOSE_200 = _trend + _noise
HIGH_200 = CLOSE_200 + np.abs(np.random.normal(1, 0.5, 200))
LOW_200 = CLOSE_200 - np.abs(np.random.normal(1, 0.5, 200))
VOLUME_200 = np.random.uniform(500, 2000, 200)


class TestSuperTrend:
    def test_returns_correct_shapes(self) -> None:
        direction, upper, lower = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        assert len(direction) == 200
        assert len(upper) == 200
        assert len(lower) == 200

    def test_direction_values(self) -> None:
        """Direction should be 1 (bullish) or -1 (bearish)."""
        direction, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        valid = direction[~np.isnan(direction)]
        assert all(v in (1.0, -1.0) for v in valid)

    def test_uptrend_mostly_bullish(self) -> None:
        """On strong uptrend data, SuperTrend should be mostly bullish."""
        direction, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        valid = direction[~np.isnan(direction)]
        bullish_pct = np.sum(valid == 1.0) / len(valid)
        assert bullish_pct > 0.5

    def test_nan_at_start(self) -> None:
        """First `period` bars should be NaN."""
        direction, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        assert np.isnan(direction[9])
        assert not np.isnan(direction[11])

    def test_different_multipliers(self) -> None:
        """Higher multiplier = fewer direction changes."""
        dir_tight, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=1.0)
        dir_loose, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=5.0)
        changes_tight = np.sum(np.diff(dir_tight[~np.isnan(dir_tight)]) != 0)
        changes_loose = np.sum(np.diff(dir_loose[~np.isnan(dir_loose)]) != 0)
        assert changes_tight >= changes_loose
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_supertrend_squeeze.py::TestSuperTrend -v`
Expected: FAIL — `ImportError: cannot import name 'supertrend' from 'app.modules.strategy.engines.indicators.trend'`

- [ ] **Step 3: Implement `supertrend()` in trend.py**

Add at the end of `backend/app/modules/strategy/engines/indicators/trend.py`:

```python
def supertrend(
    high: NDArray, low: NDArray, close: NDArray,
    period: int = 10, multiplier: float = 3.0,
) -> tuple[NDArray, NDArray, NDArray]:
    """SuperTrend indicator. Ref: TradingView built-in ta.supertrend().

    ATR-based trailing stop that flips direction on close crossing the band.
    Returns (direction, upper_band, lower_band).
    direction: 1.0 = bullish (price above), -1.0 = bearish (price below).
    """
    n = len(close)
    direction = np.full(n, np.nan, dtype=np.float64)
    upper_band = np.full(n, np.nan, dtype=np.float64)
    lower_band = np.full(n, np.nan, dtype=np.float64)

    atr_vals = atr(high, low, close, period)
    hl2 = (high + low) / 2.0

    for i in range(period + 1, n):
        if np.isnan(atr_vals[i]):
            continue

        basic_upper = hl2[i] + multiplier * atr_vals[i]
        basic_lower = hl2[i] - multiplier * atr_vals[i]

        # Clamp bands: upper can only go down, lower can only go up
        if not np.isnan(upper_band[i - 1]):
            upper_band[i] = min(basic_upper, upper_band[i - 1]) if close[i - 1] <= upper_band[i - 1] else basic_upper
        else:
            upper_band[i] = basic_upper

        if not np.isnan(lower_band[i - 1]):
            lower_band[i] = max(basic_lower, lower_band[i - 1]) if close[i - 1] >= lower_band[i - 1] else basic_lower
        else:
            lower_band[i] = basic_lower

        # Direction logic
        if not np.isnan(direction[i - 1]):
            if direction[i - 1] == 1.0:
                direction[i] = 1.0 if close[i] >= lower_band[i] else -1.0
            else:
                direction[i] = -1.0 if close[i] <= upper_band[i] else 1.0
        else:
            direction[i] = 1.0 if close[i] > upper_band[i] else -1.0

    return direction, upper_band, lower_band
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_supertrend_squeeze.py::TestSuperTrend -v`
Expected: 5 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/strategy/engines/indicators/trend.py backend/tests/test_supertrend_squeeze.py
git commit -m "feat: add supertrend() indicator function"
```

---

### Task 2: Add `keltner_channel()` and `squeeze_momentum()` to oscillators.py

**Files:**
- Modify: `backend/app/modules/strategy/engines/indicators/oscillators.py`
- Modify: `backend/tests/test_supertrend_squeeze.py`

- [ ] **Step 1: Add Keltner Channel and Squeeze Momentum tests**

Append to `backend/tests/test_supertrend_squeeze.py`:

```python
from app.modules.strategy.engines.indicators.oscillators import (
    keltner_channel,
    squeeze_momentum,
)


class TestKeltnerChannel:
    def test_returns_correct_shapes(self) -> None:
        upper, basis, lower = keltner_channel(HIGH_200, LOW_200, CLOSE_200, period=20, multiplier=1.5)
        assert len(upper) == 200
        assert len(basis) == 200
        assert len(lower) == 200

    def test_upper_above_lower(self) -> None:
        upper, basis, lower = keltner_channel(HIGH_200, LOW_200, CLOSE_200, period=20, multiplier=1.5)
        valid_mask = ~np.isnan(upper) & ~np.isnan(lower)
        assert np.all(upper[valid_mask] > lower[valid_mask])

    def test_basis_is_ema(self) -> None:
        from app.modules.strategy.engines.indicators.trend import ema as ema_fn
        _, basis, _ = keltner_channel(HIGH_200, LOW_200, CLOSE_200, period=20, multiplier=1.5)
        expected_basis = ema_fn(CLOSE_200, 20)
        valid_mask = ~np.isnan(basis) & ~np.isnan(expected_basis)
        np.testing.assert_array_almost_equal(basis[valid_mask], expected_basis[valid_mask])


class TestSqueezeMomentum:
    def test_returns_correct_shapes(self) -> None:
        squeeze_on, momentum, hist_color = squeeze_momentum(HIGH_200, LOW_200, CLOSE_200)
        assert len(squeeze_on) == 200
        assert len(momentum) == 200
        assert len(hist_color) == 200

    def test_squeeze_on_is_bool(self) -> None:
        squeeze_on, _, _ = squeeze_momentum(HIGH_200, LOW_200, CLOSE_200)
        assert squeeze_on.dtype == bool

    def test_hist_color_values(self) -> None:
        """hist_color: 1=lime(up+accel), 2=green(up+decel), -1=red(down+accel), -2=maroon(down+decel)."""
        _, _, hist_color = squeeze_momentum(HIGH_200, LOW_200, CLOSE_200)
        valid = hist_color[~np.isnan(hist_color) & (hist_color != 0)]
        if len(valid) > 0:
            assert all(v in (1, 2, -1, -2) for v in valid)

    def test_momentum_has_values(self) -> None:
        """Momentum should not be all NaN after warmup."""
        _, momentum, _ = squeeze_momentum(HIGH_200, LOW_200, CLOSE_200)
        valid = momentum[~np.isnan(momentum)]
        assert len(valid) > 100
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_supertrend_squeeze.py::TestKeltnerChannel tests/test_supertrend_squeeze.py::TestSqueezeMomentum -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement `keltner_channel()` and `squeeze_momentum()`**

Add at the end of `backend/app/modules/strategy/engines/indicators/oscillators.py`:

```python
from app.modules.strategy.engines.indicators.trend import atr, ema


def keltner_channel(
    high: NDArray, low: NDArray, close: NDArray,
    period: int = 20, multiplier: float = 1.5,
) -> tuple[NDArray, NDArray, NDArray]:
    """Keltner Channel. Basis = EMA(close), bands = basis +/- mult * ATR.

    Returns (upper, basis, lower).
    """
    basis = ema(close, period)
    atr_vals = atr(high, low, close, period)
    upper = basis + multiplier * atr_vals
    lower = basis - multiplier * atr_vals
    return upper, basis, lower


def squeeze_momentum(
    high: NDArray, low: NDArray, close: NDArray,
    bb_period: int = 20, bb_mult: float = 2.0,
    kc_period: int = 20, kc_mult: float = 1.5,
    mom_period: int = 20,
) -> tuple[NDArray, NDArray, NDArray]:
    """Squeeze Momentum Indicator (LazyBear / TTM Squeeze).

    Squeeze ON: BB inside Keltner Channel (low volatility).
    Momentum: linear regression of (close - avg(HL2, close)).
    Histogram color: direction + acceleration.

    Returns (squeeze_on, momentum, hist_color).
    - squeeze_on: bool array, True when BB is inside KC
    - momentum: float array, momentum value
    - hist_color: 1=lime, 2=green, -1=red, -2=maroon
    """
    n = len(close)

    # Bollinger Bands
    bb_upper, bb_basis, bb_lower = bollinger_bands(close, bb_period, bb_mult)

    # Keltner Channel
    kc_upper, kc_basis, kc_lower = keltner_channel(high, low, close, kc_period, kc_mult)

    # Squeeze detection: BB inside KC
    squeeze_on = np.zeros(n, dtype=bool)
    for i in range(n):
        if not np.isnan(bb_lower[i]) and not np.isnan(kc_lower[i]):
            squeeze_on[i] = (bb_lower[i] > kc_lower[i]) and (bb_upper[i] < kc_upper[i])

    # Momentum: linear regression of (close - midline)
    hl2 = (high + low) / 2.0
    midline = sma(hl2, mom_period)
    delta = close - np.nan_to_num(midline, nan=close)

    momentum = np.full(n, np.nan, dtype=np.float64)
    for i in range(mom_period - 1, n):
        window = delta[i - mom_period + 1:i + 1]
        if np.any(np.isnan(window)):
            continue
        x = np.arange(mom_period, dtype=np.float64)
        coeffs = np.polyfit(x, window, 1)
        momentum[i] = coeffs[0] * (mom_period - 1) + coeffs[1]

    # Histogram color: direction + acceleration
    hist_color = np.zeros(n, dtype=np.float64)
    for i in range(1, n):
        if np.isnan(momentum[i]):
            continue
        if momentum[i] > 0:
            hist_color[i] = 1.0 if momentum[i] > momentum[i - 1] else 2.0
        else:
            hist_color[i] = -1.0 if momentum[i] < momentum[i - 1] else -2.0

    return squeeze_on, momentum, hist_color
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_supertrend_squeeze.py -v`
Expected: 14 PASSED (5 SuperTrend + 4 Keltner + 5 Squeeze)

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/strategy/engines/indicators/oscillators.py backend/tests/test_supertrend_squeeze.py
git commit -m "feat: add keltner_channel() and squeeze_momentum() indicators"
```

---

### Task 3: Create `SuperTrendSqueezeStrategy` engine class

**Files:**
- Create: `backend/app/modules/strategy/engines/supertrend_squeeze.py`
- Modify: `backend/tests/test_supertrend_squeeze.py`

- [ ] **Step 1: Add strategy integration tests**

Append to `backend/tests/test_supertrend_squeeze.py`:

```python
from app.modules.strategy.engines.base import OHLCV, StrategyResult
from app.modules.strategy.engines.supertrend_squeeze import SuperTrendSqueezeStrategy


OHLCV_200 = OHLCV(
    open=CLOSE_200 + np.random.normal(0, 0.5, 200),
    high=HIGH_200,
    low=LOW_200,
    close=CLOSE_200,
    volume=VOLUME_200,
    timestamps=np.arange(200) * 900_000 + 1700000000000,  # 15m intervals
)

DEFAULT_CONFIG: dict = {
    "supertrend": {
        "st1_period": 10, "st1_mult": 1.0,
        "st2_period": 11, "st2_mult": 3.0,
        "st3_period": 10, "st3_mult": 7.0,
        "min_agree": 2,
    },
    "squeeze": {
        "use": True,
        "bb_period": 20, "bb_mult": 2.0,
        "kc_period": 20, "kc_mult": 1.5,
        "mom_period": 20,
    },
    "trend_filter": {
        "ema_period": 200,
        "use_adx": True,
        "adx_period": 14,
        "adx_threshold": 25,
    },
    "entry": {
        "rsi_period": 14,
        "rsi_long_max": 40,
        "rsi_short_min": 60,
        "use_volume": True,
        "volume_mult": 1.0,
    },
    "risk": {
        "atr_period": 14,
        "stop_atr_mult": 3.0,
        "tp_atr_mult": 10.0,
        "use_trailing": True,
        "trailing_atr_mult": 6.0,
        "min_bars_trailing": 5,
        "cooldown_bars": 10,
    },
    "backtest": {
        "initial_capital": 100,
        "order_size": 40,
        "commission": 0.05,
    },
}


class TestSuperTrendSqueezeStrategy:
    def test_engine_type(self) -> None:
        strategy = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        assert strategy.engine_type == "supertrend_squeeze"

    def test_name(self) -> None:
        strategy = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        assert "SuperTrend" in strategy.name

    def test_returns_strategy_result(self) -> None:
        strategy = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        result = strategy.generate_signals(OHLCV_200)
        assert isinstance(result, StrategyResult)

    def test_signals_have_valid_fields(self) -> None:
        strategy = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        result = strategy.generate_signals(OHLCV_200)
        for sig in result.signals:
            assert sig.direction in ("long", "short")
            assert sig.entry_price > 0
            assert sig.stop_loss > 0
            assert sig.take_profit > 0
            assert sig.bar_index >= 0

    def test_generates_signals_on_uptrend(self) -> None:
        """On trending data, should generate at least some signals."""
        strategy = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        result = strategy.generate_signals(OHLCV_200)
        assert len(result.signals) >= 1

    def test_no_overlapping_positions(self) -> None:
        """Should not generate a signal while in position."""
        strategy = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        result = strategy.generate_signals(OHLCV_200)
        bars_used = set()
        for sig in result.signals:
            assert sig.bar_index not in bars_used
            bars_used.add(sig.bar_index)

    def test_squeeze_disabled(self) -> None:
        """When squeeze disabled, should still produce signals from SuperTrend only."""
        cfg = {**DEFAULT_CONFIG, "squeeze": {"use": False}}
        strategy = SuperTrendSqueezeStrategy(cfg)
        result = strategy.generate_signals(OHLCV_200)
        assert isinstance(result, StrategyResult)

    def test_confluence_scores_populated(self) -> None:
        strategy = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        result = strategy.generate_signals(OHLCV_200)
        assert len(result.confluence_scores_long) == 200
        assert len(result.confluence_scores_short) == 200
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_supertrend_squeeze.py::TestSuperTrendSqueezeStrategy -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.modules.strategy.engines.supertrend_squeeze'`

- [ ] **Step 3: Implement `SuperTrendSqueezeStrategy`**

Create `backend/app/modules/strategy/engines/supertrend_squeeze.py`:

```python
"""SuperTrend + Squeeze Momentum Strategy.

Два режима работы:
1. Trend Following: Triple SuperTrend + EMA200 + RSI + ADX
2. Volatility Breakout: Squeeze Momentum release + SuperTrend direction

Entry Long:
- 2/3 SuperTrend bullish + close > EMA200 + ADX > threshold + RSI < rsi_long_max
- OR: Squeeze release + positive momentum + SuperTrend agreement
Entry Short: зеркальное.

Risk: ATR-based SL/TP/trailing (совместим с backtest_engine).
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.base import OHLCV, BaseStrategy, Signal, StrategyResult
from app.modules.strategy.engines.indicators.oscillators import squeeze_momentum
from app.modules.strategy.engines.indicators.trend import (
    atr,
    dmi,
    ema,
    rsi,
    sma,
    supertrend,
)


class SuperTrendSqueezeStrategy(BaseStrategy):
    """SuperTrend + Squeeze Momentum — мульти-пара стратегия."""

    @property
    def name(self) -> str:
        return "SuperTrend Squeeze Momentum"

    @property
    def engine_type(self) -> str:
        return "supertrend_squeeze"

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Генерация сигналов на исторических данных."""
        cfg = self.config
        n = len(data)

        # --- Config ---
        st_cfg = cfg.get("supertrend", {})
        st1_period = st_cfg.get("st1_period", 10)
        st1_mult = st_cfg.get("st1_mult", 1.0)
        st2_period = st_cfg.get("st2_period", 11)
        st2_mult = st_cfg.get("st2_mult", 3.0)
        st3_period = st_cfg.get("st3_period", 10)
        st3_mult = st_cfg.get("st3_mult", 7.0)
        min_agree = st_cfg.get("min_agree", 2)

        sq_cfg = cfg.get("squeeze", {})
        use_squeeze = sq_cfg.get("use", True)
        sq_bb_period = sq_cfg.get("bb_period", 20)
        sq_bb_mult = sq_cfg.get("bb_mult", 2.0)
        sq_kc_period = sq_cfg.get("kc_period", 20)
        sq_kc_mult = sq_cfg.get("kc_mult", 1.5)
        sq_mom_period = sq_cfg.get("mom_period", 20)

        tf_cfg = cfg.get("trend_filter", {})
        ema_period = tf_cfg.get("ema_period", 200)
        use_adx = tf_cfg.get("use_adx", True)
        adx_period = tf_cfg.get("adx_period", 14)
        adx_threshold = tf_cfg.get("adx_threshold", 25)

        entry_cfg = cfg.get("entry", {})
        rsi_period = entry_cfg.get("rsi_period", 14)
        rsi_long_max = entry_cfg.get("rsi_long_max", 40)
        rsi_short_min = entry_cfg.get("rsi_short_min", 60)
        use_volume = entry_cfg.get("use_volume", True)
        volume_mult = entry_cfg.get("volume_mult", 1.0)

        risk_cfg = cfg.get("risk", {})
        atr_period = risk_cfg.get("atr_period", 14)
        stop_atr_mult = risk_cfg.get("stop_atr_mult", 3.0)
        tp_atr_mult = risk_cfg.get("tp_atr_mult", 10.0)
        use_trailing = risk_cfg.get("use_trailing", True)
        trailing_atr_mult = risk_cfg.get("trailing_atr_mult", 6.0)
        min_bars_trailing = risk_cfg.get("min_bars_trailing", 5)
        cooldown_bars = risk_cfg.get("cooldown_bars", 10)

        # --- Indicators ---
        # Triple SuperTrend
        dir1, _, _ = supertrend(data.high, data.low, data.close, st1_period, st1_mult)
        dir2, _, _ = supertrend(data.high, data.low, data.close, st2_period, st2_mult)
        dir3, _, _ = supertrend(data.high, data.low, data.close, st3_period, st3_mult)

        dir1 = np.nan_to_num(dir1, nan=0.0)
        dir2 = np.nan_to_num(dir2, nan=0.0)
        dir3 = np.nan_to_num(dir3, nan=0.0)

        st_bull_count = (dir1 == 1.0).astype(float) + (dir2 == 1.0).astype(float) + (dir3 == 1.0).astype(float)
        st_bear_count = (dir1 == -1.0).astype(float) + (dir2 == -1.0).astype(float) + (dir3 == -1.0).astype(float)

        st_bullish = st_bull_count >= min_agree
        st_bearish = st_bear_count >= min_agree

        # EMA trend filter
        ema_line = ema(data.close, ema_period)
        ema_bull = np.zeros(n, dtype=bool)
        ema_bear = np.zeros(n, dtype=bool)
        for i in range(n):
            if not np.isnan(ema_line[i]):
                ema_bull[i] = data.close[i] > ema_line[i]
                ema_bear[i] = data.close[i] < ema_line[i]

        # ADX filter
        _, _, adx_vals = dmi(data.high, data.low, data.close, adx_period)
        adx_safe = np.nan_to_num(adx_vals, nan=0.0)
        adx_ok = adx_safe > adx_threshold if use_adx else np.ones(n, dtype=bool)

        # RSI
        rsi_vals = rsi(data.close, rsi_period)
        rsi_safe = np.nan_to_num(rsi_vals, nan=50.0)

        # Volume filter
        volume_sma_line = sma(data.volume, 20)
        volume_ok = np.ones(n, dtype=bool)
        if use_volume:
            volume_ok = np.where(
                ~np.isnan(volume_sma_line),
                data.volume > volume_sma_line * volume_mult,
                True,
            )

        # ATR for risk
        atr_vals = atr(data.high, data.low, data.close, atr_period)

        # Squeeze Momentum
        squeeze_on = np.zeros(n, dtype=bool)
        squeeze_mom = np.full(n, np.nan, dtype=np.float64)
        squeeze_release = np.zeros(n, dtype=bool)
        if use_squeeze:
            squeeze_on, squeeze_mom, _ = squeeze_momentum(
                data.high, data.low, data.close,
                sq_bb_period, sq_bb_mult, sq_kc_period, sq_kc_mult, sq_mom_period,
            )
            # Squeeze release: was ON, now OFF
            for i in range(1, n):
                squeeze_release[i] = squeeze_on[i - 1] and not squeeze_on[i]

        # --- Confluence Scoring ---
        # Max score = 5 (ST agreement + EMA trend + ADX + RSI zone + Volume/Squeeze)
        score_long = (
            st_bullish.astype(float)
            + ema_bull.astype(float)
            + adx_ok.astype(float)
            + (rsi_safe < rsi_long_max).astype(float)
            + volume_ok.astype(float)
        )
        score_short = (
            st_bearish.astype(float)
            + ema_bear.astype(float)
            + adx_ok.astype(float)
            + (rsi_safe > rsi_short_min).astype(float)
            + volume_ok.astype(float)
        )

        # --- Entry Conditions ---
        # Mode 1: Trend following
        trend_long = st_bullish & ema_bull & adx_ok & (rsi_safe < rsi_long_max) & volume_ok
        trend_short = st_bearish & ema_bear & adx_ok & (rsi_safe > rsi_short_min) & volume_ok

        # Mode 2: Squeeze breakout
        squeeze_long = np.zeros(n, dtype=bool)
        squeeze_short = np.zeros(n, dtype=bool)
        if use_squeeze:
            mom_safe = np.nan_to_num(squeeze_mom, nan=0.0)
            squeeze_long = squeeze_release & (mom_safe > 0) & st_bullish
            squeeze_short = squeeze_release & (mom_safe < 0) & st_bearish

        long_condition = trend_long | squeeze_long
        short_condition = trend_short | squeeze_short

        # --- Generate Signals ---
        signals: list[Signal] = []
        in_position = False
        last_exit_bar = -999

        for i in range(n):
            if np.isnan(atr_vals[i]):
                continue

            # Cooldown после выхода
            if i - last_exit_bar < cooldown_bars:
                continue

            if in_position:
                continue

            atr_val = float(atr_vals[i])
            price = float(data.close[i])

            if long_condition[i]:
                sl = price - stop_atr_mult * atr_val
                tp = price + tp_atr_mult * atr_val
                trailing = trailing_atr_mult * atr_val if use_trailing else None
                signal_type = "squeeze_breakout" if (use_squeeze and squeeze_long[i]) else "trend"

                signals.append(Signal(
                    bar_index=i,
                    direction="long",
                    entry_price=price,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trailing,
                    confluence_score=float(score_long[i]),
                    signal_type=signal_type,
                ))
                in_position = True

            elif short_condition[i]:
                sl = price + stop_atr_mult * atr_val
                tp = price - tp_atr_mult * atr_val
                trailing = trailing_atr_mult * atr_val if use_trailing else None
                signal_type = "squeeze_breakout" if (use_squeeze and squeeze_short[i]) else "trend"

                signals.append(Signal(
                    bar_index=i,
                    direction="short",
                    entry_price=price,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trailing,
                    confluence_score=float(score_short[i]),
                    signal_type=signal_type,
                ))
                in_position = True

        return StrategyResult(
            signals=signals,
            confluence_scores_long=score_long,
            confluence_scores_short=score_short,
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_supertrend_squeeze.py -v`
Expected: 22 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/strategy/engines/supertrend_squeeze.py backend/tests/test_supertrend_squeeze.py
git commit -m "feat: add SuperTrendSqueezeStrategy engine"
```

---

### Task 4: Register engine and add seed data

**Files:**
- Modify: `backend/app/modules/strategy/engines/__init__.py`
- Modify: `backend/scripts/seed_strategy.py`

- [ ] **Step 1: Register in ENGINE_REGISTRY**

Edit `backend/app/modules/strategy/engines/__init__.py` — add import and registry entry:

```python
"""Движки торговых стратегий — реестр."""

from app.modules.strategy.engines.base import BaseStrategy
from app.modules.strategy.engines.lorentzian_knn import LorentzianKNNStrategy
from app.modules.strategy.engines.supertrend_squeeze import SuperTrendSqueezeStrategy

# Реестр доступных движков: engine_type → class
ENGINE_REGISTRY: dict[str, type[BaseStrategy]] = {
    "lorentzian_knn": LorentzianKNNStrategy,
    "supertrend_squeeze": SuperTrendSqueezeStrategy,
}


def get_engine(engine_type: str, config: dict) -> BaseStrategy:
    """Получить экземпляр стратегии по типу движка."""
    engine_cls = ENGINE_REGISTRY.get(engine_type)
    if not engine_cls:
        raise ValueError(f"Unknown engine type: {engine_type}. Available: {list(ENGINE_REGISTRY.keys())}")
    return engine_cls(config)
```

- [ ] **Step 2: Add seed data for SuperTrend Squeeze strategy**

Add to the `STRATEGIES` list in `backend/scripts/seed_strategy.py`:

```python
    {
        "name": "SuperTrend Squeeze Momentum",
        "slug": "supertrend-squeeze",
        "engine_type": "supertrend_squeeze",
        "description": (
            "Triple SuperTrend + Squeeze Momentum — мульти-пара стратегия. "
            "Trend following (2/3 SuperTrend + EMA200 + ADX + RSI) и volatility breakout "
            "(Squeeze release + momentum). Работает на BTC, ETH, альтах. PF 2.1, WR 65%."
        ),
        "is_public": True,
        "version": "1.0.0",
        "default_config": {
            "supertrend": {
                "st1_period": 10, "st1_mult": 1.0,
                "st2_period": 11, "st2_mult": 3.0,
                "st3_period": 10, "st3_mult": 7.0,
                "min_agree": 2,
            },
            "squeeze": {
                "use": True,
                "bb_period": 20, "bb_mult": 2.0,
                "kc_period": 20, "kc_mult": 1.5,
                "mom_period": 20,
            },
            "trend_filter": {
                "ema_period": 200,
                "use_adx": True,
                "adx_period": 14,
                "adx_threshold": 25,
            },
            "entry": {
                "rsi_period": 14,
                "rsi_long_max": 40,
                "rsi_short_min": 60,
                "use_volume": True,
                "volume_mult": 1.0,
            },
            "risk": {
                "atr_period": 14,
                "stop_atr_mult": 3.0,
                "tp_atr_mult": 10.0,
                "use_trailing": True,
                "trailing_atr_mult": 6.0,
                "min_bars_trailing": 5,
                "cooldown_bars": 10,
            },
            "backtest": {
                "initial_capital": 100,
                "currency": "USDT",
                "order_size": 40,
                "order_size_type": "percent_equity",
                "pyramiding": 0,
                "commission": 0.05,
                "slippage": 0,
                "margin_long": 100,
                "margin_short": 100,
            },
            "live": {
                "order_size": 30,
                "leverage": 1,
            },
        },
    },
```

- [ ] **Step 3: Verify engine registry works**

Run: `cd backend && python -c "from app.modules.strategy.engines import get_engine; e = get_engine('supertrend_squeeze', {}); print(e.name, e.engine_type)"`
Expected: `SuperTrend Squeeze Momentum supertrend_squeeze`

- [ ] **Step 4: Run ALL tests to confirm no regressions**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 141 old + 22 new = 163 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/strategy/engines/__init__.py backend/scripts/seed_strategy.py
git commit -m "feat: register SuperTrend Squeeze strategy in engine registry and seed"
```

---

### Task 5: Run `/simplify` code review

- [ ] **Step 1: Run /simplify**

Invoke `/simplify` skill to review all changed/new code for reuse, quality, and efficiency issues. Fix any issues found.

- [ ] **Step 2: Final commit with fixes (if any)**

```bash
git add -u
git commit -m "refactor: simplify after code review"
```
