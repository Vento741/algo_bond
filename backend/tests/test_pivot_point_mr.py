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
