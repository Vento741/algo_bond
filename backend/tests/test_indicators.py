"""Тесты технических индикаторов."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.trend import (
    atr,
    calc_ma,
    dmi,
    ema,
    hma,
    ma_ribbon,
    percentrank,
    rsi,
    sma,
    stdev,
    wma,
)


# === Тестовые данные ===

CLOSE = np.array([
    100, 102, 101, 103, 105, 104, 106, 108, 107, 110,
    109, 111, 113, 112, 115, 114, 116, 118, 117, 120,
    119, 121, 123, 122, 125, 124, 126, 128, 127, 130,
], dtype=np.float64)

HIGH = CLOSE + 1.5
LOW = CLOSE - 1.5
OPEN = CLOSE - 0.5


class TestSMA:
    def test_basic(self) -> None:
        result = sma(CLOSE, 5)
        assert np.isnan(result[3])
        assert not np.isnan(result[4])
        assert result[4] == pytest.approx(np.mean(CLOSE[:5]))

    def test_short_data(self) -> None:
        result = sma(CLOSE[:3], 5)
        assert all(np.isnan(result))

    def test_period_1(self) -> None:
        result = sma(CLOSE, 1)
        np.testing.assert_array_almost_equal(result, CLOSE)


class TestEMA:
    def test_first_value_is_sma(self) -> None:
        result = ema(CLOSE, 10)
        expected_first = np.mean(CLOSE[:10])
        assert result[9] == pytest.approx(expected_first)

    def test_ema_smoothing(self) -> None:
        result = ema(CLOSE, 10)
        assert result[-1] > result[15]

    def test_short_data(self) -> None:
        result = ema(CLOSE[:3], 10)
        assert all(np.isnan(result))


class TestWMA:
    def test_basic(self) -> None:
        result = wma(CLOSE, 5)
        assert not np.isnan(result[4])
        weights = np.arange(1, 6, dtype=np.float64)
        expected = np.dot(CLOSE[:5], weights) / weights.sum()
        assert result[4] == pytest.approx(expected)


class TestHMA:
    def test_faster_than_sma(self) -> None:
        result_hma = hma(CLOSE, 10)
        result_sma = sma(CLOSE, 10)
        last_valid_hma = result_hma[~np.isnan(result_hma)][-1]
        last_valid_sma = result_sma[~np.isnan(result_sma)][-1]
        assert abs(last_valid_hma - CLOSE[-1]) < abs(last_valid_sma - CLOSE[-1])


class TestRSI:
    def test_uptrend_rsi_above_50(self) -> None:
        result = rsi(CLOSE, 14)
        last_valid = result[~np.isnan(result)]
        assert len(last_valid) > 0
        assert last_valid[-1] > 50

    def test_range_0_100(self) -> None:
        result = rsi(CLOSE, 14)
        valid = result[~np.isnan(result)]
        assert all(0 <= v <= 100 for v in valid)

    def test_constant_price(self) -> None:
        flat = np.full(30, 100.0)
        result = rsi(flat, 14)
        valid = result[~np.isnan(result)]
        assert all(v == 100.0 for v in valid)


class TestATR:
    def test_positive(self) -> None:
        result = atr(HIGH, LOW, CLOSE, 14)
        valid = result[~np.isnan(result)]
        assert all(v > 0 for v in valid)

    def test_constant_range(self) -> None:
        h = np.full(30, 102.0)
        l = np.full(30, 98.0)
        c = np.full(30, 100.0)
        result = atr(h, l, c, 14)
        valid = result[~np.isnan(result)]
        assert valid[-1] == pytest.approx(4.0, abs=0.1)


class TestDMI:
    def test_uptrend_di_plus_dominant(self) -> None:
        di_p, di_m, adx_val = dmi(HIGH, LOW, CLOSE, 14)
        valid_plus = di_p[~np.isnan(di_p)]
        valid_minus = di_m[~np.isnan(di_m)]
        if len(valid_plus) > 0 and len(valid_minus) > 0:
            assert valid_plus[-1] > valid_minus[-1]

    def test_adx_range(self) -> None:
        _, _, adx_val = dmi(HIGH, LOW, CLOSE, 14)
        valid = adx_val[~np.isnan(adx_val)]
        if len(valid) > 0:
            assert all(0 <= v <= 100 for v in valid)


class TestStdev:
    def test_constant_zero(self) -> None:
        flat = np.full(30, 100.0)
        result = stdev(flat, 10)
        valid = result[~np.isnan(result)]
        assert all(v == pytest.approx(0.0) for v in valid)


class TestPercentrank:
    def test_increasing(self) -> None:
        increasing = np.arange(30, dtype=np.float64)
        result = percentrank(increasing, 10)
        valid = result[~np.isnan(result)]
        assert valid[-1] == pytest.approx(100.0)


class TestMARibbon:
    def test_uptrend_bullish(self) -> None:
        long_up = np.arange(300, dtype=np.float64) + 100
        bullish, bearish = ma_ribbon(
            long_up, [9, 14, 21, 35, 55, 89, 144, 233], "EMA", 4
        )
        assert bullish[-1] == True
        assert bearish[-1] == False

    def test_calc_ma_types(self) -> None:
        result_ema = calc_ma(CLOSE, 10, "EMA")
        result_sma = calc_ma(CLOSE, 10, "SMA")
        result_hma = calc_ma(CLOSE, 10, "HMA")
        assert len(result_ema) == len(CLOSE)
        assert len(result_sma) == len(CLOSE)
        assert len(result_hma) == len(CLOSE)
