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
        st1_period: int = st_cfg.get("st1_period", 10)
        st1_mult: float = st_cfg.get("st1_mult", 1.0)
        st2_period: int = st_cfg.get("st2_period", 11)
        st2_mult: float = st_cfg.get("st2_mult", 3.0)
        st3_period: int = st_cfg.get("st3_period", 10)
        st3_mult: float = st_cfg.get("st3_mult", 7.0)
        min_agree: int = st_cfg.get("min_agree", 2)

        sq_cfg = cfg.get("squeeze", {})
        use_squeeze: bool = sq_cfg.get("use", True)
        sq_bb_period: int = sq_cfg.get("bb_period", 20)
        sq_bb_mult: float = sq_cfg.get("bb_mult", 2.0)
        sq_kc_period: int = sq_cfg.get("kc_period", 20)
        sq_kc_mult: float = sq_cfg.get("kc_mult", 1.5)
        sq_mom_period: int = sq_cfg.get("mom_period", 20)

        tf_cfg = cfg.get("trend_filter", {})
        ema_period: int = tf_cfg.get("ema_period", 200)
        use_adx: bool = tf_cfg.get("use_adx", True)
        adx_period: int = tf_cfg.get("adx_period", 14)
        adx_threshold: float = tf_cfg.get("adx_threshold", 25)

        entry_cfg = cfg.get("entry", {})
        rsi_period: int = entry_cfg.get("rsi_period", 14)
        rsi_long_max: float = entry_cfg.get("rsi_long_max", 40)
        rsi_short_min: float = entry_cfg.get("rsi_short_min", 60)
        use_volume: bool = entry_cfg.get("use_volume", True)
        volume_mult: float = entry_cfg.get("volume_mult", 1.0)

        risk_cfg = cfg.get("risk", {})
        atr_period: int = risk_cfg.get("atr_period", 14)
        stop_atr_mult: float = risk_cfg.get("stop_atr_mult", 3.0)
        tp_atr_mult: float = risk_cfg.get("tp_atr_mult", 10.0)
        use_trailing: bool = risk_cfg.get("use_trailing", True)
        trailing_atr_mult: float = risk_cfg.get("trailing_atr_mult", 6.0)
        cooldown_bars: int = risk_cfg.get("cooldown_bars", 10)

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
                squeeze_release[i] = bool(squeeze_on[i - 1]) and not bool(squeeze_on[i])

        # --- Confluence Scoring ---
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
        trend_long = st_bullish & ema_bull & adx_ok & (rsi_safe < rsi_long_max) & volume_ok
        trend_short = st_bearish & ema_bear & adx_ok & (rsi_safe > rsi_short_min) & volume_ok

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
