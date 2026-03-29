"""Smart Money Concepts: Order Blocks, FVG, Liquidity Sweeps, BOS, Demand/Supply.

Все функции возвращают boolean-массивы сигналов.
Ref: strategis_1.pine lines 247-349
"""

import numpy as np
from numpy.typing import NDArray


def order_blocks(
    open_: NDArray, close: NDArray, high: NDArray, low: NDArray
) -> tuple[NDArray, NDArray]:
    """Order Blocks — engulfing patterns.
    Returns (bullish_ob, bearish_ob) — boolean arrays.
    """
    n = len(close)
    bullish = np.zeros(n, dtype=bool)
    bearish = np.zeros(n, dtype=bool)

    for i in range(1, n):
        candle_range = high[i] - low[i]
        if candle_range == 0:
            continue
        if (close[i] > open_[i] and close[i-1] < open_[i-1]
                and (high[i] - close[i]) < candle_range * 0.3):
            bullish[i] = True
        if (close[i] < open_[i] and close[i-1] > open_[i-1]
                and (close[i] - low[i]) < candle_range * 0.3):
            bearish[i] = True

    return bullish, bearish


def fair_value_gaps(
    high: NDArray, low: NDArray, atr_vals: NDArray, fvg_min_size: float = 0.5
) -> tuple[NDArray, NDArray]:
    """Fair Value Gaps.
    Returns (bullish_fvg, bearish_fvg) — boolean arrays.
    """
    n = len(high)
    bullish = np.zeros(n, dtype=bool)
    bearish = np.zeros(n, dtype=bool)

    for i in range(2, n):
        if np.isnan(atr_vals[i]):
            continue
        if low[i] > high[i-2] and (low[i] - high[i-2]) > atr_vals[i] * fvg_min_size:
            bullish[i] = True
        if high[i] < low[i-2] and (low[i-2] - high[i]) > atr_vals[i] * fvg_min_size:
            bearish[i] = True

    return bullish, bearish


def liquidity_sweeps(
    high: NDArray, low: NDArray, open_: NDArray, close: NDArray,
    lookback: int = 20
) -> tuple[NDArray, NDArray]:
    """Liquidity Sweeps.
    Returns (liq_grab_high, liq_grab_low) — boolean arrays.
    """
    n = len(close)
    grab_high = np.zeros(n, dtype=bool)
    grab_low = np.zeros(n, dtype=bool)

    for i in range(lookback + 1, n):
        recent_high = np.max(high[i - lookback:i])
        recent_low = np.min(low[i - lookback:i])
        if high[i] > recent_high and close[i] < open_[i] and close[i] < recent_high:
            grab_high[i] = True
        if low[i] < recent_low and close[i] > open_[i] and close[i] > recent_low:
            grab_low[i] = True

    return grab_high, grab_low


def break_of_structure(
    high: NDArray, low: NDArray, close: NDArray, pivot_len: int = 5
) -> tuple[NDArray, NDArray]:
    """Break of Structure (BOS).
    Returns (bullish_bos, bearish_bos) — boolean arrays.
    """
    n = len(close)
    bullish_bos = np.zeros(n, dtype=bool)
    bearish_bos = np.zeros(n, dtype=bool)

    last_swing_high = np.nan
    last_swing_low = np.nan

    for i in range(pivot_len, n):
        check_idx = i - pivot_len
        if check_idx >= pivot_len:
            window_start = check_idx - pivot_len
            window_end = check_idx + pivot_len + 1
            if window_end <= n:
                window_h = high[window_start:window_end]
                if high[check_idx] == np.max(window_h):
                    last_swing_high = high[check_idx]
                window_l = low[window_start:window_end]
                if low[check_idx] == np.min(window_l):
                    last_swing_low = low[check_idx]

        if i >= 1 and not np.isnan(last_swing_high):
            if close[i] > last_swing_high and close[i-1] <= last_swing_high:
                bullish_bos[i] = True
        if i >= 1 and not np.isnan(last_swing_low):
            if close[i] < last_swing_low and close[i-1] >= last_swing_low:
                bearish_bos[i] = True

    return bullish_bos, bearish_bos


def demand_supply_zones(
    open_: NDArray, close: NDArray, atr_vals: NDArray, impulse_mult: float = 1.5
) -> tuple[NDArray, NDArray]:
    """Demand/Supply zone detection.
    Returns (demand_signal, supply_signal) — boolean arrays.
    """
    n = len(close)
    demand = np.zeros(n, dtype=bool)
    supply = np.zeros(n, dtype=bool)

    for i in range(1, n):
        if np.isnan(atr_vals[i]):
            continue
        impulse_up = (close[i] - open_[i]) > atr_vals[i] * impulse_mult and close[i] > open_[i]
        impulse_down = (open_[i] - close[i]) > atr_vals[i] * impulse_mult and close[i] < open_[i]
        if impulse_up and close[i-1] < open_[i-1]:
            demand[i] = True
        if impulse_down and close[i-1] > open_[i-1]:
            supply[i] = True

    return demand, supply


def smc_combined(
    open_: NDArray, high: NDArray, low: NDArray, close: NDArray,
    atr_vals: NDArray,
    fvg_min_size: float = 0.5,
    liquidity_lookback: int = 20,
    bos_pivot: int = 5,
) -> tuple[NDArray, NDArray]:
    """Комбинированный SMC сигнал.
    Returns (smc_bullish, smc_bearish) — boolean arrays.
    """
    bull_ob, bear_ob = order_blocks(open_, close, high, low)
    bull_fvg, bear_fvg = fair_value_gaps(high, low, atr_vals, fvg_min_size)
    grab_high, grab_low = liquidity_sweeps(high, low, open_, close, liquidity_lookback)
    bull_bos, bear_bos = break_of_structure(high, low, close, bos_pivot)

    smc_bullish = bull_ob | bull_fvg | grab_low | bull_bos
    smc_bearish = bear_ob | bear_fvg | grab_high | bear_bos

    return smc_bullish, smc_bearish
