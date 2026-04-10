"""SuperTrend + Squeeze Momentum Strategy v2.

Два режима работы:
1. Trend Following: Triple SuperTrend + EMA200 + RSI + ADX
2. Volatility Breakout: Squeeze Momentum release + SuperTrend direction

v2 улучшения:
- Volatility Regime Adaptation (trending/ranging/high_vol)
- Squeeze Duration Weighting (min_duration + weight multiplier)
- Adaptive Trailing Stop (ATR percentile interpolation)
- Multi-TF Confirmation (pre-computed от service layer)

Entry Long:
- 2/3 SuperTrend bullish + close > EMA200 + ADX > threshold + RSI < rsi_long_max
- OR: Squeeze release + positive momentum + SuperTrend agreement + duration filter
Entry Short: зеркальное.

Фильтры:
- Regime: skip ranging (ADX < thresh + BB contracting)
- Multi-TF: long только при bullish HTF, short при bearish HTF
- High vol: расширяем SL/TP/trailing на vol_scale

Risk: ATR-based SL/TP/trailing (совместим с backtest_engine).
Все новые фичи выключены по умолчанию (backward compatible).
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.base import OHLCV, BaseStrategy, Signal, StrategyResult
from app.modules.strategy.engines.indicators.oscillators import (
    bollinger_bands,
    squeeze_duration,
    squeeze_momentum,
)
from app.modules.strategy.engines.indicators.trend import (
    atr,
    atr_percentile,
    bb_bandwidth,
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
    regime = cfg.get("regime", {})
    multi_tf = cfg.get("multi_tf", {})
    time_filter = cfg.get("time_filter", {})

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
            "min_duration": _int(sq.get("min_duration"), 0, 0),
            "duration_norm": _int(sq.get("duration_norm"), 30, 1),
            "max_weight": _float(sq.get("max_weight"), 1.0, 0.1),
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
            "adaptive_trailing": _bool(risk.get("adaptive_trailing"), False),
            "trail_low_mult": _float(risk.get("trail_low_mult"), 3.0, 0.1),
            "trail_high_mult": _float(risk.get("trail_high_mult"), 8.0, 0.1),
        },
        "regime": {
            "use": _bool(regime.get("use"), False),
            "adx_trending": _float(regime.get("adx_trending"), 25.0, 0.0),
            "adx_ranging": _float(regime.get("adx_ranging"), 20.0, 0.0),
            "atr_high_vol_pct": _float(regime.get("atr_high_vol_pct"), 75.0, 0.0),
            "atr_lookback": _int(regime.get("atr_lookback"), 100, 10),
            "vol_scale": _float(regime.get("vol_scale"), 1.5, 1.0),
            "skip_ranging": _bool(regime.get("skip_ranging"), True),
        },
        "multi_tf": {
            "use": _bool(multi_tf.get("use"), False),
            "htf_trend": multi_tf.get("htf_trend", []),
            "htf_timestamps": multi_tf.get("htf_timestamps", []),
        },
        "time_filter": {
            "use": _bool(time_filter.get("use"), False),
            "block_start_utc": _int(time_filter.get("block_start_utc"), 2, 0),
            "block_end_utc": _int(time_filter.get("block_end_utc"), 7, 0),
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
        adaptive_trailing = risk_cfg["adaptive_trailing"]
        trail_low_mult = risk_cfg["trail_low_mult"]
        trail_high_mult = risk_cfg["trail_high_mult"]

        # Squeeze duration config
        sq_min_duration = cfg["squeeze"]["min_duration"]
        sq_duration_norm = cfg["squeeze"]["duration_norm"]
        sq_max_weight = cfg["squeeze"]["max_weight"]

        # Regime config
        regime_cfg = cfg["regime"]
        use_regime = regime_cfg["use"]

        # Multi-TF config
        mtf_cfg = cfg["multi_tf"]
        use_multi_tf = mtf_cfg["use"]

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

        # ADX filter (всегда вычисляем если нужен для regime или фильтра)
        need_adx = use_adx or use_regime
        if need_adx:
            _, _, adx_vals_raw = dmi(data.high, data.low, data.close, adx_period)
            adx_safe = np.nan_to_num(adx_vals_raw, nan=0.0)
            adx_ok = adx_safe > adx_threshold if use_adx else np.ones(n, dtype=bool)
        else:
            adx_safe = np.zeros(n, dtype=np.float64)
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
        sq_dur = np.zeros(n, dtype=np.int64)
        if use_squeeze:
            squeeze_on, squeeze_mom, _ = squeeze_momentum(
                data.high, data.low, data.close,
                sq_bb_period, sq_bb_mult, sq_kc_period, sq_kc_mult, sq_mom_period,
            )
            # Squeeze release: was ON, now OFF (vectorized)
            squeeze_release[1:] = squeeze_on[:-1] & ~squeeze_on[1:]

            # Squeeze duration weighting
            sq_dur = squeeze_duration(squeeze_on)

        # --- Volatility Regime Detection ---
        atr_pct = np.full(n, 50.0, dtype=np.float64)  # default: mid-range
        is_ranging = np.zeros(n, dtype=bool)
        is_high_vol = np.zeros(n, dtype=bool)

        if use_regime:
            atr_pct = atr_percentile(atr_vals, regime_cfg["atr_lookback"])
            atr_pct = np.nan_to_num(atr_pct, nan=50.0)

            adx_ranging_thresh = regime_cfg["adx_ranging"]

            # BB bandwidth для expanding/contracting (переиспользуем BB из squeeze если совпадают параметры)
            bb_upper, bb_basis, bb_lower = bollinger_bands(data.close, sq_bb_period, sq_bb_mult)
            bw = bb_bandwidth(bb_upper, bb_lower, bb_basis)
            bw_safe = np.nan_to_num(bw, nan=0.0)
            bw_prev = np.roll(bw_safe, 1)
            bw_prev[0] = bw_safe[0]
            bb_contracting = bw_safe < bw_prev

            is_ranging = (adx_safe < adx_ranging_thresh) & bb_contracting
            is_high_vol = atr_pct > regime_cfg["atr_high_vol_pct"]

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
        sq_dur_at_release = np.zeros(n, dtype=np.int64)
        if use_squeeze:
            mom_safe = np.nan_to_num(squeeze_mom, nan=0.0)

            # sq_dur на баре release = 0 (уже off), берем предыдущий бар
            sq_dur_at_release[1:] = sq_dur[:-1]
            duration_ok = sq_dur_at_release >= sq_min_duration if sq_min_duration > 0 else np.ones(n, dtype=bool)

            squeeze_long = squeeze_release & (mom_safe > 0) & st_bullish & duration_ok
            squeeze_short = squeeze_release & (mom_safe < 0) & st_bearish & duration_ok

        long_condition = (score_long >= min_score) | squeeze_long
        short_condition = (score_short >= min_score) | squeeze_short

        # --- Regime filter: skip ranging ---
        if use_regime and regime_cfg["skip_ranging"]:
            long_condition = long_condition & ~is_ranging
            short_condition = short_condition & ~is_ranging

        # --- Multi-TF filter ---
        htf_trend_arr: NDArray | None = None
        if use_multi_tf and mtf_cfg["htf_trend"] and mtf_cfg["htf_timestamps"]:
            htf_trend_list = mtf_cfg["htf_trend"]
            htf_ts_list = mtf_cfg["htf_timestamps"]
            if data.timestamps is not None and len(htf_trend_list) > 0:
                # Vectorized маппинг LTF баров к HTF тренду
                htf_ts = np.array(htf_ts_list, dtype=np.float64)
                htf_trend_vals = np.array(htf_trend_list, dtype=np.float64)
                ltf_ts = np.asarray(data.timestamps, dtype=np.float64)
                idx = np.searchsorted(htf_ts, ltf_ts, side="right") - 1
                htf_trend_arr = np.zeros(n, dtype=np.float64)
                valid_idx = idx >= 0
                htf_trend_arr[valid_idx] = htf_trend_vals[idx[valid_idx]]

                # Фильтр: long только при bullish HTF, short только при bearish HTF
                long_condition = long_condition & ((htf_trend_arr >= 1.0) | (htf_trend_arr == 0.0))
                short_condition = short_condition & ((htf_trend_arr <= -1.0) | (htf_trend_arr == 0.0))

        # --- Time-of-day filter: блокируем входы в шумные часы ---
        time_cfg = cfg["time_filter"]
        if time_cfg["use"] and data.timestamps is not None:
            block_start = time_cfg["block_start_utc"]
            block_end = time_cfg["block_end_utc"]
            ts_seconds = np.asarray(data.timestamps, dtype=np.float64) / 1000.0
            hours_utc = ((ts_seconds % 86400) / 3600).astype(int)
            if block_start < block_end:
                blocked = (hours_utc >= block_start) & (hours_utc < block_end)
            else:  # overnight: e.g. 22-06
                blocked = (hours_utc >= block_start) | (hours_utc < block_end)
            long_condition = long_condition & ~blocked
            short_condition = short_condition & ~blocked

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

            # Regime vol_scale: расширяем стопы в high_vol
            current_stop_mult = stop_atr_mult
            current_tp_mult = tp_atr_mult
            if use_regime and is_high_vol[i]:
                vol_scale = regime_cfg["vol_scale"]
                current_stop_mult *= vol_scale
                current_tp_mult *= vol_scale

            # Adaptive trailing: интерполяция по ATR percentile
            if use_trailing:
                if adaptive_trailing:
                    pct = float(atr_pct[i])
                    trail_mult = trail_low_mult + (trail_high_mult - trail_low_mult) * pct / 100.0
                    trailing = trail_mult * atr_val
                else:
                    trail_current = trailing_atr_mult
                    if use_regime and is_high_vol[i]:
                        trail_current *= regime_cfg["vol_scale"]
                    trailing = trail_current * atr_val
            else:
                trailing = None

            if long_condition[i]:
                sl = price - current_stop_mult * atr_val
                tp = price + current_tp_mult * atr_val
                signal_type = "squeeze_breakout" if (use_squeeze and squeeze_long[i]) else "trend"

                # Squeeze duration weight для confluence score
                conf_score = float(score_long[i])
                if signal_type == "squeeze_breakout" and sq_max_weight > 1.0:
                    dur = float(sq_dur_at_release[i]) if sq_min_duration > 0 else 0.0
                    weight = min(dur / sq_duration_norm, sq_max_weight)
                    conf_score *= max(weight, 1.0)

                signals.append(Signal(
                    bar_index=i,
                    direction="long",
                    entry_price=price,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trailing,
                    confluence_score=conf_score,
                    signal_type=signal_type,
                ))
                last_signal_bar = i

            elif short_condition[i]:
                sl = price + current_stop_mult * atr_val
                tp = price - current_tp_mult * atr_val
                signal_type = "squeeze_breakout" if (use_squeeze and squeeze_short[i]) else "trend"

                conf_score = float(score_short[i])
                if signal_type == "squeeze_breakout" and sq_max_weight > 1.0:
                    dur = float(sq_dur_at_release[i]) if sq_min_duration > 0 else 0.0
                    weight = min(dur / sq_duration_norm, sq_max_weight)
                    conf_score *= max(weight, 1.0)

                signals.append(Signal(
                    bar_index=i,
                    direction="short",
                    entry_price=price,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trailing,
                    confluence_score=conf_score,
                    signal_type=signal_type,
                ))
                last_signal_bar = i

        return StrategyResult(
            signals=signals,
            confluence_scores_long=score_long,
            confluence_scores_short=score_short,
        )
