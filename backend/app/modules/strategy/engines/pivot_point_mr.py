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

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """MVP stub — будет заполнен в Task 9."""
        cfg = self._validate_config(self.config)
        n = len(data)
        empty_arr = np.zeros(n, dtype=np.float64)
        return StrategyResult(
            signals=[],
            confluence_scores_long=empty_arr.copy(),
            confluence_scores_short=empty_arr.copy(),
            knn_scores=empty_arr.copy(),
            knn_classes=empty_arr.copy(),
            knn_confidence=empty_arr.copy(),
        )
