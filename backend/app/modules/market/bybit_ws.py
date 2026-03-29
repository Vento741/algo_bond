"""Обёртка над pybit WebSocket V5 для live-стримов.

Предоставляет:
- Публичные стримы: kline, ticker
- Приватные стримы: order, position, execution, wallet
- Автоматический реконнект (встроен в pybit)
- Callback-based API
"""

import logging
from collections.abc import Callable

from pybit.unified_trading import WebSocket

from app.config import settings

logger = logging.getLogger(__name__)


class BybitWebSocketPublic:
    """Публичный WebSocket — kline, ticker стримы. Не требует API-ключей."""

    def __init__(self, testnet: bool | None = None) -> None:
        self._testnet = testnet if testnet is not None else settings.bybit_testnet
        self._ws: WebSocket | None = None

    def _ensure_connected(self) -> WebSocket:
        if self._ws is None:
            self._ws = WebSocket(testnet=self._testnet, channel_type="linear")
        return self._ws

    def subscribe_kline(self, symbol: str, interval: int, callback: Callable[[dict], None]) -> None:
        """Подписка на стрим свечей."""
        ws = self._ensure_connected()

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
                logger.exception("Error in kline callback for %s.%s", symbol, interval)

        ws.kline_stream(interval=interval, symbol=symbol, callback=_handler)
        logger.info("Subscribed to kline: %s %dm", symbol, interval)

    def subscribe_ticker(self, symbol: str, callback: Callable[[dict], None]) -> None:
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
    """Приватный WebSocket — order, position, execution стримы. Требует API-ключи."""

    def __init__(
        self, api_key: str | None = None, api_secret: str | None = None,
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
