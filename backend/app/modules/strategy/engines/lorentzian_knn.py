"""Lorentzian KNN Strategy — полный порт из Pine Script.

Ref: strategis_1.pine (BertTradeTech ML Lorentzian KNN Classifier)

Алгоритм:
1. Вычисляем 4 фичи: RSI, WaveTrend, CCI, ADX
2. Нормализуем z-score по окну 50 баров
3. Для каждого бара: KNN с Lorentzian расстоянием d(x,y) = Σlog(1+|xi-yi|)
4. Inverse distance weighting → knn_score ∈ [-1, 1]
5. Smoothing EMA(3)
6. Confluence scoring: 5 фильтров + KNN boost ≈ max 5.5
7. Entry: trend/breakout/mean_reversion + all filters
8. Risk: ATR-based SL/TP/trailing
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.base import OHLCV, BaseStrategy, Signal, StrategyResult
from app.modules.strategy.engines.indicators.oscillators import bollinger_bands, cci, wavetrend
from app.modules.strategy.engines.indicators.smc import smc_combined, order_blocks, fair_value_gaps
from app.modules.strategy.engines.indicators.trend import (
    atr,
    calc_ma,
    dmi,
    ema,
    ma_ribbon,
    percentrank,
    rsi,
    sma,
    stdev,
)
from app.modules.strategy.engines.indicators.volume import order_flow_signals, vwap_bands


def normalize_feature(src: NDArray, period: int = 50) -> NDArray:
    """Z-score нормализация. Pine: f_normalize() lines 389-392."""
    mean = sma(src, period)
    std = stdev(src, period)
    result = np.where(std != 0, (src - mean) / std, 0.0)
    return np.nan_to_num(result, nan=0.0)


def knn_classify(
    f1: NDArray, f2: NDArray, f3: NDArray, f4: NDArray,
    close: NDArray,
    neighbors: int = 8,
    lookback: int = 50,
) -> tuple[NDArray, NDArray]:
    """Lorentzian KNN Classification.

    Pine Script ref (lines 409-438):
    For each bar:
    - Scan lookback historical bars (from 10 to lookback)
    - Lorentzian distance: d = Σ log(1 + |f_curr - f_hist|)
    - Inverse distance weight: w = 1 / max(d, 0.01)
    - Label: 5-bar forward return
    - Score = (bull_w - bear_w) / (bull_w + bear_w)
    - Confidence = max(bull_w, bear_w) / total_w * 100

    Returns (knn_score, knn_confidence).
    """
    n = len(close)
    score = np.zeros(n, dtype=np.float64)
    confidence = np.full(n, 50.0, dtype=np.float64)

    for i in range(80, n):
        bull_w = 0.0
        bear_w = 0.0
        knn_max = min(lookback, i - 10)

        for j in range(10, knn_max + 1):
            d = np.log(1.0 + abs(f1[i] - f1[i - j]))
            d += np.log(1.0 + abs(f2[i] - f2[i - j]))
            d += np.log(1.0 + abs(f3[i] - f3[i - j]))
            d += np.log(1.0 + abs(f4[i] - f4[i - j]))

            w = 1.0 / max(d, 0.01)

            if j >= 5:
                fut = (close[i - j + 5] - close[i - j]) / max(close[i - j], 0.001)
            else:
                fut = 0.0

            if fut > 0:
                bull_w += w
            else:
                bear_w += w

        total_w = bull_w + bear_w
        if total_w > 0:
            score[i] = (bull_w - bear_w) / total_w
            confidence[i] = max(bull_w, bear_w) / total_w * 100.0

    return score, confidence


def volatility_regime(
    close: NDArray, high: NDArray, low: NDArray,
    bb_period: int = 20, bb_mult: float = 2.0,
    atr_percentile_period: int = 100,
    expansion_threshold: float = 1.5,
    contraction_threshold: float = 0.7,
) -> tuple[NDArray, NDArray]:
    """Volatility regime detection. Pine lines 351-362.
    Returns (trending, ranging) — boolean arrays.
    """
    basis = sma(close, bb_period)
    dev = bb_mult * stdev(close, bb_period)
    upper = basis + dev
    lower = basis - dev
    bb_width = np.where(basis != 0, (upper - lower) / basis, 0.0)
    bb_width = np.nan_to_num(bb_width, nan=0.0)

    bb_width_sma = sma(bb_width, bb_period)
    bb_width_sma = np.nan_to_num(bb_width_sma, nan=0.0)

    atr_vals = atr(high, low, close, 14)
    atr_pctrank = percentrank(np.nan_to_num(atr_vals, nan=0.0), atr_percentile_period)
    atr_pctrank = np.nan_to_num(atr_pctrank, nan=50.0)

    high_vol = atr_pctrank > 70
    low_vol = atr_pctrank < 30
    bb_expand = np.where(bb_width_sma > 0, bb_width > bb_width_sma * expansion_threshold, False)
    bb_contract = np.where(bb_width_sma > 0, bb_width < bb_width_sma * contraction_threshold, False)

    trending = bb_expand | high_vol
    ranging = bb_contract | low_vol

    return trending, ranging


def detect_crossover(fast: NDArray, slow: NDArray) -> NDArray:
    """Crossover: fast crosses above slow. Pine: ta.crossover."""
    cross = np.zeros(len(fast), dtype=bool)
    for i in range(1, len(fast)):
        if not np.isnan(fast[i]) and not np.isnan(slow[i]):
            if not np.isnan(fast[i-1]) and not np.isnan(slow[i-1]):
                if fast[i] > slow[i] and fast[i-1] <= slow[i-1]:
                    cross[i] = True
    return cross


def detect_crossunder(fast: NDArray, slow: NDArray) -> NDArray:
    """Crossunder: fast crosses below slow. Pine: ta.crossunder."""
    cross = np.zeros(len(fast), dtype=bool)
    for i in range(1, len(fast)):
        if not np.isnan(fast[i]) and not np.isnan(slow[i]):
            if not np.isnan(fast[i-1]) and not np.isnan(slow[i-1]):
                if fast[i] < slow[i] and fast[i-1] >= slow[i-1]:
                    cross[i] = True
    return cross


class LorentzianKNNStrategy(BaseStrategy):
    """Полная реализация ML Lorentzian KNN стратегии."""

    @property
    def name(self) -> str:
        return "Machine Learning: Lorentzian KNN Classifier"

    @property
    def engine_type(self) -> str:
        return "lorentzian_knn"

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Генерация сигналов на исторических данных."""
        cfg = self.config
        n = len(data)

        # --- Config params ---
        trend_cfg = cfg.get("trend", {})
        ema_fast_period = trend_cfg.get("ema_fast", 26)
        ema_slow_period = trend_cfg.get("ema_slow", 50)
        ema_filter_period = trend_cfg.get("ema_filter", 200)

        ribbon_cfg = cfg.get("ribbon", {})
        use_ribbon = ribbon_cfg.get("use", True)
        ribbon_type = ribbon_cfg.get("type", "EMA")
        ribbon_mas = ribbon_cfg.get("mas", [9, 14, 21, 35, 55, 89, 144, 233])
        ribbon_threshold = ribbon_cfg.get("threshold", 4)

        of_cfg = cfg.get("order_flow", {})
        use_order_flow = of_cfg.get("use", True)
        cvd_period = of_cfg.get("cvd_period", 20)
        cvd_threshold = of_cfg.get("cvd_threshold", 0.7)

        smc_cfg = cfg.get("smc", {})
        use_smc = smc_cfg.get("use", True)
        fvg_min_size = smc_cfg.get("fvg_min_size", 0.5)
        liq_lookback = smc_cfg.get("liquidity_lookback", 20)
        bos_pivot = smc_cfg.get("bos_pivot", 5)

        risk_cfg = cfg.get("risk", {})
        atr_period = risk_cfg.get("atr_period", 14)
        stop_atr_mult = risk_cfg.get("stop_atr_mult", 2.0)
        tp_atr_mult = risk_cfg.get("tp_atr_mult", 30.0)
        use_trailing = risk_cfg.get("use_trailing", True)
        trailing_atr_mult = risk_cfg.get("trailing_atr_mult", 10.0)
        min_bars_trailing = risk_cfg.get("min_bars_trailing", 5)
        cooldown_bars = risk_cfg.get("cooldown_bars", 10)
        use_multi_tp = risk_cfg.get("use_multi_tp", False)
        tp_levels_cfg = risk_cfg.get("tp_levels", [])
        use_breakeven = risk_cfg.get("use_breakeven", False)

        filters_cfg = cfg.get("filters", {})
        adx_period = filters_cfg.get("adx_period", 15)
        adx_threshold = filters_cfg.get("adx_threshold", 10)
        volume_mult = filters_cfg.get("volume_mult", 1.0)
        min_confluence = filters_cfg.get("min_confluence", 3.0)

        knn_cfg = cfg.get("knn", {})
        knn_neighbors = knn_cfg.get("neighbors", 8)
        knn_lookback = knn_cfg.get("lookback", 50)
        knn_weight = knn_cfg.get("weight", 0.5)
        knn_rsi_period = knn_cfg.get("rsi_period", 15)
        knn_wt_ch = knn_cfg.get("wt_ch_len", 10)
        knn_wt_avg = knn_cfg.get("wt_avg_len", 21)
        knn_cci_period = knn_cfg.get("cci_period", 20)
        knn_adx_period = knn_cfg.get("adx_period", 14)

        breakout_cfg = cfg.get("breakout", {})
        breakout_period = breakout_cfg.get("period", 15)

        mr_cfg = cfg.get("mean_reversion", {})
        bb_period = mr_cfg.get("bb_period", 20)
        bb_std = mr_cfg.get("bb_std", 2.0)
        rsi_period = mr_cfg.get("rsi_period", 14)
        rsi_ob = mr_cfg.get("rsi_ob", 70)
        rsi_os = mr_cfg.get("rsi_os", 30)

        # --- Core Indicators ---
        atr_vals = atr(data.high, data.low, data.close, atr_period)
        ema_fast_line = ema(data.close, ema_fast_period)
        ema_slow_line = ema(data.close, ema_slow_period)
        ema_filter_line = ema(data.close, ema_filter_period)
        di_plus, di_minus, adx_vals = dmi(data.high, data.low, data.close, adx_period)

        bb_upper, bb_basis, bb_lower = bollinger_bands(data.close, bb_period, bb_std)
        rsi_vals = rsi(data.close, rsi_period)

        volume_sma_line = sma(data.volume, 20)
        volume_spike = np.where(
            ~np.isnan(volume_sma_line),
            data.volume > volume_sma_line * volume_mult,
            False,
        )

        # Highest high / lowest low for breakout
        highest_high = np.full(n, np.nan, dtype=np.float64)
        lowest_low = np.full(n, np.nan, dtype=np.float64)
        for i in range(breakout_period, n):
            highest_high[i] = np.max(data.high[i - breakout_period:i])
            lowest_low[i] = np.min(data.low[i - breakout_period:i])

        # --- MA Ribbon ---
        ribbon_bull = np.ones(n, dtype=bool)
        ribbon_bear = np.ones(n, dtype=bool)
        if use_ribbon:
            ribbon_bull, ribbon_bear = ma_ribbon(data.close, ribbon_mas, ribbon_type, ribbon_threshold)
        ribbon_filter_long = (~np.array([use_ribbon] * n)) | ribbon_bull
        ribbon_filter_short = (~np.array([use_ribbon] * n)) | ribbon_bear

        # --- VWAP + Order Flow ---
        of_filter_long = np.ones(n, dtype=bool)
        of_filter_short = np.ones(n, dtype=bool)
        if use_order_flow:
            vwap_line, _ = vwap_bands(
                data.high, data.low, data.close, data.volume,
                timestamps=data.timestamps, cvd_length=cvd_period,
            )
            of_bull, of_bear = order_flow_signals(
                data.open, data.close, data.volume, vwap_line, cvd_period, cvd_threshold
            )
            price_above_vwap = data.close > vwap_line
            price_below_vwap = data.close < vwap_line
            of_filter_long = of_bull | price_above_vwap
            of_filter_short = of_bear | price_below_vwap

        # --- SMC ---
        smc_filter_long = np.ones(n, dtype=bool)
        smc_filter_short = np.ones(n, dtype=bool)
        if use_smc:
            smc_bull, smc_bear = smc_combined(
                data.open, data.high, data.low, data.close,
                np.nan_to_num(atr_vals, nan=0.0),
                fvg_min_size, liq_lookback, bos_pivot,
            )
            bull_ob, bear_ob = order_blocks(data.open, data.close, data.high, data.low)
            bull_fvg, bear_fvg = fair_value_gaps(data.high, data.low, np.nan_to_num(atr_vals, nan=0.0), fvg_min_size)
            smc_filter_long = smc_bull | bull_ob | bull_fvg
            smc_filter_short = smc_bear | bear_ob | bear_fvg

        # --- KNN Features ---
        knn_rsi_vals = rsi(data.close, knn_rsi_period)
        knn_wt_vals = wavetrend(data.hlc3, knn_wt_ch, knn_wt_avg)
        knn_cci_vals = cci(data.close, knn_cci_period)
        _, _, knn_adx_vals = dmi(data.high, data.low, data.close, knn_adx_period)

        f1 = normalize_feature(np.nan_to_num(knn_rsi_vals, nan=50.0), 50)
        f2 = normalize_feature(np.nan_to_num(knn_wt_vals, nan=0.0), 50)
        f3 = normalize_feature(np.nan_to_num(knn_cci_vals, nan=0.0), 50)
        f4 = normalize_feature(np.nan_to_num(knn_adx_vals, nan=0.0), 50)

        # --- KNN Classification ---
        knn_score, knn_conf = knn_classify(f1, f2, f3, f4, data.close, knn_neighbors, knn_lookback)
        knn_smooth = ema(knn_score, 3)
        knn_smooth = np.nan_to_num(knn_smooth, nan=0.0)

        knn_bullish = knn_smooth > 0.1
        knn_bearish = knn_smooth < -0.1
        knn_classes = np.where(knn_bullish, 1, np.where(knn_bearish, -1, 0))

        # --- Trend detection ---
        adx_safe = np.nan_to_num(adx_vals, nan=0.0)
        is_trending = adx_safe > adx_threshold
        is_ranging = adx_safe <= adx_threshold
        bullish_trend = np.zeros(n, dtype=bool)
        bearish_trend = np.zeros(n, dtype=bool)
        for i in range(n):
            if not np.isnan(ema_fast_line[i]) and not np.isnan(ema_slow_line[i]) and not np.isnan(ema_filter_line[i]):
                bullish_trend[i] = ema_fast_line[i] > ema_slow_line[i] and data.close[i] > ema_filter_line[i]
                bearish_trend[i] = ema_fast_line[i] < ema_slow_line[i] and data.close[i] < ema_filter_line[i]

        # --- Confluence Scoring ---
        mtf_filter_long = np.ones(n, dtype=bool)
        mtf_filter_short = np.ones(n, dtype=bool)

        knn_boost_long = np.where(knn_bullish, knn_weight, 0.0)
        knn_boost_short = np.where(knn_bearish, knn_weight, 0.0)

        score_long = (
            mtf_filter_long.astype(float)
            + ribbon_filter_long.astype(float)
            + of_filter_long.astype(float)
            + smc_filter_long.astype(float)
            + (adx_safe > adx_threshold).astype(float)
            + knn_boost_long
        )
        score_short = (
            mtf_filter_short.astype(float)
            + ribbon_filter_short.astype(float)
            + of_filter_short.astype(float)
            + smc_filter_short.astype(float)
            + (adx_safe > adx_threshold).astype(float)
            + knn_boost_short
        )

        # --- Entry Conditions ---
        ema_cross_up = detect_crossover(ema_fast_line, ema_slow_line)
        ema_cross_down = detect_crossunder(ema_fast_line, ema_slow_line)
        rsi_cross_up = detect_crossover(np.nan_to_num(rsi_vals, nan=50.0), np.full(n, float(rsi_os)))
        rsi_cross_down = detect_crossunder(np.nan_to_num(rsi_vals, nan=50.0), np.full(n, float(rsi_ob)))

        trend_long = is_trending & bullish_trend & ema_cross_up & volume_spike
        trend_short = is_trending & bearish_trend & ema_cross_down & volume_spike

        breakout_long = np.zeros(n, dtype=bool)
        breakout_short = np.zeros(n, dtype=bool)
        for i in range(1, n):
            if not np.isnan(highest_high[i]) and not np.isnan(ema_filter_line[i]):
                breakout_long[i] = data.close[i] > highest_high[i] and volume_spike[i] and data.close[i] > ema_filter_line[i]
                breakout_short[i] = data.close[i] < lowest_low[i] and volume_spike[i] and data.close[i] < ema_filter_line[i]

        rsi_safe = np.nan_to_num(rsi_vals, nan=50.0)
        bb_lower_safe = np.nan_to_num(bb_lower, nan=0.0)
        bb_upper_safe = np.nan_to_num(bb_upper, nan=999999.0)

        mr_long = is_ranging & (data.close < bb_lower_safe) & (rsi_safe < rsi_os) & rsi_cross_up
        mr_short = is_ranging & (data.close > bb_upper_safe) & (rsi_safe > rsi_ob) & rsi_cross_down

        long_condition = (
            (trend_long | breakout_long | mr_long)
            & ribbon_filter_long & of_filter_long & smc_filter_long
            & (score_long >= min_confluence)
        )
        short_condition = (
            (trend_short | breakout_short | mr_short)
            & ribbon_filter_short & of_filter_short & smc_filter_short
            & (score_short >= min_confluence)
        )

        # --- Generate Signals ---
        signals: list[Signal] = []
        in_position = False
        position_side: str = ""
        position_entry_bar: int = 0
        stop_loss_price: float = 0.0
        take_profit_price: float = 0.0
        current_trailing_stop: float = 0.0
        trailing_atr_value: float = 0.0
        last_exit_bar: int = -999
        last_exit_direction: str = ""
        last_exit_was_loss: bool = False

        for i in range(n):
            if np.isnan(atr_vals[i]):
                continue

            # --- Проверка SL/TP/Trailing для открытой позиции ---
            if in_position:
                bars_in_trade = i - position_entry_bar
                trailing_active = bars_in_trade >= min_bars_trailing

                if position_side == "long":
                    # Trailing stop: подтягиваем вверх по HIGH (как на бирже)
                    if use_trailing and trailing_atr_value > 0 and trailing_active:
                        new_trail = float(data.high[i]) - trailing_atr_value
                        if new_trail > current_trailing_stop:
                            current_trailing_stop = new_trail
                        if float(data.low[i]) <= current_trailing_stop:
                            last_exit_bar = i
                            last_exit_direction = "long"
                            last_exit_was_loss = float(data.close[i]) < float(data.close[position_entry_bar])
                            in_position = False
                            continue
                    # Stop-loss hit
                    if float(data.low[i]) <= stop_loss_price:
                        last_exit_bar = i
                        last_exit_direction = "long"
                        last_exit_was_loss = True
                        in_position = False
                        continue
                    # Take-profit hit
                    if float(data.high[i]) >= take_profit_price:
                        last_exit_bar = i
                        last_exit_direction = "long"
                        last_exit_was_loss = False
                        in_position = False
                        continue
                    # Противоположный сигнал — тоже закрытие
                    if short_condition[i]:
                        last_exit_bar = i
                        last_exit_direction = "long"
                        last_exit_was_loss = float(data.close[i]) < float(data.close[position_entry_bar])
                        in_position = False

                elif position_side == "short":
                    # Trailing stop: подтягиваем вниз по LOW (как на бирже)
                    if use_trailing and trailing_atr_value > 0 and trailing_active:
                        new_trail = float(data.low[i]) + trailing_atr_value
                        if new_trail < current_trailing_stop:
                            current_trailing_stop = new_trail
                        if float(data.high[i]) >= current_trailing_stop:
                            last_exit_bar = i
                            last_exit_direction = "short"
                            last_exit_was_loss = float(data.close[i]) > float(data.close[position_entry_bar])
                            in_position = False
                            continue
                    # Stop-loss hit
                    if float(data.high[i]) >= stop_loss_price:
                        last_exit_bar = i
                        last_exit_direction = "short"
                        last_exit_was_loss = True
                        in_position = False
                        continue
                    # Take-profit hit
                    if float(data.low[i]) <= take_profit_price:
                        last_exit_bar = i
                        last_exit_direction = "short"
                        last_exit_was_loss = False
                        in_position = False
                        continue
                    # Противоположный сигнал — закрытие
                    if long_condition[i]:
                        last_exit_bar = i
                        last_exit_direction = "short"
                        last_exit_was_loss = float(data.close[i]) > float(data.close[position_entry_bar])
                        in_position = False

            # --- Открытие новой позиции ---
            # Cooldown: после убыточного стопа не входим в ту же сторону N баров
            long_cooldown = (
                last_exit_was_loss
                and last_exit_direction == "long"
                and (i - last_exit_bar) < cooldown_bars
            )
            short_cooldown = (
                last_exit_was_loss
                and last_exit_direction == "short"
                and (i - last_exit_bar) < cooldown_bars
            )

            if not in_position and long_condition[i] and not long_cooldown:
                sig_type = "trend" if trend_long[i] else "breakout" if breakout_long[i] else "mean_reversion"
                entry = float(data.close[i])
                sl = float(data.close[i] - atr_vals[i] * stop_atr_mult)
                tp = float(data.close[i] + atr_vals[i] * tp_atr_mult)
                trail = float(atr_vals[i] * trailing_atr_mult) if use_trailing else None
                # Multi-TP: расстояния в абсолютных единицах (ATR * mult)
                sig_tp_levels = None
                if use_multi_tp and tp_levels_cfg:
                    sig_tp_levels = [
                        {"atr_mult": float(atr_vals[i] * lvl["atr_mult"]), "close_pct": lvl["close_pct"]}
                        for lvl in tp_levels_cfg
                    ]
                signals.append(Signal(
                    bar_index=i,
                    direction="long",
                    entry_price=entry,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trail,
                    confluence_score=float(score_long[i]),
                    signal_type=sig_type,
                    tp_levels=sig_tp_levels,
                ))
                in_position = True
                position_side = "long"
                position_entry_bar = i
                stop_loss_price = sl
                take_profit_price = tp
                trailing_atr_value = trail if trail is not None else 0.0
                current_trailing_stop = entry - trailing_atr_value if use_trailing else 0.0

            elif not in_position and short_condition[i] and not short_cooldown:
                sig_type = "trend" if trend_short[i] else "breakout" if breakout_short[i] else "mean_reversion"
                entry = float(data.close[i])
                sl = float(data.close[i] + atr_vals[i] * stop_atr_mult)
                tp = float(data.close[i] - atr_vals[i] * tp_atr_mult)
                trail = float(atr_vals[i] * trailing_atr_mult) if use_trailing else None
                sig_tp_levels = None
                if use_multi_tp and tp_levels_cfg:
                    sig_tp_levels = [
                        {"atr_mult": float(atr_vals[i] * lvl["atr_mult"]), "close_pct": lvl["close_pct"]}
                        for lvl in tp_levels_cfg
                    ]
                signals.append(Signal(
                    bar_index=i,
                    direction="short",
                    entry_price=entry,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trail,
                    confluence_score=float(score_short[i]),
                    signal_type=sig_type,
                    tp_levels=sig_tp_levels,
                ))
                in_position = True
                position_side = "short"
                position_entry_bar = i
                stop_loss_price = sl
                take_profit_price = tp
                trailing_atr_value = trail if trail is not None else 0.0
                current_trailing_stop = entry + trailing_atr_value if use_trailing else float("inf")

        return StrategyResult(
            signals=signals,
            confluence_scores_long=score_long,
            confluence_scores_short=score_short,
            knn_scores=knn_smooth,
            knn_classes=knn_classes,
        )
