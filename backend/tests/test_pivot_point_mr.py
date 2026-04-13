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
