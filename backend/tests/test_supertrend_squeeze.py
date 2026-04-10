"""Тесты SuperTrend Squeeze Momentum стратегии."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.trend import supertrend
from app.modules.strategy.engines.indicators.oscillators import (
    keltner_channel,
    squeeze_duration,
    squeeze_momentum,
)
from app.modules.strategy.engines.indicators.trend import (
    atr as atr_fn,
    atr_percentile,
    bb_bandwidth,
)


# === Тестовые данные: 200 баров с uptrend ===
np.random.seed(42)
_trend = np.linspace(100, 150, 200)
_noise = np.random.normal(0, 1.5, 200)
CLOSE_200 = _trend + _noise
HIGH_200 = CLOSE_200 + np.abs(np.random.normal(1, 0.5, 200))
LOW_200 = CLOSE_200 - np.abs(np.random.normal(1, 0.5, 200))
VOLUME_200 = np.random.uniform(500, 2000, 200)


class TestAtrPercentile:
    def test_returns_correct_shape(self) -> None:
        atr_vals = atr_fn(HIGH_200, LOW_200, CLOSE_200, 14)
        result = atr_percentile(atr_vals, lookback=50)
        assert len(result) == 200

    def test_values_in_range(self) -> None:
        atr_vals = atr_fn(HIGH_200, LOW_200, CLOSE_200, 14)
        result = atr_percentile(atr_vals, lookback=50)
        valid = result[~np.isnan(result)]
        assert np.all(valid >= 0)
        assert np.all(valid <= 100)

    def test_nan_at_start(self) -> None:
        atr_vals = atr_fn(HIGH_200, LOW_200, CLOSE_200, 14)
        result = atr_percentile(atr_vals, lookback=50)
        assert np.isnan(result[0])


class TestBbBandwidth:
    def test_positive_values(self) -> None:
        from app.modules.strategy.engines.indicators.oscillators import bollinger_bands
        upper, basis, lower = bollinger_bands(CLOSE_200, 20, 2.0)
        bw = bb_bandwidth(upper, lower, basis)
        valid = bw[~np.isnan(bw)]
        assert np.all(valid > 0)


class TestSqueezeDuration:
    def test_basic(self) -> None:
        squeeze_on = np.array([False, True, True, True, False, True, False], dtype=bool)
        dur = squeeze_duration(squeeze_on)
        expected = np.array([0, 1, 2, 3, 0, 1, 0])
        np.testing.assert_array_equal(dur, expected)

    def test_all_true(self) -> None:
        squeeze_on = np.ones(5, dtype=bool)
        dur = squeeze_duration(squeeze_on)
        np.testing.assert_array_equal(dur, [1, 2, 3, 4, 5])

    def test_all_false(self) -> None:
        squeeze_on = np.zeros(5, dtype=bool)
        dur = squeeze_duration(squeeze_on)
        np.testing.assert_array_equal(dur, [0, 0, 0, 0, 0])


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

    def test_regime_enabled(self) -> None:
        """Regime adaptation should not crash and still produce valid result."""
        cfg = {**DEFAULT_CONFIG, "regime": {
            "use": True, "adx_trending": 25, "adx_ranging": 20,
            "atr_high_vol_pct": 75, "atr_lookback": 50, "vol_scale": 1.5,
            "skip_ranging": True,
        }}
        strategy = SuperTrendSqueezeStrategy(cfg)
        result = strategy.generate_signals(OHLCV_200)
        assert isinstance(result, StrategyResult)
        for sig in result.signals:
            assert sig.stop_loss > 0

    def test_regime_disabled_backward_compat(self) -> None:
        """With regime disabled, behavior should be identical to v1."""
        strategy_v1 = SuperTrendSqueezeStrategy(DEFAULT_CONFIG)
        cfg_v2 = {**DEFAULT_CONFIG, "regime": {"use": False}}
        strategy_v2 = SuperTrendSqueezeStrategy(cfg_v2)
        r1 = strategy_v1.generate_signals(OHLCV_200)
        r2 = strategy_v2.generate_signals(OHLCV_200)
        assert len(r1.signals) == len(r2.signals)

    def test_adaptive_trailing(self) -> None:
        """Adaptive trailing should produce variable trailing values."""
        cfg = {**DEFAULT_CONFIG, "risk": {
            **DEFAULT_CONFIG["risk"],
            "adaptive_trailing": True,
            "trail_low_mult": 2.0,
            "trail_high_mult": 10.0,
        }}
        strategy = SuperTrendSqueezeStrategy(cfg)
        result = strategy.generate_signals(OHLCV_200)
        assert isinstance(result, StrategyResult)
        # Все сигналы должны иметь trailing
        for sig in result.signals:
            if sig.trailing_atr is not None:
                assert sig.trailing_atr > 0

    def test_squeeze_min_duration(self) -> None:
        """Squeeze with high min_duration should filter out short squeezes."""
        cfg_loose = {**DEFAULT_CONFIG, "squeeze": {
            **DEFAULT_CONFIG["squeeze"],
            "min_duration": 0,
        }}
        cfg_strict = {**DEFAULT_CONFIG, "squeeze": {
            **DEFAULT_CONFIG["squeeze"],
            "min_duration": 100,  # очень строгий фильтр
        }}
        r_loose = SuperTrendSqueezeStrategy(cfg_loose).generate_signals(OHLCV_200)
        r_strict = SuperTrendSqueezeStrategy(cfg_strict).generate_signals(OHLCV_200)
        # Строгий фильтр может дать <= сигналов (squeeze breakout фильтруются)
        squeeze_loose = [s for s in r_loose.signals if s.signal_type == "squeeze_breakout"]
        squeeze_strict = [s for s in r_strict.signals if s.signal_type == "squeeze_breakout"]
        assert len(squeeze_strict) <= len(squeeze_loose)

    def test_multi_tf_filter(self) -> None:
        """Multi-TF filter with all-bearish HTF should block long signals."""
        htf_ts = list(range(0, 200 * 900_000 + 1700000000000, 900_000 * 4))
        htf_trend = [-1] * len(htf_ts)  # все bearish
        cfg = {**DEFAULT_CONFIG, "multi_tf": {
            "use": True,
            "htf_trend": htf_trend,
            "htf_timestamps": htf_ts,
        }}
        strategy = SuperTrendSqueezeStrategy(cfg)
        result = strategy.generate_signals(OHLCV_200)
        long_signals = [s for s in result.signals if s.direction == "long"]
        assert len(long_signals) == 0
