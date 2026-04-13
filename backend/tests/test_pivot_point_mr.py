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
