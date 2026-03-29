"""Осцилляторы: WaveTrend, CCI, Bollinger Bands.

Все функции — чистые numpy, без состояния.
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.indicators.trend import ema, sma, stdev


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
