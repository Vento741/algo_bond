"""Осцилляторы: WaveTrend, CCI, Bollinger Bands.

Все функции — чистые numpy, без состояния.
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.indicators.trend import atr, ema, rolling_max, rolling_min, sma, stdev


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
    use_sma: bool = False,
) -> tuple[NDArray, NDArray, NDArray]:
    """Keltner Channel. Basis = EMA(close) или SMA(close), bands = basis +/- mult * ATR.

    TTM Squeeze оригинал использует SMA basis (use_sma=True).
    По умолчанию EMA для обратной совместимости.

    Returns (upper, basis, lower).
    """
    basis = sma(close, period) if use_sma else ema(close, period)
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

    # Keltner Channel (TTM Squeeze использует SMA basis)
    kc_upper, kc_basis, kc_lower = keltner_channel(
        high, low, close, kc_period, kc_mult, use_sma=True,
    )

    # Squeeze detection: BB inside KC (vectorized)
    valid = ~np.isnan(bb_lower) & ~np.isnan(kc_lower)
    squeeze_on = valid & (bb_lower > kc_lower) & (bb_upper < kc_upper)

    # Momentum: vectorized linear regression of (close - midline)
    # Closed-form linreg via pre-computed coefficients + np.convolve (785x faster)
    # LazyBear/TTM Squeeze midline: avg(avg(highest(high,N), lowest(low,N)), sma(close,N))
    # = ((highest_high + lowest_low) / 2 + sma(close, N)) / 2
    hh = rolling_max(high, kc_period)
    ll = rolling_min(low, kc_period)
    sma_close = sma(close, kc_period)
    midline = (((hh + ll) / 2.0) + sma_close) / 2.0
    delta = close - np.nan_to_num(midline, nan=close)

    momentum = np.full(n, np.nan, dtype=np.float64)
    if n >= mom_period:
        p = mom_period
        x = np.arange(p, dtype=np.float64)
        x_mean = x.mean()
        x_var = np.sum((x - x_mean) ** 2)

        # Rolling sum via cumsum
        cumsum = np.cumsum(delta)
        rolling_sum = np.empty(n - p + 1, dtype=np.float64)
        rolling_sum[0] = cumsum[p - 1]
        rolling_sum[1:] = cumsum[p:] - cumsum[:n - p]
        rolling_mean = rolling_sum / p

        # Weighted sum via convolution
        weights = np.arange(p, dtype=np.float64)
        weighted = np.convolve(delta, weights[::-1], mode="valid")

        # slope and intercept
        slope = (weighted - p * x_mean * rolling_mean) / x_var
        intercept = rolling_mean - slope * x_mean
        momentum[p - 1:] = slope * (p - 1) + intercept

    # Histogram color: direction + acceleration (vectorized)
    hist_color = np.zeros(n, dtype=np.float64)
    mom_valid = ~np.isnan(momentum)
    mom_prev = np.roll(momentum, 1)
    mom_prev[0] = np.nan
    accel = momentum > mom_prev
    hist_color = np.where(
        ~mom_valid, 0.0,
        np.where(momentum > 0,
                 np.where(accel, 1.0, 2.0),
                 np.where(~accel, -1.0, -2.0))
    )

    return squeeze_on, momentum, hist_color
