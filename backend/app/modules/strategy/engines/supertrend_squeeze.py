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

        # EMA trend filter (vectorized)
        ema_line = ema(data.close, ema_period)
        valid_ema = ~np.isnan(ema_line)
        ema_bull = valid_ema & (data.close > ema_line)
        ema_bear = valid_ema & (data.close < ema_line)

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
            # Squeeze release: was ON, now OFF (vectorized)
            squeeze_release[1:] = squeeze_on[:-1] & ~squeeze_on[1:]

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

        # --- Entry Conditions (use score threshold instead of duplicating AND logic) ---
        min_score = 5.0  # all 5 filters must agree for trend entry

        squeeze_long = np.zeros(n, dtype=bool)
        squeeze_short = np.zeros(n, dtype=bool)
        if use_squeeze:
            mom_safe = np.nan_to_num(squeeze_mom, nan=0.0)
            squeeze_long = squeeze_release & (mom_safe > 0) & st_bullish
            squeeze_short = squeeze_release & (mom_safe < 0) & st_bearish

        long_condition = (score_long >= min_score) | squeeze_long
        short_condition = (score_short >= min_score) | squeeze_short

        # --- Generate Signals with exit tracking ---
        signals: list[Signal] = []
        in_position = False
        position_side: str = ""
        position_sl: float = 0.0
        position_tp: float = 0.0
        position_trailing: float = 0.0
        position_highest: float = 0.0
        position_lowest: float = float("inf")
        position_entry_bar: int = 0
        last_exit_bar: int = -999
        min_bars_trailing: int = risk_cfg.get("min_bars_trailing", 5)

        for i in range(n):
            if np.isnan(atr_vals[i]):
                continue

            # --- Exit tracking (SL/TP/trailing) ---
            if in_position:
                bars_held = i - position_entry_bar
                if position_side == "long":
                    position_highest = max(position_highest, float(data.high[i]))
                    # Trailing stop update
                    if use_trailing and bars_held >= min_bars_trailing:
                        new_trail = position_highest - trailing_atr_mult * float(atr_vals[i])
                        position_sl = max(position_sl, new_trail)
                    # Check exits
                    if float(data.low[i]) <= position_sl or float(data.high[i]) >= position_tp:
                        in_position = False
                        last_exit_bar = i
                else:  # short
                    position_lowest = min(position_lowest, float(data.low[i]))
                    if use_trailing and bars_held >= min_bars_trailing:
                        new_trail = position_lowest + trailing_atr_mult * float(atr_vals[i])
                        position_sl = min(position_sl, new_trail)
                    if float(data.high[i]) >= position_sl or float(data.low[i]) <= position_tp:
                        in_position = False
                        last_exit_bar = i
                continue

            # Cooldown after exit
            if i - last_exit_bar < cooldown_bars:
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
                position_side = "long"
                position_sl = sl
                position_tp = tp
                position_trailing = trailing_atr_mult * atr_val
                position_highest = price
                position_entry_bar = i

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
                position_side = "short"
                position_sl = sl
                position_tp = tp
                position_trailing = trailing_atr_mult * atr_val
                position_lowest = price
                position_entry_bar = i

        return StrategyResult(
            signals=signals,
            confluence_scores_long=score_long,
            confluence_scores_short=score_short,
        )
