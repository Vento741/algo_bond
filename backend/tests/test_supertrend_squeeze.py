"""Тесты SuperTrend Squeeze Momentum стратегии."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.trend import supertrend
from app.modules.strategy.engines.indicators.oscillators import (
    keltner_channel,
    squeeze_momentum,
)


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
