"""WebSocket эндпоинты для стриминга рыночных данных в браузер.

Endpoints:
- /ws/market/{symbol} — публичный: kline + ticker стрим
- /ws/trading — приватный: order + position updates (требует JWT)
"""

import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.core.security import decode_token
from app.modules.market.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/market/{symbol}")
async def market_stream(
    websocket: WebSocket,
    symbol: str,
    interval: str = Query("5"),
) -> None:
    """Стрим рыночных данных для символа.

    Отправляет клиенту JSON сообщения:
    - {"type": "kline", "data": {...}} — обновление свечи
    - {"type": "ticker", "data": {...}} — обновление тикера

    Публичный эндпоинт (не требует авторизации).
    """
    channel = f"market:{symbol}:{interval}"
    await manager.connect(websocket, channel)

    # Если это первый клиент для канала — запустить Bybit подписку
    if manager.get_client_count(channel) == 1:
        _start_bybit_stream(symbol, int(interval) if interval.isdigit() else 5, channel)

    try:
        # Держим соединение открытым, обрабатываем ping/pong
        while True:
            data = await websocket.receive_text()
            # Клиент может отправлять ping
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)
    except Exception:
        manager.disconnect(websocket, channel)


@router.websocket("/ws/trading")
async def trading_stream(
    websocket: WebSocket,
    token: str = Query(""),
) -> None:
    """Приватный стрим торговых обновлений.

    Требует JWT токен в query: /ws/trading?token=xxx

    Отправляет:
    - {"type": "order", "data": {...}} — обновление ордера
    - {"type": "position", "data": {...}} — обновление позиции
    - {"type": "execution", "data": {...}} — исполнение сделки
    """
    # Проверить JWT
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except (JWTError, Exception):
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"trading:{user_id}"
    await manager.connect(websocket, channel)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)
    except Exception:
        manager.disconnect(websocket, channel)


# === Bybit Stream Integration ===

_active_streams: dict[str, bool] = {}


def _start_bybit_stream(symbol: str, interval: int, channel: str) -> None:
    """Запустить Bybit WebSocket подписку для канала."""
    if channel in _active_streams:
        return

    _active_streams[channel] = True

    try:
        from app.modules.market.bybit_ws import BybitWebSocketPublic

        ws = BybitWebSocketPublic()

        def on_kline(data: dict) -> None:
            """Callback: новая свеча → broadcast."""
            asyncio.get_event_loop().call_soon_threadsafe(
                asyncio.ensure_future,
                manager.broadcast(channel, {"type": "kline", "data": data}),
            )

        def on_ticker(data: dict) -> None:
            """Callback: тикер → broadcast."""
            asyncio.get_event_loop().call_soon_threadsafe(
                asyncio.ensure_future,
                manager.broadcast(channel, {"type": "ticker", "data": data}),
            )

        ws.subscribe_kline(symbol, interval, on_kline)
        ws.subscribe_ticker(symbol, on_ticker)
        logger.info("Started Bybit stream for %s (interval=%d)", symbol, interval)

    except Exception:
        logger.exception("Failed to start Bybit stream for %s", symbol)
        _active_streams.pop(channel, None)
