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


def _validate_config(cfg: dict) -> dict:
    """Валидация и нормализация конфига. Возвращает safe config с гарантированными типами."""
    def _int(val: object, default: int, min_val: int = 1) -> int:
        try:
            v = int(val)
            return max(v, min_val)
        except (TypeError, ValueError):
            return default

    def _float(val: object, default: float, min_val: float = 0.0) -> float:
        try:
            v = float(val)
            return max(v, min_val)
        except (TypeError, ValueError):
            return default

    def _bool(val: object, default: bool) -> bool:
        if isinstance(val, bool):
            return val
        return default

    st = cfg.get("supertrend", {})
    sq = cfg.get("squeeze", {})
    tf = cfg.get("trend_filter", {})
    entry = cfg.get("entry", {})
    risk = cfg.get("risk", {})

    return {
        "supertrend": {
            "st1_period": _int(st.get("st1_period"), 10, 2),
            "st1_mult": _float(st.get("st1_mult"), 1.0, 0.1),
            "st2_period": _int(st.get("st2_period"), 11, 2),
            "st2_mult": _float(st.get("st2_mult"), 3.0, 0.1),
            "st3_period": _int(st.get("st3_period"), 10, 2),
            "st3_mult": _float(st.get("st3_mult"), 7.0, 0.1),
            "min_agree": _int(st.get("min_agree"), 2, 1),
        },
        "squeeze": {
            "use": _bool(sq.get("use"), True),
            "bb_period": _int(sq.get("bb_period"), 20, 2),
            "bb_mult": _float(sq.get("bb_mult"), 2.0, 0.1),
            "kc_period": _int(sq.get("kc_period"), 20, 2),
            "kc_mult": _float(sq.get("kc_mult"), 1.5, 0.1),
            "mom_period": _int(sq.get("mom_period"), 20, 2),
        },
        "trend_filter": {
            "ema_period": _int(tf.get("ema_period"), 200, 2),
            "use_adx": _bool(tf.get("use_adx"), True),
            "adx_period": _int(tf.get("adx_period"), 14, 2),
            "adx_threshold": _float(tf.get("adx_threshold"), 25, 0.0),
        },
        "entry": {
            "rsi_period": _int(entry.get("rsi_period"), 14, 2),
            "rsi_long_max": _float(entry.get("rsi_long_max"), 40, 0.0),
            "rsi_short_min": _float(entry.get("rsi_short_min"), 60, 0.0),
            "use_volume": _bool(entry.get("use_volume"), True),
            "volume_mult": _float(entry.get("volume_mult"), 1.0, 0.1),
        },
        "risk": {
            "atr_period": _int(risk.get("atr_period"), 14, 2),
            "stop_atr_mult": _float(risk.get("stop_atr_mult"), 3.0, 0.1),
            "tp_atr_mult": _float(risk.get("tp_atr_mult"), 10.0, 0.1),
            "use_trailing": _bool(risk.get("use_trailing"), True),
            "trailing_atr_mult": _float(risk.get("trailing_atr_mult"), 6.0, 0.1),
            "cooldown_bars": _int(risk.get("cooldown_bars"), 10, 0),
        },
    }


class SuperTrendSqueezeStrategy(BaseStrategy):
    """SuperTrend + Squeeze Momentum - мульти-пара стратегия."""

    @property
    def name(self) -> str:
        return "SuperTrend Squeeze Momentum"

    @property
    def engine_type(self) -> str:
        return "supertrend_squeeze"

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Генерация сигналов на исторических данных."""
        cfg = _validate_config(self.config)
        n = len(data)

        # --- Config (validated, safe types) ---
        st_cfg = cfg["supertrend"]
        st1_period = st_cfg["st1_period"]
        st1_mult = st_cfg["st1_mult"]
        st2_period = st_cfg["st2_period"]
        st2_mult = st_cfg["st2_mult"]
        st3_period = st_cfg["st3_period"]
        st3_mult = st_cfg["st3_mult"]
        min_agree = st_cfg["min_agree"]

        sq_cfg = cfg["squeeze"]
        use_squeeze = sq_cfg["use"]
        sq_bb_period = sq_cfg["bb_period"]
        sq_bb_mult = sq_cfg["bb_mult"]
        sq_kc_period = sq_cfg["kc_period"]
        sq_kc_mult = sq_cfg["kc_mult"]
        sq_mom_period = sq_cfg["mom_period"]

        tf_cfg = cfg["trend_filter"]
        ema_period = tf_cfg["ema_period"]
        use_adx = tf_cfg["use_adx"]
        adx_period = tf_cfg["adx_period"]
        adx_threshold = tf_cfg["adx_threshold"]

        entry_cfg = cfg["entry"]
        rsi_period = entry_cfg["rsi_period"]
        rsi_long_max = entry_cfg["rsi_long_max"]
        rsi_short_min = entry_cfg["rsi_short_min"]
        use_volume = entry_cfg["use_volume"]
        volume_mult = entry_cfg["volume_mult"]

        risk_cfg = cfg["risk"]
        atr_period = risk_cfg["atr_period"]
        stop_atr_mult = risk_cfg["stop_atr_mult"]
        tp_atr_mult = risk_cfg["tp_atr_mult"]
        use_trailing = risk_cfg["use_trailing"]
        trailing_atr_mult = risk_cfg["trailing_atr_mult"]
        cooldown_bars = risk_cfg["cooldown_bars"]

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

        # ADX filter (условное вычисление)
        if use_adx:
            _, _, adx_vals = dmi(data.high, data.low, data.close, adx_period)
            adx_safe = np.nan_to_num(adx_vals, nan=0.0)
            adx_ok = adx_safe > adx_threshold
        else:
            adx_ok = np.ones(n, dtype=bool)

        # RSI
        rsi_vals = rsi(data.close, rsi_period)
        rsi_safe = np.nan_to_num(rsi_vals, nan=50.0)

        # Volume filter (условное вычисление)
        if use_volume:
            volume_sma_line = sma(data.volume, 20)
            volume_ok = np.where(
                ~np.isnan(volume_sma_line),
                data.volume > volume_sma_line * volume_mult,
                True,
            )
        else:
            volume_ok = np.ones(n, dtype=bool)

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
        # Подсчитываем количество активных фильтров для динамического min_score
        active_filters = 3  # supertrend + ema + rsi (всегда активны)
        if use_adx:
            active_filters += 1
        if use_volume:
            active_filters += 1

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
        # Динамический min_score: все активные фильтры должны совпасть
        min_score = float(active_filters)

        squeeze_long = np.zeros(n, dtype=bool)
        squeeze_short = np.zeros(n, dtype=bool)
        if use_squeeze:
            mom_safe = np.nan_to_num(squeeze_mom, nan=0.0)
            squeeze_long = squeeze_release & (mom_safe > 0) & st_bullish
            squeeze_short = squeeze_release & (mom_safe < 0) & st_bearish

        long_condition = (score_long >= min_score) | squeeze_long
        short_condition = (score_short >= min_score) | squeeze_short

        # --- Generate Signals (entry only, exit tracking в backtest_engine) ---
        signals: list[Signal] = []
        last_signal_bar: int = -999

        for i in range(n):
            if np.isnan(atr_vals[i]):
                continue

            # Cooldown: не входить чаще чем раз в cooldown_bars баров
            if i - last_signal_bar < cooldown_bars:
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
                last_signal_bar = i

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
                last_signal_bar = i

        return StrategyResult(
            signals=signals,
            confluence_scores_long=score_long,
            confluence_scores_short=score_short,
        )
