"""Обёртка над pybit V5 API для Bybit."""

import logging
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from pybit.exceptions import FailedRequestError, InvalidRequestError
from pybit.unified_trading import HTTP

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

    Режимы:
    - demo=True  → api-demo.bybit.com (реальные цены, симулированные ордера)
    - demo=False → api.bybit.com (боевой, реальные деньги)
    - Публичные данные (без ключей) → api.bybit.com (mainnet)
    - testnet НЕ используется (api-testnet.bybit.com — искусственные цены).
    """

    def __init__(
        self,
        api_key: str | None = None,
        api_secret: str | None = None,
        demo: bool = False,
    ) -> None:
        self._session = HTTP(
            demo=demo,
            api_key=api_key or "",
            api_secret=api_secret or "",
            recv_window=10000,
            max_retries=3,
            retry_delay=1,
            logging_level=logging.WARNING,
        )

    def get_klines(
        self, symbol: str, interval: str = "5", limit: int = 200,
        start: int | None = None, end: int | None = None,
    ) -> list[dict]:
        """Получить OHLCV свечи (хронологический порядок, oldest first)."""
        try:
            kwargs: dict = {"category": "linear", "symbol": symbol, "interval": interval, "limit": limit}
            if start is not None:
                kwargs["start"] = start
            if end is not None:
                kwargs["end"] = end
            result = self._session.get_kline(**kwargs)
            raw_list = result["result"]["list"]
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

    def klines_to_arrays(self, candles: list[dict]) -> dict[str, NDArray]:
        """Конвертировать свечи в numpy-массивы для стратегии."""
        if not candles:
            empty = np.array([], dtype=np.float64)
            return {"open": empty, "high": empty, "low": empty, "close": empty, "volume": empty, "timestamps": empty}
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
                symbol=data["symbol"], last_price=float(data["lastPrice"]),
                mark_price=float(data["markPrice"]), index_price=float(data["indexPrice"]),
                volume_24h=float(data["volume24h"]), turnover_24h=float(data["turnover24h"]),
                high_24h=float(data["highPrice24h"]), low_24h=float(data["lowPrice24h"]),
                funding_rate=float(data["fundingRate"]), open_interest=float(data["openInterest"]),
                bid1_price=float(data["bid1Price"]), ask1_price=float(data["ask1Price"]),
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
                symbol=data["symbol"], tick_size=float(data["priceFilter"]["tickSize"]),
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

    def place_order(
        self, symbol: str, side: str, order_type: str, qty: float,
        price: float | None = None, take_profit: float | None = None,
        stop_loss: float | None = None, position_idx: int = 0,
        order_link_id: str | None = None,
    ) -> dict:
        """Создать ордер."""
        try:
            kwargs: dict = {
                "category": "linear", "symbol": symbol, "side": side,
                "orderType": order_type, "qty": str(qty), "positionIdx": position_idx,
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
            result = self._session.cancel_order(category="linear", symbol=symbol, orderId=order_id)
            logger.info("Order cancelled: %s", order_id)
            return result["result"]
        except InvalidRequestError as e:
            if e.status_code == 110010:
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

    def get_positions(self, symbol: str | None = None) -> list[dict]:
        """Получить открытые позиции (filtered: size > 0)."""
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
        """Установить плечо (ignores 110043 if already set)."""
        try:
            self._session.set_leverage(
                category="linear", symbol=symbol,
                buyLeverage=str(leverage), sellLeverage=str(leverage),
            )
            logger.info("Leverage set: %s x%d", symbol, leverage)
        except InvalidRequestError as e:
            if e.status_code == 110043:
                logger.debug("Leverage already set: %s x%d", symbol, leverage)
                return
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def set_trading_stop(
        self, symbol: str, take_profit: float | None = None,
        stop_loss: float | None = None, trailing_stop: float | None = None,
        active_price: float | None = None, position_idx: int = 0,
        tpsl_mode: str = "Full",
        tp_size: float | None = None,
        sl_size: float | None = None,
    ) -> None:
        """Установить SL/TP/Trailing Stop для позиции.

        tpsl_mode: "Full" (весь объём) или "Partial" (частичное закрытие).
        tp_size/sl_size: объём для частичного TP/SL (только при Partial).
        """
        try:
            kwargs: dict = {
                "category": "linear", "symbol": symbol,
                "tpslMode": tpsl_mode, "positionIdx": position_idx,
            }
            if take_profit is not None:
                kwargs["takeProfit"] = str(take_profit)
            if stop_loss is not None:
                kwargs["stopLoss"] = str(stop_loss)
            if trailing_stop is not None:
                kwargs["trailingStop"] = str(trailing_stop)
            if active_price is not None:
                kwargs["activePrice"] = str(active_price)
            if tp_size is not None:
                kwargs["tpSize"] = str(tp_size)
            if sl_size is not None:
                kwargs["slSize"] = str(sl_size)
            self._session.set_trading_stop(**kwargs)
            logger.info("Trading stop set: %s TP=%s SL=%s Trail=%s mode=%s", symbol, take_profit, stop_loss, trailing_stop, tpsl_mode)
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e

    def get_wallet_balance(self, coin: str = "USDT") -> dict:
        """Получить баланс кошелька."""
        try:
            result = self._session.get_wallet_balance(accountType="UNIFIED", coin=coin)
            coins = result["result"]["list"][0]["coin"]
            for c in coins:
                if c["coin"] == coin:
                    return {
                        "coin": coin,
                        "wallet_balance": float(c["walletBalance"] or 0),
                        "available": float(c["availableToWithdraw"] or 0),
                        "equity": float(c["equity"] or 0),
                        "unrealized_pnl": float(c["unrealisedPnl"] or 0),
                    }
            return {"coin": coin, "wallet_balance": 0, "available": 0, "equity": 0, "unrealized_pnl": 0}
        except InvalidRequestError as e:
            raise BybitAPIError(e.status_code, str(e.message)) from e
        except FailedRequestError as e:
            raise BybitAPIError(-1, f"Network error: {e.message}") from e
