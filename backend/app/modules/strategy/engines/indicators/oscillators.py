"""Осцилляторы: WaveTrend, CCI, Bollinger Bands.

Все функции — чистые numpy, без состояния.
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.indicators.trend import atr, ema, sma, stdev


def wavetrend(
    hlc3: NDArray, channel_len: int = 10, avg_len: int = 21
) -> NDArray:
    """WaveTrend Oscillator (LazyBear implementation).

    Pine Script ref (lines 376-380):
        wt_esa = ta.ema(hlc3, knn_wt_n1)
        wt_d = ta.ema(math.abs(hlc3 - wt_esa), knn_wt_n1)
        wt_ci = wt_d != 0 ? (hlc3 - wt_esa) / (0.015 * wt_d) : 0.0
        knn_wt_val = ta.ema(wt_ci, knn_wt_n2)
    """
    esa = ema(hlc3, channel_len)
    d = ema(np.abs(hlc3 - esa), channel_len)
    ci = np.where(d != 0, (hlc3 - esa) / (0.015 * d), 0.0)
    ci = np.nan_to_num(ci, nan=0.0)
    return ema(ci, avg_len)


def cci(close: NDArray, period: int = 20) -> NDArray:
    """Commodity Channel Index. Pine: ta.cci(close, period).

    CCI = (close - SMA(close, period)) / (0.015 * mean_deviation)
    """
    out = np.full_like(close, np.nan, dtype=np.float64)
    if len(close) < period:
        return out

    sma_vals = sma(close, period)

    for i in range(period - 1, len(close)):
        window = close[i - period + 1:i + 1]
        mean_dev = np.mean(np.abs(window - sma_vals[i]))
        if mean_dev != 0:
            out[i] = (close[i] - sma_vals[i]) / (0.015 * mean_dev)
        else:
            out[i] = 0.0

    return out


def bollinger_bands(
    close: NDArray, period: int = 20, mult: float = 2.0
) -> tuple[NDArray, NDArray, NDArray]:
    """Bollinger Bands. Returns (upper, basis, lower)."""
    basis = sma(close, period)
    dev = mult * stdev(close, period)
    upper = basis + dev
    lower = basis - dev
    return upper, basis, lower


def keltner_channel(
    high: NDArray, low: NDArray, close: NDArray,
    period: int = 20, multiplier: float = 1.5,
) -> tuple[NDArray, NDArray, NDArray]:
    """Keltner Channel. Basis = EMA(close), bands = basis +/- mult * ATR.

    Returns (upper, basis, lower).
    """
    basis = ema(close, period)
    atr_vals = atr(high, low, close, period)
    upper = basis + multiplier * atr_vals
    lower = basis - multiplier * atr_vals
    return upper, basis, lower


def squeeze_momentum(
    high: NDArray, low: NDArray, close: NDArray,
    bb_period: int = 20, bb_mult: float = 2.0,
    kc_period: int = 20, kc_mult: float = 1.5,
    mom_period: int = 20,
) -> tuple[NDArray, NDArray, NDArray]:
    """Squeeze Momentum Indicator (LazyBear / TTM Squeeze).

    Squeeze ON: BB inside Keltner Channel (low volatility).
    Momentum: linear regression of (close - avg(HL2, close)).
    Histogram color: direction + acceleration.

    Returns (squeeze_on, momentum, hist_color).
    - squeeze_on: bool array, True when BB is inside KC
    - momentum: float array, momentum value
    - hist_color: 1=lime, 2=green, -1=red, -2=maroon
    """
    n = len(close)

    # Bollinger Bands
    bb_upper, bb_basis, bb_lower = bollinger_bands(close, bb_period, bb_mult)

    # Keltner Channel
    kc_upper, kc_basis, kc_lower = keltner_channel(high, low, close, kc_period, kc_mult)

    # Squeeze detection: BB inside KC
    squeeze_on = np.zeros(n, dtype=bool)
    for i in range(n):
        if not np.isnan(bb_lower[i]) and not np.isnan(kc_lower[i]):
            squeeze_on[i] = (bb_lower[i] > kc_lower[i]) and (bb_upper[i] < kc_upper[i])

    # Momentum: linear regression of (close - midline)
    hl2 = (high + low) / 2.0
    midline = sma(hl2, mom_period)
    delta = close - np.nan_to_num(midline, nan=close)

    momentum = np.full(n, np.nan, dtype=np.float64)
    for i in range(mom_period - 1, n):
        window = delta[i - mom_period + 1:i + 1]
        if np.any(np.isnan(window)):
            continue
        x = np.arange(mom_period, dtype=np.float64)
        coeffs = np.polyfit(x, window, 1)
        momentum[i] = coeffs[0] * (mom_period - 1) + coeffs[1]

    # Histogram color: direction + acceleration
    hist_color = np.zeros(n, dtype=np.float64)
    for i in range(1, n):
        if np.isnan(momentum[i]):
            continue
        if momentum[i] > 0:
            hist_color[i] = 1.0 if momentum[i] > momentum[i - 1] else 2.0
        else:
            hist_color[i] = -1.0 if momentum[i] < momentum[i - 1] else -2.0

    return squeeze_on, momentum, hist_color
