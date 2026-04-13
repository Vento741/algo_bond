"""Тесты Pivot Point индикаторов."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.pivot import (
    pivot_velocity,
    rolling_pivot,
)


class TestRollingPivot:
    def test_basic_calculation(self) -> None:
        """Проверка формулы pivot на известных значениях.

        period=3, бар i=3 использует high[0..2], low[0..2], close[2].
        H=102, L=98, C=100 → P = (102+98+100)/3 = 100.0
        R1 = 2*100 - 98 = 102
        S1 = 2*100 - 102 = 98
        R2 = 100 + (102-98) = 104
        S2 = 100 - (102-98) = 96
        R3 = 102 + 2*(100-98) = 106
        S3 = 98 - 2*(102-100) = 94
        """
        high = np.array([102.0, 101.0, 102.0, 103.0, 104.0], dtype=np.float64)
        low = np.array([98.0, 98.0, 98.0, 99.0, 100.0], dtype=np.float64)
        close = np.array([100.0, 99.0, 100.0, 101.0, 102.0], dtype=np.float64)

        pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(high, low, close, period=3)

        assert pivot[3] == pytest.approx(100.0)
        assert r1[3] == pytest.approx(102.0)
        assert s1[3] == pytest.approx(98.0)
        assert r2[3] == pytest.approx(104.0)
        assert s2[3] == pytest.approx(96.0)
        assert r3[3] == pytest.approx(106.0)
        assert s3[3] == pytest.approx(94.0)

    def test_nan_before_period(self) -> None:
        """Первые `period` баров должны быть NaN."""
        high = np.arange(10, dtype=np.float64) + 100
        low = np.arange(10, dtype=np.float64) + 98
        close = np.arange(10, dtype=np.float64) + 99
        pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(high, low, close, period=5)
        for arr in (pivot, r1, s1, r2, s2, r3, s3):
            assert all(np.isnan(arr[:5]))
            assert not np.isnan(arr[5])

    def test_insufficient_data(self) -> None:
        """n < period → всё NaN, без падений."""
        high = np.array([100.0, 101.0], dtype=np.float64)
        low = np.array([98.0, 99.0], dtype=np.float64)
        close = np.array([99.0, 100.0], dtype=np.float64)
        pivot, *_ = rolling_pivot(high, low, close, period=10)
        assert all(np.isnan(pivot))

    def test_output_shapes_match_input(self) -> None:
        n = 50
        high = np.random.uniform(100, 110, n)
        low = np.random.uniform(90, 100, n)
        close = np.random.uniform(95, 105, n)
        results = rolling_pivot(high, low, close, period=10)
        for arr in results:
            assert arr.shape == (n,)
            assert arr.dtype == np.float64


class TestPivotVelocity:
    def test_positive_drift(self) -> None:
        """Восходящий pivot → положительная velocity."""
        # pivot[0..9] = 100, 101, 102, ..., 109
        pivot = np.arange(100, 110, dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=5)
        # vel[5] = (105 - 100) / 100 * 100 = 5.0
        assert vel[5] == pytest.approx(5.0)
        assert vel[9] == pytest.approx((109 - 104) / 104 * 100)

    def test_flat_pivot_zero_velocity(self) -> None:
        pivot = np.full(20, 100.0)
        vel = pivot_velocity(pivot, lookback=5)
        assert vel[5] == pytest.approx(0.0)
        assert vel[19] == pytest.approx(0.0)

    def test_nan_before_lookback(self) -> None:
        pivot = np.arange(100, 120, dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=5)
        assert all(np.isnan(vel[:5]))
        assert not np.isnan(vel[5])

    def test_nan_input_propagates(self) -> None:
        pivot = np.array([np.nan, np.nan, 100.0, 101.0, 102.0, 103.0], dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=2)
        # vel[2] = (100 - nan) → nan
        assert np.isnan(vel[2])
        assert np.isnan(vel[3])
        # vel[4] = (102 - 100) / 100 * 100 = 2.0
        assert vel[4] == pytest.approx(2.0)

    def test_zero_denominator_safe(self) -> None:
        """Если pivot[i - lookback] == 0 → NaN, не деление на ноль."""
        pivot = np.array([0.0, 1.0, 2.0, 3.0, 4.0], dtype=np.float64)
        vel = pivot_velocity(pivot, lookback=2)
        assert np.isnan(vel[2])  # pivot[0]=0 → деление на ноль
