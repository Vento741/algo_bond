"""Трендовые индикаторы: RSI, EMA, SMA, HMA, WMA, ADX/DMI, ATR.

Все функции принимают numpy-массивы и возвращают numpy-массивы.
NaN в начале — нормальное поведение (недостаточно данных для расчёта).
Совместимость с Pine Script ta.* built-ins (Wilder's smoothing для RSI/ADX/ATR).
"""

import numpy as np
from numpy.typing import NDArray


def sma(src: NDArray, period: int) -> NDArray:
    """Simple Moving Average. Pine: ta.sma(src, period)."""
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    cumsum = np.cumsum(src)
    cumsum[period:] = cumsum[period:] - cumsum[:-period]
    out[period - 1:] = cumsum[period - 1:] / period
    return out


def ema(src: NDArray, period: int) -> NDArray:
    """Exponential Moving Average. Pine: ta.ema(src, period).
    Pine EMA uses alpha = 2/(period+1).
    """
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    alpha = 2.0 / (period + 1)
    out[period - 1] = np.mean(src[:period])
    for i in range(period, len(src)):
        out[i] = alpha * src[i] + (1 - alpha) * out[i - 1]
    return out


def wma(src: NDArray, period: int) -> NDArray:
    """Weighted Moving Average. Pine: ta.wma(src, period)."""
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    weights = np.arange(1, period + 1, dtype=np.float64)
    weight_sum = weights.sum()
    for i in range(period - 1, len(src)):
        out[i] = np.dot(src[i - period + 1:i + 1], weights) / weight_sum
    return out


def hma(src: NDArray, period: int) -> NDArray:
    """Hull Moving Average. Pine: custom hma() function.
    HMA = WMA(2*WMA(n/2) - WMA(n), sqrt(n))
    Ref: strategis_1.pine lines 130-133
    """
    half_period = max(period // 2, 1)
    sqrt_period = max(int(np.round(np.sqrt(period))), 1)
    wma_half = wma(src, half_period)
    wma_full = wma(src, period)
    diff = 2.0 * wma_half - wma_full
    return wma(diff, sqrt_period)


def calc_ma(src: NDArray, period: int, ma_type: str = "EMA") -> NDArray:
    """Универсальный MA. Pine: calc_ma(src, len, ma_type).
    Ref: strategis_1.pine lines 135-140
    """
    if ma_type == "SMA":
        return sma(src, period)
    elif ma_type == "HMA":
        return hma(src, period)
    else:
        return ema(src, period)


def rsi(close: NDArray, period: int = 14) -> NDArray:
    """Relative Strength Index. Pine: ta.rsi(close, period).
    Uses Wilder's smoothing (RMA), same as Pine Script.
    """
    out = np.full_like(close, np.nan, dtype=np.float64)
    if len(close) < period + 1:
        return out

    deltas = np.diff(close)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    out[period] = 100.0 - 100.0 / (1.0 + avg_gain / avg_loss) if avg_loss != 0 else 100.0

    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            out[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            out[i + 1] = 100.0 - 100.0 / (1.0 + rs)

    return out


def atr(high: NDArray, low: NDArray, close: NDArray, period: int = 14) -> NDArray:
    """Average True Range. Pine: ta.atr(period).
    Wilder's smoothing (RMA) of True Range.
    """
    out = np.full_like(close, np.nan, dtype=np.float64)
    if len(close) < period + 1:
        return out

    tr = np.empty(len(close) - 1, dtype=np.float64)
    for i in range(1, len(close)):
        tr[i - 1] = max(
            high[i] - low[i],
            abs(high[i] - close[i - 1]),
            abs(low[i] - close[i - 1]),
        )

    out[period] = np.mean(tr[:period])

    for i in range(period, len(tr)):
        out[i + 1] = (out[i] * (period - 1) + tr[i]) / period

    return out


def dmi(
    high: NDArray, low: NDArray, close: NDArray, period: int = 14
) -> tuple[NDArray, NDArray, NDArray]:
    """Directional Movement Index. Pine: ta.dmi(period, period).
    Returns (di_plus, di_minus, adx).
    Wilder's smoothing, same as Pine Script.
    """
    n = len(close)
    di_plus = np.full(n, np.nan, dtype=np.float64)
    di_minus = np.full(n, np.nan, dtype=np.float64)
    adx_out = np.full(n, np.nan, dtype=np.float64)

    if n < period * 2 + 1:
        return di_plus, di_minus, adx_out

    tr = np.empty(n - 1, dtype=np.float64)
    plus_dm = np.empty(n - 1, dtype=np.float64)
    minus_dm = np.empty(n - 1, dtype=np.float64)

    for i in range(1, n):
        tr[i - 1] = max(
            high[i] - low[i],
            abs(high[i] - close[i - 1]),
            abs(low[i] - close[i - 1]),
        )
        up_move = high[i] - high[i - 1]
        down_move = low[i - 1] - low[i]
        plus_dm[i - 1] = up_move if up_move > down_move and up_move > 0 else 0.0
        minus_dm[i - 1] = down_move if down_move > up_move and down_move > 0 else 0.0

    smooth_tr = np.mean(tr[:period])
    smooth_plus = np.mean(plus_dm[:period])
    smooth_minus = np.mean(minus_dm[:period])

    if smooth_tr > 0:
        di_plus[period] = 100.0 * smooth_plus / smooth_tr
        di_minus[period] = 100.0 * smooth_minus / smooth_tr
    else:
        di_plus[period] = 0.0
        di_minus[period] = 0.0

    dx_values = []
    di_sum = di_plus[period] + di_minus[period]
    dx = abs(di_plus[period] - di_minus[period]) / di_sum * 100.0 if di_sum > 0 else 0.0
    dx_values.append(dx)

    for i in range(period, len(tr)):
        smooth_tr = (smooth_tr * (period - 1) + tr[i]) / period
        smooth_plus = (smooth_plus * (period - 1) + plus_dm[i]) / period
        smooth_minus = (smooth_minus * (period - 1) + minus_dm[i]) / period

        if smooth_tr > 0:
            di_plus[i + 1] = 100.0 * smooth_plus / smooth_tr
            di_minus[i + 1] = 100.0 * smooth_minus / smooth_tr
        else:
            di_plus[i + 1] = 0.0
            di_minus[i + 1] = 0.0

        di_sum = di_plus[i + 1] + di_minus[i + 1]
        dx = abs(di_plus[i + 1] - di_minus[i + 1]) / di_sum * 100.0 if di_sum > 0 else 0.0
        dx_values.append(dx)

    if len(dx_values) >= period:
        adx_val = np.mean(dx_values[:period])
        adx_out[period * 2] = adx_val
        for i in range(period, len(dx_values)):
            adx_val = (adx_val * (period - 1) + dx_values[i]) / period
            idx = period + i + 1
            if idx < n:
                adx_out[idx] = adx_val

    return di_plus, di_minus, adx_out


def stdev(src: NDArray, period: int) -> NDArray:
    """Rolling standard deviation. Pine: ta.stdev(src, period)."""
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    for i in range(period - 1, len(src)):
        out[i] = np.std(src[i - period + 1:i + 1], ddof=0)
    return out


def percentrank(src: NDArray, period: int) -> NDArray:
    """Percent rank. Pine: ta.percentrank(src, period)."""
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period + 1:
        return out
    for i in range(period, len(src)):
        window = src[i - period:i]
        count = np.sum(window < src[i])
        out[i] = count / period * 100.0
    return out


def ma_ribbon(
    close: NDArray,
    periods: list[int],
    ma_type: str = "EMA",
    threshold: int = 4,
) -> tuple[NDArray, NDArray]:
    """MA Ribbon alignment. Pine: lines 163-176.
    Returns (bullish_bool_array, bearish_bool_array).
    """
    n = len(close)
    mas = [calc_ma(close, p, ma_type) for p in periods]

    bullish_count = np.zeros(n, dtype=np.float64)
    bearish_count = np.zeros(n, dtype=np.float64)

    for i in range(len(mas) - 1):
        bullish_count += np.where(
            ~np.isnan(mas[i]) & ~np.isnan(mas[i + 1]),
            np.where(mas[i] > mas[i + 1], 1.0, 0.0),
            0.0,
        )
        bearish_count += np.where(
            ~np.isnan(mas[i]) & ~np.isnan(mas[i + 1]),
            np.where(mas[i] < mas[i + 1], 1.0, 0.0),
            0.0,
        )

    bullish = bullish_count >= (threshold - 1)
    bearish = bearish_count >= (threshold - 1)
    return bullish, bearish
