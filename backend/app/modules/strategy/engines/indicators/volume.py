"""Индикаторы объёма: VWAP, CVD, Volume Profile.

Все функции — чистые numpy, без состояния.
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.indicators.trend import sma


def vwap_bands(
    high: NDArray,
    low: NDArray,
    close: NDArray,
    volume: NDArray,
    std_mults: list[float] | None = None,
) -> tuple[NDArray, list[tuple[NDArray, NDArray]]]:
    """VWAP с полосами стандартного отклонения.

    Returns (vwap_line, [(upper1, lower1), (upper2, lower2), ...]).
    """
    if std_mults is None:
        std_mults = [1.0, 2.0, 3.0]

    hlc3 = (high + low + close) / 3
    cum_vol_price = np.cumsum(volume * hlc3)
    cum_vol = np.cumsum(volume)

    vwap_line = np.where(cum_vol > 0, cum_vol_price / cum_vol, close)

    dev = sma(np.abs(close - vwap_line), 20)
    dev = np.nan_to_num(dev, nan=0.0)

    bands = []
    for mult in std_mults:
        upper = vwap_line + mult * dev
        lower = vwap_line - mult * dev
        bands.append((upper, lower))

    return vwap_line, bands


def cvd(
    open_: NDArray, close: NDArray, volume: NDArray, period: int = 20
) -> tuple[NDArray, NDArray]:
    """Cumulative Volume Delta + SMA.

    Returns (cvd_line, cvd_sma_line).
    """
    buy_vol = np.where(close > open_, volume, 0.0)
    sell_vol = np.where(close < open_, volume, 0.0)
    delta = buy_vol - sell_vol
    cvd_line = np.cumsum(delta)
    cvd_sma_line = sma(cvd_line, period)
    return cvd_line, cvd_sma_line


def order_flow_signals(
    open_: NDArray,
    close: NDArray,
    volume: NDArray,
    vwap_line: NDArray,
    cvd_period: int = 20,
    cvd_threshold: float = 0.7,
) -> tuple[NDArray, NDArray]:
    """Order Flow сигналы: bullish/bearish.

    Returns (of_bullish, of_bearish) — boolean arrays.
    """
    buy_vol = np.where(close > open_, volume, 0.0)
    sell_vol = np.where(close < open_, volume, 0.0)
    delta = buy_vol - sell_vol
    cvd_line = np.cumsum(delta)
    cvd_sma_line = sma(cvd_line, cvd_period)

    cvd_bull = np.zeros(len(close), dtype=bool)
    cvd_bear = np.zeros(len(close), dtype=bool)
    for i in range(1, len(close)):
        if not np.isnan(cvd_sma_line[i]):
            cvd_bull[i] = cvd_line[i] > cvd_sma_line[i] and close[i] < close[i-1] and cvd_line[i] > cvd_line[i-1]
            cvd_bear[i] = cvd_line[i] < cvd_sma_line[i] and close[i] > close[i-1] and cvd_line[i] < cvd_line[i-1]

    volume_ratio = np.where(sell_vol > 0, buy_vol / sell_vol, buy_vol)
    strong_buying = volume_ratio > (1 + cvd_threshold)
    strong_selling = volume_ratio < (1 - cvd_threshold)

    price_above_vwap = close > vwap_line
    price_below_vwap = close < vwap_line
    vwap_cross_up = np.zeros(len(close), dtype=bool)
    vwap_cross_down = np.zeros(len(close), dtype=bool)
    for i in range(1, len(close)):
        vwap_cross_up[i] = close[i] > vwap_line[i] and close[i-1] <= vwap_line[i-1]
        vwap_cross_down[i] = close[i] < vwap_line[i] and close[i-1] >= vwap_line[i-1]

    of_bullish = (cvd_bull | strong_buying) & (vwap_cross_up | price_above_vwap)
    of_bearish = (cvd_bear | strong_selling) & (vwap_cross_down | price_below_vwap)

    return of_bullish, of_bearish
