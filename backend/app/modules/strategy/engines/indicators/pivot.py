"""Pivot Point индикаторы — rolling pivot + S/R уровни + velocity.

Используется в PivotPointMeanReversion стратегии.
Чистый numpy, NaN-safe (первые N значений = NaN, как у trend.py).
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def rolling_pivot(
    high: NDArray,
    low: NDArray,
    close: NDArray,
    period: int,
) -> tuple[NDArray, NDArray, NDArray, NDArray, NDArray, NDArray, NDArray]:
    """Rolling Pivot Point с уровнями S1-S3 и R1-R3.

    Для каждого бара i >= period:
        H = max(high[i-period:i])
        L = min(low[i-period:i])
        C = close[i-1]
        P = (H + L + C) / 3
        R1 = 2*P - L
        S1 = 2*P - H
        R2 = P + (H - L)
        S2 = P - (H - L)
        R3 = H + 2*(P - L)
        S3 = L - 2*(H - P)

    Первые `period` значений — NaN.

    Returns: (pivot, r1, s1, r2, s2, r3, s3) — все numpy float64 shape=(n,).
    """
    n = len(close)
    pivot = np.full(n, np.nan, dtype=np.float64)
    r1 = np.full(n, np.nan, dtype=np.float64)
    s1 = np.full(n, np.nan, dtype=np.float64)
    r2 = np.full(n, np.nan, dtype=np.float64)
    s2 = np.full(n, np.nan, dtype=np.float64)
    r3 = np.full(n, np.nan, dtype=np.float64)
    s3 = np.full(n, np.nan, dtype=np.float64)

    if n < period + 1 or period <= 0:
        return pivot, r1, s1, r2, s2, r3, s3

    for i in range(period, n):
        window_high = high[i - period:i]
        window_low = low[i - period:i]
        H = float(np.max(window_high))
        L = float(np.min(window_low))
        C = float(close[i - 1])
        P = (H + L + C) / 3.0
        rng = H - L

        pivot[i] = P
        r1[i] = 2 * P - L
        s1[i] = 2 * P - H
        r2[i] = P + rng
        s2[i] = P - rng
        r3[i] = H + 2 * (P - L)
        s3[i] = L - 2 * (H - P)

    return pivot, r1, s1, r2, s2, r3, s3


def pivot_velocity(pivot: NDArray, lookback: int) -> NDArray:
    """Скорость изменения pivot в процентах за `lookback` баров.

    velocity[i] = (pivot[i] - pivot[i - lookback]) / pivot[i - lookback] * 100

    Используется для детекции дрейфа: если pivot сам уплывает —
    рынок фактически трендовый, даже если ADX ещё низкий.

    Первые `lookback` значений — NaN. NaN-safe на NaN входе.
    """
    n = len(pivot)
    out = np.full(n, np.nan, dtype=np.float64)

    if n <= lookback or lookback <= 0:
        return out

    for i in range(lookback, n):
        curr = pivot[i]
        prev = pivot[i - lookback]
        if np.isnan(curr) or np.isnan(prev) or prev == 0.0:
            continue
        out[i] = (curr - prev) / prev * 100.0

    return out
