"""HTTP эндпоинт для информации о WebSocket подключениях."""

from fastapi import APIRouter

from app.modules.market.ws_manager import manager

router = APIRouter(prefix="/api/ws", tags=["websocket"])


@router.get("/status")
async def ws_status() -> dict:
    """Статус WebSocket подключений."""
    return {
        "total_clients": manager.total_clients,
        "channels": manager.get_channels(),
    }
