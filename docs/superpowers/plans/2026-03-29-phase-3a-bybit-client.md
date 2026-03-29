# Phase 3A: Bybit Client + Market Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Create a Bybit V5 API client wrapper (pybit) and market data module — fetch historical OHLCV candles, stream live klines via WebSocket, cache in Redis. Foundation for trading bot and backtesting.

**Architecture:** `BybitClient` wraps pybit HTTP session with error handling and rate-limit awareness. `BybitWebSocket` wraps pybit WebSocket for live kline/ticker streams. Market module provides CRUD for OHLCV data and a service layer for fetching/caching. All Bybit API params use EXACT pybit V5 method signatures (camelCase kwargs).

**Tech Stack:** pybit 5.14.0 (Bybit V5 SDK), Redis (caching), asyncio, numpy/pandas (OHLCV conversion)

---

## Bybit V5 API Reference (from research)

Key facts for implementers:
- **pybit 5.14.0**: `from pybit.unified_trading import HTTP, WebSocket`
- **Init**: `HTTP(testnet=bool, api_key=str, api_secret=str)`
- **get_kline**: `session.get_kline(category="linear", symbol=str, interval=str, start=int_ms, end=int_ms, limit=200)` → `result["result"]["list"]` = array of `[startTime, open, high, low, close, volume, turnover]` (strings, REVERSE chronological)
- **get_tickers**: `session.get_tickers(category="linear", symbol=str)` → lastPrice, markPrice, volume24h, fundingRate, etc.
- **get_instruments_info**: `session.get_instruments_info(category="linear", symbol=str)` → tickSize, qtyStep, minOrderQty, maxLeverage
- **place_order**: `session.place_order(category="linear", symbol=str, side="Buy"/"Sell", orderType="Market"/"Limit", qty=str, price=str, takeProfit=str, stopLoss=str, tpslMode="Full", positionIdx=0)`
- **set_trading_stop**: `session.set_trading_stop(category="linear", symbol=str, tpslMode="Full", trailingStop=str, activePrice=str, positionIdx=0)`
- **set_leverage**: `session.set_leverage(category="linear", symbol=str, buyLeverage=str, sellLeverage=str)`
- **get_positions**: `session.get_positions(category="linear", symbol=str)`
- **get_wallet_balance**: `session.get_wallet_balance(accountType="UNIFIED", coin="USDT")`
- **WebSocket public**: `WebSocket(testnet=bool, channel_type="linear")` → `.kline_stream(interval=int, symbol=str, callback=fn)`, `.ticker_stream(...)`
- **WebSocket private**: `WebSocket(testnet=bool, channel_type="private", api_key=str, api_secret=str)` → `.order_stream(callback=fn)`, `.position_stream(...)`, `.execution_stream(...)`
- **Exceptions**: `InvalidRequestError` (Bybit error, `.status_code`=retCode), `FailedRequestError` (network)
- **All numeric params are strings** (qty, price, leverage, TP/SL)
- **Kline data is REVERSE sorted** (newest first) — must reverse for chronological
- **Intervals**: "1","3","5","15","30","60","120","240","360","720","D","W","M"
- **Rate limits**: 10-20 orders/s, 50 queries/s; auto-retry on 10006
- **set_leverage raises 110043** if already set — catch and ignore

---

## File Structure

```
backend/
├── requirements.txt                              # MODIFY: add pybit==5.14.0
├── app/
│   ├── config.py                                 # MODIFY: add Bybit config fields
│   ├── modules/
│   │   └── market/
│   │       ├── __init__.py                       # CREATE
│   │       ├── bybit_client.py                   # CREATE: BybitClient wrapper
│   │       ├── bybit_ws.py                       # CREATE: BybitWebSocket wrapper
│   │       ├── models.py                         # CREATE: OHLCVCandle model
│   │       ├── schemas.py                        # CREATE: Pydantic schemas
│   │       ├── service.py                        # CREATE: MarketService
│   │       └── router.py                         # CREATE: Market API endpoints
│   └── main.py                                   # MODIFY: add market router
├── tests/
│   ├── conftest.py                               # MODIFY: import market models
│   ├── test_bybit_client.py                      # CREATE: client unit tests
│   └── test_market_api.py                        # CREATE: API tests
```

---

## Task 1: Add pybit dependency + Bybit config

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`

- [x] **Step 1: Add pybit to requirements**

Add to `backend/requirements.txt` after the `# Аналитика` section:

```
# Bybit
pybit==5.14.0
```

- [x] **Step 2: Add Bybit settings to config.py**

Read `backend/app/config.py` first. Then add these fields to the Settings class:

```python
    # Bybit
    bybit_api_key: str = ""
    bybit_api_secret: str = ""
    bybit_testnet: bool = True
    bybit_demo: bool = False
```

- [x] **Step 3: Install and verify**

Run: `cd backend && pip install pybit==5.14.0`
Run: `cd backend && python -c "from pybit.unified_trading import HTTP, WebSocket; print('pybit OK')"`
Expected: `pybit OK`

- [x] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/app/config.py
git commit -m "feat: add pybit 5.14.0 + Bybit config settings"
```

---

## Task 2: BybitClient — HTTP wrapper

The core Bybit HTTP client. Wraps pybit with error handling, logging, and conversion utilities.

**Files:**
- Create: `backend/app/modules/market/__init__.py`
- Create: `backend/app/modules/market/bybit_client.py`
- Create: `backend/tests/test_bybit_client.py`

- [x] **Step 1: Create market module**

Create `backend/app/modules/market/__init__.py`:

```python
"""Модуль рыночных данных: Bybit клиент, свечи, WebSocket стримы."""
```

- [x] **Step 2: Write BybitClient**

Create `backend/app/modules/market/bybit_client.py`:

```python
"""Обёртка над pybit V5 API для Bybit.

Предоставляет типизированный интерфейс для:
- Получения рыночных данных (свечи, тикеры, инструменты)
- Управления ордерами (создание, отмена, изменение)
- Управления позициями (leverage, SL/TP/trailing)
- Получения баланса

Все методы возвращают dict (raw JSON от Bybit) или поднимают BybitAPIError.
"""

import logging
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from pybit.exceptions import FailedRequestError, InvalidRequestError
from pybit.unified_trading import HTTP

from app.config import settings

logger = logging.getLogger(__name__)


class BybitAPIError(Exception):
    """Ошибка Bybit API."""

    def __init__(self, code: int, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(f"Bybit error {code}: {message}")


@dataclass
class SymbolInfo:
    """Информация о торговом инструменте."""
    symbol: str
    tick_size: float
    qty_step: float
    min_qty: float
    max_qty: float
    min_notional: float
    max_leverage: float


@dataclass
class Ticker:
    """Текущие рыночные данные символа."""
    symbol: str
    last_price: float
    mark_price: float
    index_price: float
    volume_24h: float
    turnover_24h: float
    high_24h: float
    low_24h: float
    funding_rate: float
    open_interest: float
    bid1_price: float
    ask1_price: float


class BybitClient:
    """Клиент Bybit V5 API (USDT-M Linear Futures).

    Инициализируется из app.config.settings или явных параметров.
    """

    def __init__(
        self,
        api_key: str | None = None,
        api_secret: str | None = None,
        testnet: bool | None = None,
    ) -> None:
        self._session = HTTP(
            testnet=testnet if testnet is not None else settings.bybit_testnet,
            api_key=api_key or settings.bybit_api_key,
            api_secret=api_secret or settings.bybit_api_secret,
            recv_window=10000,
            max_retries=3,
            retry_delay=1,
            logging_level=logging.WARNING,
        )

    # === Market Data ===

    def get_klines(
        self,
        symbol: str,
        interval: str = "5",
        limit: int = 200,
        start: int | None = None,
        end: int | None = None,
    ) -> list[dict]:
        """Получить OHLCV свечи.

        Args:
            symbol: Торговая пара (например, "RIVERUSDT").
            interval: Таймфрейм ("1","5","15","60","240","D").
            limit: Количество свечей [1, 1000].
            start: Начало периода (timestamp ms).
            end: Конец периода (timestamp ms).

        Returns:
            Список dict с ключами: timestamp, open, high, low, close, volume, turnover.
            Отсортирован хронологически (oldest first).
        """
        try:
            kwargs: dict = {
                "category": "linear",
                "symbol": symbol,
                "interval": interval,
                "limit": limit,
            }
            if start is not None:
                kwargs["start"] = start
            if end is not None:
                kwargs["end"] = end

            result = self._session.get_kline(**kwargs)
            raw_list = result["result"]["list"]

            # pybit возвращает в обратном хронологическом порядке — разворачиваем
            candles = []
            for row in reversed(raw_list):
                candles.append({
                    "timestamp": int(row[0]),
                    "open": float(row[1]),
                    "high": float(row[2]),
                    "low": float(row[3]),
                    "close": float(row[4]),
                    "volume": float(row[5]),
                    "turnover": float(row[6]),
                })
            return candles

        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def klines_to_arrays(
        self, candles: list[dict]
    ) -> dict[str, NDArray]:
        """Конвертировать список свечей в numpy-массивы для стратегии.

        Returns:
            dict с ключами: open, high, low, close, volume, timestamps.
        """
        if not candles:
            empty = np.array([], dtype=np.float64)
            return {
                "open": empty, "high": empty, "low": empty,
                "close": empty, "volume": empty, "timestamps": empty,
            }
        return {
            "open": np.array([c["open"] for c in candles], dtype=np.float64),
            "high": np.array([c["high"] for c in candles], dtype=np.float64),
            "low": np.array([c["low"] for c in candles], dtype=np.float64),
            "close": np.array([c["close"] for c in candles], dtype=np.float64),
            "volume": np.array([c["volume"] for c in candles], dtype=np.float64),
            "timestamps": np.array([c["timestamp"] for c in candles], dtype=np.float64),
        }

    def get_ticker(self, symbol: str) -> Ticker:
        """Получить текущий тикер символа."""
        try:
            result = self._session.get_tickers(category="linear", symbol=symbol)
            data = result["result"]["list"][0]
            return Ticker(
                symbol=data["symbol"],
                last_price=float(data["lastPrice"]),
                mark_price=float(data["markPrice"]),
                index_price=float(data["indexPrice"]),
                volume_24h=float(data["volume24h"]),
                turnover_24h=float(data["turnover24h"]),
                high_24h=float(data["highPrice24h"]),
                low_24h=float(data["lowPrice24h"]),
                funding_rate=float(data["fundingRate"]),
                open_interest=float(data["openInterest"]),
                bid1_price=float(data["bid1Price"]),
                ask1_price=float(data["ask1Price"]),
            )
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def get_symbol_info(self, symbol: str) -> SymbolInfo:
        """Получить спецификацию торгового инструмента."""
        try:
            result = self._session.get_instruments_info(category="linear", symbol=symbol)
            data = result["result"]["list"][0]
            return SymbolInfo(
                symbol=data["symbol"],
                tick_size=float(data["priceFilter"]["tickSize"]),
                qty_step=float(data["lotSizeFilter"]["qtyStep"]),
                min_qty=float(data["lotSizeFilter"]["minOrderQty"]),
                max_qty=float(data["lotSizeFilter"]["maxOrderQty"]),
                min_notional=float(data["lotSizeFilter"].get("minNotionalValue", "0")),
                max_leverage=float(data["leverageFilter"]["maxLeverage"]),
            )
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    # === Order Management ===

    def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        qty: float,
        price: float | None = None,
        take_profit: float | None = None,
        stop_loss: float | None = None,
        position_idx: int = 0,
        order_link_id: str | None = None,
    ) -> dict:
        """Создать ордер.

        Args:
            symbol: Торговая пара.
            side: "Buy" или "Sell".
            order_type: "Market" или "Limit".
            qty: Количество.
            price: Цена (обязательна для Limit).
            take_profit: Цена TP.
            stop_loss: Цена SL.
            position_idx: 0=one-way, 1=hedge-buy, 2=hedge-sell.
            order_link_id: Пользовательский ID ордера.

        Returns:
            {"orderId": str, "orderLinkId": str}
        """
        try:
            kwargs: dict = {
                "category": "linear",
                "symbol": symbol,
                "side": side,
                "orderType": order_type,
                "qty": str(qty),
                "positionIdx": position_idx,
            }
            if price is not None:
                kwargs["price"] = str(price)
                kwargs["timeInForce"] = "GTC"
            if take_profit is not None:
                kwargs["takeProfit"] = str(take_profit)
                kwargs["tpslMode"] = "Full"
            if stop_loss is not None:
                kwargs["stopLoss"] = str(stop_loss)
                kwargs["tpslMode"] = "Full"
            if order_link_id is not None:
                kwargs["orderLinkId"] = order_link_id

            result = self._session.place_order(**kwargs)
            logger.info("Order placed: %s %s %s qty=%s", side, order_type, symbol, qty)
            return result["result"]

        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def cancel_order(self, symbol: str, order_id: str) -> dict:
        """Отменить ордер."""
        try:
            result = self._session.cancel_order(
                category="linear", symbol=symbol, orderId=order_id
            )
            logger.info("Order cancelled: %s", order_id)
            return result["result"]
        except InvalidRequestError as e:
            if e.status_code == 110010:  # уже отменён
                logger.warning("Order already cancelled: %s", order_id)
                return {"orderId": order_id}
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def get_open_orders(self, symbol: str | None = None) -> list[dict]:
        """Получить открытые ордера."""
        try:
            kwargs: dict = {"category": "linear"}
            if symbol:
                kwargs["symbol"] = symbol
            result = self._session.get_open_orders(**kwargs)
            return result["result"]["list"]
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    # === Position Management ===

    def get_positions(self, symbol: str | None = None) -> list[dict]:
        """Получить открытые позиции."""
        try:
            kwargs: dict = {"category": "linear", "settleCoin": "USDT"}
            if symbol:
                kwargs["symbol"] = symbol
            result = self._session.get_positions(**kwargs)
            return [p for p in result["result"]["list"] if float(p.get("size", "0")) > 0]
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def set_leverage(self, symbol: str, leverage: int) -> None:
        """Установить плечо для символа."""
        try:
            self._session.set_leverage(
                category="linear",
                symbol=symbol,
                buyLeverage=str(leverage),
                sellLeverage=str(leverage),
            )
            logger.info("Leverage set: %s x%d", symbol, leverage)
        except InvalidRequestError as e:
            if e.status_code == 110043:  # уже установлено
                logger.debug("Leverage already set: %s x%d", symbol, leverage)
                return
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def set_trading_stop(
        self,
        symbol: str,
        take_profit: float | None = None,
        stop_loss: float | None = None,
        trailing_stop: float | None = None,
        active_price: float | None = None,
        position_idx: int = 0,
    ) -> None:
        """Установить SL/TP/Trailing Stop для позиции.

        Args:
            trailing_stop: Дистанция трейлинга в ценовых единицах.
            active_price: Цена активации трейлинга.
        """
        try:
            kwargs: dict = {
                "category": "linear",
                "symbol": symbol,
                "tpslMode": "Full",
                "positionIdx": position_idx,
            }
            if take_profit is not None:
                kwargs["takeProfit"] = str(take_profit)
            if stop_loss is not None:
                kwargs["stopLoss"] = str(stop_loss)
            if trailing_stop is not None:
                kwargs["trailingStop"] = str(trailing_stop)
            if active_price is not None:
                kwargs["activePrice"] = str(active_price)

            self._session.set_trading_stop(**kwargs)
            logger.info("Trading stop set: %s TP=%s SL=%s Trail=%s",
                        symbol, take_profit, stop_loss, trailing_stop)
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    # === Account ===

    def get_wallet_balance(self, coin: str = "USDT") -> dict:
        """Получить баланс кошелька.

        Returns:
            dict с ключами: wallet_balance, available, equity, unrealized_pnl.
        """
        try:
            result = self._session.get_wallet_balance(accountType="UNIFIED", coin=coin)
            coins = result["result"]["list"][0]["coin"]
            for c in coins:
                if c["coin"] == coin:
                    return {
                        "coin": coin,
                        "wallet_balance": float(c["walletBalance"]),
                        "available": float(c["availableToWithdraw"]),
                        "equity": float(c["equity"]),
                        "unrealized_pnl": float(c["unrealisedPnl"]),
                    }
            return {"coin": coin, "wallet_balance": 0, "available": 0, "equity": 0, "unrealized_pnl": 0}
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e
```

- [x] **Step 3: Write client unit tests**

Create `backend/tests/test_bybit_client.py`:

```python
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
        # pybit возвращает в обратном порядке (newest first)
        mock.get_kline.return_value = {
            "result": {
                "list": [
                    ["1700002000000", "102", "103", "101", "102.5", "500", "51000"],
                    ["1700001000000", "100", "101", "99", "100.5", "400", "40000"],
                ]
            }
        }
        candles = client.get_klines("BTCUSDT", "5", 2)
        assert len(candles) == 2
        # Первая свеча должна быть старейшей
        assert candles[0]["timestamp"] == 1700001000000
        assert candles[1]["timestamp"] == 1700002000000

    def test_float_conversion(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_kline.return_value = {
            "result": {
                "list": [
                    ["1700001000000", "100.5", "101.2", "99.8", "100.9", "450.5", "45000"],
                ]
            }
        }
        candles = client.get_klines("BTCUSDT", "5", 1)
        assert candles[0]["open"] == pytest.approx(100.5)
        assert candles[0]["close"] == pytest.approx(100.9)
        assert isinstance(candles[0]["volume"], float)

    def test_empty_response(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_kline.return_value = {"result": {"list": []}}
        candles = client.get_klines("BTCUSDT", "5", 1)
        assert candles == []

    def test_api_error_raises(self, mock_session: tuple) -> None:
        client, mock = mock_session
        from pybit.exceptions import InvalidRequestError
        mock.get_kline.side_effect = InvalidRequestError(
            message="Symbol not found", status_code=110001,
            time=0, resp_headers={}, request=""
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
        mock.get_tickers.return_value = {
            "result": {
                "list": [{
                    "symbol": "BTCUSDT", "lastPrice": "65000.5",
                    "markPrice": "65001.2", "indexPrice": "65000.8",
                    "volume24h": "12345.6", "turnover24h": "800000000",
                    "highPrice24h": "66000", "lowPrice24h": "64000",
                    "fundingRate": "0.0001", "openInterest": "5000",
                    "bid1Price": "65000", "ask1Price": "65001",
                }]
            }
        }
        ticker = client.get_ticker("BTCUSDT")
        assert isinstance(ticker, Ticker)
        assert ticker.last_price == pytest.approx(65000.5)
        assert ticker.symbol == "BTCUSDT"


class TestGetSymbolInfo:
    def test_returns_symbol_info(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_instruments_info.return_value = {
            "result": {
                "list": [{
                    "symbol": "BTCUSDT",
                    "priceFilter": {"tickSize": "0.1", "minPrice": "0.1", "maxPrice": "999999"},
                    "lotSizeFilter": {
                        "qtyStep": "0.001", "minOrderQty": "0.001",
                        "maxOrderQty": "100", "minNotionalValue": "5",
                    },
                    "leverageFilter": {"maxLeverage": "100", "minLeverage": "1"},
                }]
            }
        }
        info = client.get_symbol_info("BTCUSDT")
        assert isinstance(info, SymbolInfo)
        assert info.tick_size == pytest.approx(0.1)
        assert info.max_leverage == pytest.approx(100.0)


class TestPlaceOrder:
    def test_market_order(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.place_order.return_value = {
            "retCode": 0,
            "result": {"orderId": "123456", "orderLinkId": ""}
        }
        result = client.place_order("BTCUSDT", "Buy", "Market", 0.001)
        assert result["orderId"] == "123456"
        mock.place_order.assert_called_once()
        call_kwargs = mock.place_order.call_args[1]
        assert call_kwargs["qty"] == "0.001"
        assert call_kwargs["side"] == "Buy"

    def test_limit_order_with_tp_sl(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.place_order.return_value = {
            "retCode": 0,
            "result": {"orderId": "789", "orderLinkId": "custom-1"}
        }
        result = client.place_order(
            "BTCUSDT", "Buy", "Limit", 0.001,
            price=65000.0, take_profit=70000.0, stop_loss=60000.0,
            order_link_id="custom-1",
        )
        call_kwargs = mock.place_order.call_args[1]
        assert call_kwargs["price"] == "65000.0"
        assert call_kwargs["takeProfit"] == "70000.0"
        assert call_kwargs["stopLoss"] == "60000.0"
        assert call_kwargs["tpslMode"] == "Full"


class TestSetLeverage:
    def test_sets_leverage(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.set_leverage.return_value = {"retCode": 0, "result": {}}
        client.set_leverage("BTCUSDT", 10)
        mock.set_leverage.assert_called_once()
        call_kwargs = mock.set_leverage.call_args[1]
        assert call_kwargs["buyLeverage"] == "10"
        assert call_kwargs["sellLeverage"] == "10"

    def test_ignores_already_set_error(self, mock_session: tuple) -> None:
        client, mock = mock_session
        from pybit.exceptions import InvalidRequestError
        mock.set_leverage.side_effect = InvalidRequestError(
            message="leverage not modified", status_code=110043,
            time=0, resp_headers={}, request=""
        )
        # Не должен поднять исключение
        client.set_leverage("BTCUSDT", 10)


class TestSetTradingStop:
    def test_trailing_stop(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.set_trading_stop.return_value = {"retCode": 0, "result": {}}
        client.set_trading_stop(
            "BTCUSDT", trailing_stop=500.0, active_price=66000.0
        )
        call_kwargs = mock.set_trading_stop.call_args[1]
        assert call_kwargs["trailingStop"] == "500.0"
        assert call_kwargs["activePrice"] == "66000.0"


class TestGetPositions:
    def test_filters_empty_positions(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_positions.return_value = {
            "result": {
                "list": [
                    {"symbol": "BTCUSDT", "size": "0.001", "side": "Buy"},
                    {"symbol": "ETHUSDT", "size": "0", "side": ""},
                ]
            }
        }
        positions = client.get_positions()
        assert len(positions) == 1
        assert positions[0]["symbol"] == "BTCUSDT"


class TestGetWalletBalance:
    def test_returns_balance(self, mock_session: tuple) -> None:
        client, mock = mock_session
        mock.get_wallet_balance.return_value = {
            "result": {
                "list": [{
                    "coin": [{
                        "coin": "USDT",
                        "walletBalance": "1000.50",
                        "availableToWithdraw": "800.00",
                        "equity": "1050.00",
                        "unrealisedPnl": "50.00",
                    }]
                }]
            }
        }
        balance = client.get_wallet_balance("USDT")
        assert balance["wallet_balance"] == pytest.approx(1000.50)
        assert balance["available"] == pytest.approx(800.00)
```

- [x] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_bybit_client.py -v`
Expected: All 14 tests PASS

- [x] **Step 5: Commit**

```bash
git add backend/app/modules/market/ backend/tests/test_bybit_client.py
git commit -m "feat(market): BybitClient — HTTP wrapper for V5 API"
```

---

## Task 3: Market module — models, schemas, service, router

**Files:**
- Create: `backend/app/modules/market/models.py`
- Create: `backend/app/modules/market/schemas.py`
- Create: `backend/app/modules/market/service.py`
- Create: `backend/app/modules/market/router.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_market_api.py`

- [x] **Step 1: Write models.py**

Create `backend/app/modules/market/models.py`:

```python
"""Модели рыночных данных: OHLCVCandle."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OHLCVCandle(Base):
    """Свеча OHLCV. Индексируется по (symbol, timeframe, open_time)."""

    __tablename__ = "ohlcv_candles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30))
    timeframe: Mapped[str] = mapped_column(String(10))
    open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    open: Mapped[Decimal] = mapped_column(Numeric)
    high: Mapped[Decimal] = mapped_column(Numeric)
    low: Mapped[Decimal] = mapped_column(Numeric)
    close: Mapped[Decimal] = mapped_column(Numeric)
    volume: Mapped[Decimal] = mapped_column(Numeric)

    __table_args__ = (
        Index("ix_ohlcv_symbol_tf_time", "symbol", "timeframe", "open_time", unique=True),
    )
```

- [x] **Step 2: Write schemas.py**

Create `backend/app/modules/market/schemas.py`:

```python
"""Pydantic v2 схемы модуля market."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CandleResponse(BaseModel):
    """Ответ — одна свеча."""
    model_config = ConfigDict(from_attributes=True)

    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class TickerResponse(BaseModel):
    """Ответ — текущий тикер."""
    symbol: str
    last_price: float
    mark_price: float
    volume_24h: float
    high_24h: float
    low_24h: float
    funding_rate: float
    bid1_price: float
    ask1_price: float


class SymbolInfoResponse(BaseModel):
    """Ответ — информация об инструменте."""
    symbol: str
    tick_size: float
    qty_step: float
    min_qty: float
    max_qty: float
    min_notional: float
    max_leverage: float


class WalletBalanceResponse(BaseModel):
    """Ответ — баланс кошелька."""
    coin: str
    wallet_balance: float
    available: float
    equity: float
    unrealized_pnl: float
```

- [x] **Step 3: Write service.py**

Create `backend/app/modules/market/service.py`:

```python
"""Бизнес-логика модуля market."""

import json
import logging

from app.modules.market.bybit_client import BybitClient
from app.redis import pool as redis_pool

logger = logging.getLogger(__name__)

# Время жизни кэша в секундах
CACHE_TTL_TICKER = 5
CACHE_TTL_KLINES = 60


class MarketService:
    """Сервис рыночных данных с кэшированием в Redis."""

    def __init__(self, client: BybitClient | None = None) -> None:
        self.client = client or BybitClient()

    async def get_klines(
        self,
        symbol: str,
        interval: str = "5",
        limit: int = 200,
    ) -> list[dict]:
        """Получить свечи с кэшированием в Redis."""
        cache_key = f"market:candles:{symbol}:{interval}:{limit}"

        try:
            cached = await redis_pool.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            logger.warning("Redis cache read failed for %s", cache_key)

        candles = self.client.get_klines(symbol, interval, limit)

        try:
            await redis_pool.set(cache_key, json.dumps(candles), ex=CACHE_TTL_KLINES)
        except Exception:
            logger.warning("Redis cache write failed for %s", cache_key)

        return candles

    async def get_ticker(self, symbol: str) -> dict:
        """Получить тикер с кэшированием."""
        cache_key = f"market:ticker:{symbol}"

        try:
            cached = await redis_pool.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        ticker = self.client.get_ticker(symbol)
        result = {
            "symbol": ticker.symbol,
            "last_price": ticker.last_price,
            "mark_price": ticker.mark_price,
            "volume_24h": ticker.volume_24h,
            "high_24h": ticker.high_24h,
            "low_24h": ticker.low_24h,
            "funding_rate": ticker.funding_rate,
            "bid1_price": ticker.bid1_price,
            "ask1_price": ticker.ask1_price,
        }

        try:
            await redis_pool.set(cache_key, json.dumps(result), ex=CACHE_TTL_TICKER)
        except Exception:
            pass

        return result

    async def get_symbol_info(self, symbol: str) -> dict:
        """Получить информацию об инструменте."""
        info = self.client.get_symbol_info(symbol)
        return {
            "symbol": info.symbol,
            "tick_size": info.tick_size,
            "qty_step": info.qty_step,
            "min_qty": info.min_qty,
            "max_qty": info.max_qty,
            "min_notional": info.min_notional,
            "max_leverage": info.max_leverage,
        }

    async def get_wallet_balance(self, coin: str = "USDT") -> dict:
        """Получить баланс кошелька."""
        return self.client.get_wallet_balance(coin)
```

- [x] **Step 4: Write router.py**

Create `backend/app/modules/market/router.py`:

```python
"""API-эндпоинты модуля market."""

from fastapi import APIRouter, Depends, Query

from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.market.schemas import (
    CandleResponse,
    SymbolInfoResponse,
    TickerResponse,
    WalletBalanceResponse,
)
from app.modules.market.service import MarketService

router = APIRouter(prefix="/api/market", tags=["market"])


def get_market_service() -> MarketService:
    """Dependency: MarketService."""
    return MarketService()


@router.get("/klines/{symbol}", response_model=list[CandleResponse])
async def get_klines(
    symbol: str,
    interval: str = Query("5", description="1,5,15,60,240,D"),
    limit: int = Query(200, ge=1, le=1000),
    service: MarketService = Depends(get_market_service),
) -> list[CandleResponse]:
    """Получить OHLCV свечи для символа."""
    candles = await service.get_klines(symbol, interval, limit)
    return [CandleResponse(**c) for c in candles]


@router.get("/ticker/{symbol}", response_model=TickerResponse)
async def get_ticker(
    symbol: str,
    service: MarketService = Depends(get_market_service),
) -> TickerResponse:
    """Получить текущий тикер символа."""
    data = await service.get_ticker(symbol)
    return TickerResponse(**data)


@router.get("/symbol/{symbol}", response_model=SymbolInfoResponse)
async def get_symbol_info(
    symbol: str,
    service: MarketService = Depends(get_market_service),
) -> SymbolInfoResponse:
    """Получить спецификацию торгового инструмента."""
    data = await service.get_symbol_info(symbol)
    return SymbolInfoResponse(**data)


@router.get("/balance", response_model=WalletBalanceResponse)
async def get_balance(
    coin: str = Query("USDT"),
    user: User = Depends(get_current_user),
    service: MarketService = Depends(get_market_service),
) -> WalletBalanceResponse:
    """Получить баланс кошелька (требует авторизации)."""
    data = await service.get_wallet_balance(coin)
    return WalletBalanceResponse(**data)
```

- [x] **Step 5: Register router in main.py**

In `backend/app/main.py`, add import:

```python
from app.modules.market.router import router as market_router
```

Add after strategy router:

```python
app.include_router(market_router)
```

- [x] **Step 6: Update conftest.py**

In `backend/tests/conftest.py`, add after strategy models import:

```python
import app.modules.market.models  # noqa: F401
```

- [x] **Step 7: Write API tests**

Create `backend/tests/test_market_api.py`:

```python
"""Тесты API модуля market с мокированием BybitClient."""

from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.modules.market.bybit_client import SymbolInfo, Ticker


@pytest.fixture(autouse=True)
def mock_bybit_client():
    """Мокаем BybitClient для всех тестов market API."""
    with patch("app.modules.market.service.BybitClient") as MockClient:
        mock = MagicMock()
        MockClient.return_value = mock

        mock.get_klines.return_value = [
            {"timestamp": 1700001000000, "open": 100.0, "high": 101.0,
             "low": 99.0, "close": 100.5, "volume": 500.0, "turnover": 50000.0},
        ]
        mock.get_ticker.return_value = Ticker(
            symbol="BTCUSDT", last_price=65000.0, mark_price=65001.0,
            index_price=65000.5, volume_24h=12345.0, turnover_24h=800000000.0,
            high_24h=66000.0, low_24h=64000.0, funding_rate=0.0001,
            open_interest=5000.0, bid1_price=65000.0, ask1_price=65001.0,
        )
        mock.get_symbol_info.return_value = SymbolInfo(
            symbol="BTCUSDT", tick_size=0.1, qty_step=0.001,
            min_qty=0.001, max_qty=100.0, min_notional=5.0, max_leverage=100.0,
        )
        mock.get_wallet_balance.return_value = {
            "coin": "USDT", "wallet_balance": 1000.0,
            "available": 800.0, "equity": 1050.0, "unrealized_pnl": 50.0,
        }

        yield mock


@pytest.fixture(autouse=True)
def mock_redis():
    """Мокаем Redis для тестов."""
    with patch("app.modules.market.service.redis_pool") as mock:
        mock.get.return_value = None  # Нет кэша
        mock.set.return_value = True
        yield mock


@pytest.mark.asyncio
async def test_get_klines(client: AsyncClient) -> None:
    resp = await client.get("/api/market/klines/BTCUSDT?interval=5&limit=1")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["close"] == 100.5


@pytest.mark.asyncio
async def test_get_ticker(client: AsyncClient) -> None:
    resp = await client.get("/api/market/ticker/BTCUSDT")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "BTCUSDT"
    assert data["last_price"] == 65000.0


@pytest.mark.asyncio
async def test_get_symbol_info(client: AsyncClient) -> None:
    resp = await client.get("/api/market/symbol/BTCUSDT")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tick_size"] == 0.1
    assert data["max_leverage"] == 100.0


@pytest.mark.asyncio
async def test_get_balance_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/market/balance")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_balance_authenticated(
    client: AsyncClient, auth_headers: dict
) -> None:
    resp = await client.get("/api/market/balance", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["wallet_balance"] == 1000.0
    assert data["available"] == 800.0
```

- [x] **Step 8: Run all tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests PASS (~90+ total)

- [x] **Step 9: Commit**

```bash
git add backend/app/modules/market/ backend/app/main.py backend/tests/conftest.py backend/tests/test_market_api.py
git commit -m "feat(market): models, schemas, service, router — market data API"
```

---

## Task 4: BybitWebSocket — live data streaming

**Files:**
- Create: `backend/app/modules/market/bybit_ws.py`

- [x] **Step 1: Write WebSocket wrapper**

Create `backend/app/modules/market/bybit_ws.py`:

```python
"""Обёртка над pybit WebSocket V5 для live-стримов.

Предоставляет:
- Публичные стримы: kline, ticker
- Приватные стримы: order, position, execution, wallet
- Автоматический реконнект (встроен в pybit)
- Callback-based API
"""

import logging
from collections.abc import Callable
from typing import Any

from pybit.unified_trading import WebSocket

from app.config import settings

logger = logging.getLogger(__name__)


class BybitWebSocketPublic:
    """Публичный WebSocket — kline, ticker, orderbook стримы.

    Не требует API-ключей. Один инстанс на channel_type.
    """

    def __init__(self, testnet: bool | None = None) -> None:
        self._testnet = testnet if testnet is not None else settings.bybit_testnet
        self._ws: WebSocket | None = None
        self._callbacks: dict[str, Callable] = {}

    def _ensure_connected(self) -> WebSocket:
        """Создать WS-соединение при первом использовании."""
        if self._ws is None:
            self._ws = WebSocket(
                testnet=self._testnet,
                channel_type="linear",
            )
        return self._ws

    def subscribe_kline(
        self, symbol: str, interval: int, callback: Callable[[dict], None]
    ) -> None:
        """Подписка на стрим свечей.

        Args:
            symbol: "BTCUSDT"
            interval: 1, 5, 15, 60, 240, etc.
            callback: Вызывается с dict содержащим:
                start, end, interval, open, close, high, low,
                volume, turnover, confirm (bool).
        """
        ws = self._ensure_connected()
        key = f"kline.{interval}.{symbol}"
        self._callbacks[key] = callback

        def _handler(message: dict) -> None:
            try:
                data = message.get("data", [{}])[0] if "data" in message else {}
                if data:
                    callback({
                        "symbol": message.get("topic", "").split(".")[-1],
                        "interval": str(interval),
                        "start": int(data.get("start", 0)),
                        "end": int(data.get("end", 0)),
                        "open": float(data.get("open", 0)),
                        "high": float(data.get("high", 0)),
                        "low": float(data.get("low", 0)),
                        "close": float(data.get("close", 0)),
                        "volume": float(data.get("volume", 0)),
                        "turnover": float(data.get("turnover", 0)),
                        "confirm": data.get("confirm", False),
                    })
            except Exception:
                logger.exception("Error in kline callback for %s", key)

        ws.kline_stream(interval=interval, symbol=symbol, callback=_handler)
        logger.info("Subscribed to kline: %s %dm", symbol, interval)

    def subscribe_ticker(
        self, symbol: str, callback: Callable[[dict], None]
    ) -> None:
        """Подписка на стрим тикера."""
        ws = self._ensure_connected()

        def _handler(message: dict) -> None:
            try:
                data = message.get("data", {})
                if data:
                    callback({
                        "symbol": data.get("symbol", ""),
                        "last_price": float(data.get("lastPrice", 0)),
                        "mark_price": float(data.get("markPrice", 0)),
                        "volume_24h": float(data.get("volume24h", 0)),
                        "bid1_price": float(data.get("bid1Price", 0)),
                        "ask1_price": float(data.get("ask1Price", 0)),
                        "funding_rate": float(data.get("fundingRate", 0)),
                    })
            except Exception:
                logger.exception("Error in ticker callback for %s", symbol)

        ws.ticker_stream(symbol=symbol, callback=_handler)
        logger.info("Subscribed to ticker: %s", symbol)

    def close(self) -> None:
        """Закрыть WebSocket соединение."""
        if self._ws is not None:
            try:
                self._ws.exit()
            except Exception:
                pass
            self._ws = None
            logger.info("WebSocket public closed")


class BybitWebSocketPrivate:
    """Приватный WebSocket — order, position, execution стримы.

    Требует API-ключи.
    """

    def __init__(
        self,
        api_key: str | None = None,
        api_secret: str | None = None,
        testnet: bool | None = None,
    ) -> None:
        self._ws = WebSocket(
            testnet=testnet if testnet is not None else settings.bybit_testnet,
            channel_type="private",
            api_key=api_key or settings.bybit_api_key,
            api_secret=api_secret or settings.bybit_api_secret,
        )

    def subscribe_order(self, callback: Callable[[dict], None]) -> None:
        """Подписка на обновления ордеров."""
        def _handler(message: dict) -> None:
            try:
                for order_data in message.get("data", []):
                    callback({
                        "order_id": order_data.get("orderId", ""),
                        "order_link_id": order_data.get("orderLinkId", ""),
                        "symbol": order_data.get("symbol", ""),
                        "side": order_data.get("side", ""),
                        "order_type": order_data.get("orderType", ""),
                        "price": order_data.get("price", "0"),
                        "qty": order_data.get("qty", "0"),
                        "status": order_data.get("orderStatus", ""),
                        "avg_price": order_data.get("avgPrice", "0"),
                        "cum_exec_qty": order_data.get("cumExecQty", "0"),
                        "take_profit": order_data.get("takeProfit", "0"),
                        "stop_loss": order_data.get("stopLoss", "0"),
                    })
            except Exception:
                logger.exception("Error in order callback")

        self._ws.order_stream(callback=_handler)
        logger.info("Subscribed to private order stream")

    def subscribe_position(self, callback: Callable[[dict], None]) -> None:
        """Подписка на обновления позиций."""
        def _handler(message: dict) -> None:
            try:
                for pos_data in message.get("data", []):
                    callback({
                        "symbol": pos_data.get("symbol", ""),
                        "side": pos_data.get("side", ""),
                        "size": pos_data.get("size", "0"),
                        "avg_price": pos_data.get("avgPrice", "0"),
                        "mark_price": pos_data.get("markPrice", "0"),
                        "unrealized_pnl": pos_data.get("unrealisedPnl", "0"),
                        "leverage": pos_data.get("leverage", "1"),
                        "take_profit": pos_data.get("takeProfit", "0"),
                        "stop_loss": pos_data.get("stopLoss", "0"),
                        "trailing_stop": pos_data.get("trailingStop", "0"),
                        "liq_price": pos_data.get("liqPrice", "0"),
                    })
            except Exception:
                logger.exception("Error in position callback")

        self._ws.position_stream(callback=_handler)
        logger.info("Subscribed to private position stream")

    def subscribe_execution(self, callback: Callable[[dict], None]) -> None:
        """Подписка на исполнения сделок."""
        def _handler(message: dict) -> None:
            try:
                for exec_data in message.get("data", []):
                    callback({
                        "order_id": exec_data.get("orderId", ""),
                        "symbol": exec_data.get("symbol", ""),
                        "side": exec_data.get("side", ""),
                        "exec_price": exec_data.get("execPrice", "0"),
                        "exec_qty": exec_data.get("execQty", "0"),
                        "exec_fee": exec_data.get("execFee", "0"),
                        "exec_type": exec_data.get("execType", ""),
                    })
            except Exception:
                logger.exception("Error in execution callback")

        self._ws.execution_stream(callback=_handler)
        logger.info("Subscribed to private execution stream")

    def close(self) -> None:
        """Закрыть WebSocket соединение."""
        try:
            self._ws.exit()
        except Exception:
            pass
        logger.info("WebSocket private closed")
```

- [x] **Step 2: Verify import**

Run: `cd backend && python -c "from app.modules.market.bybit_ws import BybitWebSocketPublic, BybitWebSocketPrivate; print('OK')"`
Expected: `OK`

- [x] **Step 3: Commit**

```bash
git add backend/app/modules/market/bybit_ws.py
git commit -m "feat(market): BybitWebSocket — public and private stream wrappers"
```

---

## Task 5: Alembic migration + integration check

**Files:**
- Migration file (generated on VPS)

- [x] **Step 1: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests PASS (~100 total)

- [x] **Step 2: Verify app starts**

Run: `cd backend && python -c "from app.main import app; print('Routes:', len(app.routes))"`
Expected: Routes count increases (should be ~35+)

- [x] **Step 3: Generate migration on VPS**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec api alembic revision --autogenerate -m 'add ohlcv_candles table'"
```

- [x] **Step 4: Apply migration**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec api alembic upgrade head"
```

- [x] **Step 5: Verify endpoints on VPS**

```bash
ssh jeremy-vps "curl -s http://localhost:8100/api/market/ticker/BTCUSDT"
```

---

## Summary

| Task | Component | Files | Tests |
|------|-----------|-------|-------|
| 1 | Dependencies + Config | requirements.txt, config.py | — |
| 2 | BybitClient HTTP | bybit_client.py, test_bybit_client.py | 14 tests |
| 3 | Market module (models/schemas/service/router) | 4 files + main.py + test_market_api.py | 5 tests |
| 4 | BybitWebSocket | bybit_ws.py | — |
| 5 | Migration + Integration | migration + VPS deploy | full suite |

**Total: ~19 new tests, 8 new files**

**Bybit V5 API coverage:**
- Market data: get_kline, get_tickers, get_instruments_info
- Orders: place_order, cancel_order, get_open_orders
- Positions: get_positions, set_leverage, set_trading_stop (SL/TP/trailing)
- Account: get_wallet_balance
- WebSocket public: kline_stream, ticker_stream
- WebSocket private: order_stream, position_stream, execution_stream

**Next:** Phase 3B (Trading module — bots, orders, positions DB + CRUD) and Phase 3C (Trading bot worker — signal monitoring, order execution).
