"""Тесты BybitClient — unit tests с мокированием pybit."""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.modules.market.bybit_client import BybitAPIError, BybitClient, SymbolInfo, Ticker


@pytest.fixture
def mock_session():
    """Мок pybit HTTP сессии."""
    with patch("app.modules.market.bybit_client.HTTP") as MockHTTP:
        mock = MagicMock()
        MockHTTP.return_value = mock
        client = BybitClient(api_key="test", api_secret="test", testnet=True)
        yield client, mock


class TestGetKlines:
    def test_returns_chronological_order(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_kline.return_value = {
            "result": {"list": [
                ["1700002000000", "102", "103", "101", "102.5", "500", "51000"],
                ["1700001000000", "100", "101", "99", "100.5", "400", "40000"],
            ]}
        }
        candles = client.get_klines("BTCUSDT", "5", 2)
        assert len(candles) == 2
        assert candles[0]["timestamp"] == 1700001000000
        assert candles[1]["timestamp"] == 1700002000000

    def test_float_conversion(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_kline.return_value = {
            "result": {"list": [["1700001000000", "100.5", "101.2", "99.8", "100.9", "450.5", "45000"]]}
        }
        candles = client.get_klines("BTCUSDT", "5", 1)
        assert candles[0]["open"] == pytest.approx(100.5)
        assert candles[0]["close"] == pytest.approx(100.9)
        assert isinstance(candles[0]["volume"], float)

    def test_empty_response(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_kline.return_value = {"result": {"list": []}}
        assert client.get_klines("BTCUSDT", "5", 1) == []

    def test_api_error_raises(self, mock_session: tuple) -> None:
        client, mock = mock_session
        from pybit.exceptions import InvalidRequestError
        mock.get_kline.side_effect = InvalidRequestError(
            message="Symbol not found", status_code=110001, time=0, resp_headers={}, request=""
        )
        with pytest.raises(BybitAPIError) as exc:
            client.get_klines("INVALID", "5", 1)
        assert exc.value.code == 110001


class TestKlinesToArrays:
    def test_converts_to_numpy(self, mock_session: tuple) -> None:
        client, _ = mock_session
        candles = [
            {"timestamp": 1, "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 500, "turnover": 50000},
            {"timestamp": 2, "open": 101, "high": 102, "low": 100, "close": 101.5, "volume": 600, "turnover": 60000},
        ]
        arrays = client.klines_to_arrays(candles)
        assert len(arrays["close"]) == 2
        assert arrays["close"][0] == pytest.approx(100.5)
        assert arrays["close"].dtype == np.float64

    def test_empty_candles(self, mock_session: tuple) -> None:
        client, _ = mock_session
        arrays = client.klines_to_arrays([])
        assert len(arrays["close"]) == 0


class TestGetTicker:
    def test_returns_ticker(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_tickers.return_value = {"result": {"list": [{
            "symbol": "BTCUSDT", "lastPrice": "65000.5", "markPrice": "65001.2",
            "indexPrice": "65000.8", "volume24h": "12345.6", "turnover24h": "800000000",
            "highPrice24h": "66000", "lowPrice24h": "64000", "fundingRate": "0.0001",
            "openInterest": "5000", "bid1Price": "65000", "ask1Price": "65001",
        }]}}
        ticker = client.get_ticker("BTCUSDT")
        assert isinstance(ticker, Ticker)
        assert ticker.last_price == pytest.approx(65000.5)


class TestGetSymbolInfo:
    def test_returns_symbol_info(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_instruments_info.return_value = {"result": {"list": [{
            "symbol": "BTCUSDT",
            "priceFilter": {"tickSize": "0.1", "minPrice": "0.1", "maxPrice": "999999"},
            "lotSizeFilter": {"qtyStep": "0.001", "minOrderQty": "0.001", "maxOrderQty": "100", "minNotionalValue": "5"},
            "leverageFilter": {"maxLeverage": "100", "minLeverage": "1"},
        }]}}
        info = client.get_symbol_info("BTCUSDT")
        assert isinstance(info, SymbolInfo)
        assert info.tick_size == pytest.approx(0.1)
        assert info.max_leverage == pytest.approx(100.0)


class TestPlaceOrder:
    def test_market_order(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.place_order.return_value = {"retCode": 0, "result": {"orderId": "123456", "orderLinkId": ""}}
        result = client.place_order("BTCUSDT", "Buy", "Market", 0.001)
        assert result["orderId"] == "123456"
        call_kwargs = mock.place_order.call_args[1]
        assert call_kwargs["qty"] == "0.001"

    def test_limit_order_with_tp_sl(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.place_order.return_value = {"retCode": 0, "result": {"orderId": "789", "orderLinkId": "custom-1"}}
        client.place_order("BTCUSDT", "Buy", "Limit", 0.001, price=65000.0, take_profit=70000.0, stop_loss=60000.0, order_link_id="custom-1")
        call_kwargs = mock.place_order.call_args[1]
        assert call_kwargs["price"] == "65000.0"
        assert call_kwargs["takeProfit"] == "70000.0"
        assert call_kwargs["tpslMode"] == "Full"


class TestSetLeverage:
    def test_sets_leverage(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.set_leverage.return_value = {"retCode": 0, "result": {}}
        client.set_leverage("BTCUSDT", 10)
        call_kwargs = mock.set_leverage.call_args[1]
        assert call_kwargs["buyLeverage"] == "10"

    def test_ignores_already_set_error(self, mock_session: tuple) -> None:
        client, mock = mock_session
        from pybit.exceptions import InvalidRequestError
        mock.set_leverage.side_effect = InvalidRequestError(
            message="leverage not modified", status_code=110043, time=0, resp_headers={}, request=""
        )
        client.set_leverage("BTCUSDT", 10)  # should not raise


class TestSetTradingStop:
    def test_trailing_stop(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.set_trading_stop.return_value = {"retCode": 0, "result": {}}
        client.set_trading_stop("BTCUSDT", trailing_stop=500.0, active_price=66000.0)
        call_kwargs = mock.set_trading_stop.call_args[1]
        assert call_kwargs["trailingStop"] == "500.0"
        assert call_kwargs["activePrice"] == "66000.0"


class TestGetPositions:
    def test_filters_empty_positions(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_positions.return_value = {"result": {"list": [
            {"symbol": "BTCUSDT", "size": "0.001", "side": "Buy"},
            {"symbol": "ETHUSDT", "size": "0", "side": ""},
        ]}}
        positions = client.get_positions()
        assert len(positions) == 1
        assert positions[0]["symbol"] == "BTCUSDT"


class TestGetWalletBalance:
    def test_returns_balance(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_wallet_balance.return_value = {"result": {"list": [{"coin": [{
            "coin": "USDT", "walletBalance": "1000.50", "availableToWithdraw": "800.00",
            "equity": "1050.00", "unrealisedPnl": "50.00",
        }]}]}}
        balance = client.get_wallet_balance("USDT")
        assert balance["wallet_balance"] == pytest.approx(1000.50)
        assert balance["available"] == pytest.approx(800.00)
