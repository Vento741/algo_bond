"""WebSocket эндпоинт для real-time уведомлений."""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.core.security import decode_token
from app.modules.market.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/notifications")
async def notifications_stream(
    websocket: WebSocket,
    token: str = Query(""),
) -> None:
    """Приватный стрим уведомлений.

    Требует JWT токен в query: /ws/notifications?token=xxx

    Отправляет:
    - {"type": "new_notification", "data": {...}} - новое уведомление
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

    channel = f"notifications:{user_id}"
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
