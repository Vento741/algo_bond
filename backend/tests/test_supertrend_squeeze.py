"""Тесты SuperTrend Squeeze Momentum стратегии."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.trend import supertrend


# === Тестовые данные: 200 баров с uptrend ===
np.random.seed(42)
_trend = np.linspace(100, 150, 200)
_noise = np.random.normal(0, 1.5, 200)
CLOSE_200 = _trend + _noise
HIGH_200 = CLOSE_200 + np.abs(np.random.normal(1, 0.5, 200))
LOW_200 = CLOSE_200 - np.abs(np.random.normal(1, 0.5, 200))
VOLUME_200 = np.random.uniform(500, 2000, 200)


class TestSuperTrend:
    def test_returns_correct_shapes(self) -> None:
        direction, upper, lower = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        assert len(direction) == 200
        assert len(upper) == 200
        assert len(lower) == 200

    def test_direction_values(self) -> None:
        """Direction should be 1 (bullish) or -1 (bearish)."""
        direction, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        valid = direction[~np.isnan(direction)]
        assert all(v in (1.0, -1.0) for v in valid)

    def test_uptrend_mostly_bullish(self) -> None:
        """On strong uptrend data, SuperTrend should be mostly bullish."""
        direction, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        valid = direction[~np.isnan(direction)]
        bullish_pct = np.sum(valid == 1.0) / len(valid)
        assert bullish_pct > 0.5

    def test_nan_at_start(self) -> None:
        """First `period` bars should be NaN."""
        direction, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=3.0)
        assert np.isnan(direction[9])
        assert not np.isnan(direction[11])

    def test_different_multipliers(self) -> None:
        """Higher multiplier = fewer direction changes."""
        dir_tight, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=1.0)
        dir_loose, _, _ = supertrend(HIGH_200, LOW_200, CLOSE_200, period=10, multiplier=5.0)
        changes_tight = np.sum(np.diff(dir_tight[~np.isnan(dir_tight)]) != 0)
        changes_loose = np.sum(np.diff(dir_loose[~np.isnan(dir_loose)]) != 0)
        assert changes_tight >= changes_loose
