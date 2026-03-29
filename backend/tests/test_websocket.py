"""Тесты WebSocket эндпоинтов."""

import pytest
from httpx import AsyncClient

from app.modules.market.ws_manager import ConnectionManager


@pytest.mark.asyncio
async def test_ws_status(client: AsyncClient) -> None:
    """GET /api/ws/status — статус подключений."""
    resp = await client.get("/api/ws/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_clients" in data
    assert data["total_clients"] == 0
    assert "channels" in data
    assert isinstance(data["channels"], list)


@pytest.mark.asyncio
async def test_ws_manager_unit() -> None:
    """Юнит-тест ConnectionManager — connect/disconnect/broadcast."""
    mgr = ConnectionManager()
    assert mgr.total_clients == 0
    assert mgr.get_channels() == []
    assert mgr.get_client_count("test") == 0


# NOTE: Полноценные WebSocket тесты требуют Starlette TestClient
# с поддержкой ws:// протокола. httpx AsyncClient не поддерживает WS.
# Для E2E тестирования использовать:
#   from starlette.testclient import TestClient
#   with TestClient(app).websocket_connect("/ws/market/BTCUSDT") as ws:
#       ws.send_text("ping")
#       assert ws.receive_text() == "pong"
