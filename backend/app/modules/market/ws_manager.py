"""WebSocket менеджер — управление соединениями браузеров.

Fan-out: один Bybit WebSocket → много браузерных клиентов.
"""

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Менеджер WebSocket соединений.

    Группирует клиентов по каналам (symbol:stream_type).
    Поддерживает broadcast по каналу.
    """

    def __init__(self) -> None:
        # channel -> set of websockets
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        """Подключить клиента к каналу."""
        await websocket.accept()
        self._connections[channel].add(websocket)
        logger.info(
            "WS client connected to %s (total: %d)",
            channel,
            len(self._connections[channel]),
        )

    def disconnect(self, websocket: WebSocket, channel: str) -> None:
        """Отключить клиента от канала."""
        self._connections[channel].discard(websocket)
        if not self._connections[channel]:
            del self._connections[channel]
        logger.info("WS client disconnected from %s", channel)

    async def broadcast(self, channel: str, data: dict) -> None:
        """Отправить данные всем клиентам канала."""
        if channel not in self._connections:
            return
        message = json.dumps(data)
        dead_connections: set[WebSocket] = set()
        for ws in self._connections[channel]:
            try:
                await ws.send_text(message)
            except Exception:
                dead_connections.add(ws)
        for ws in dead_connections:
            self._connections[channel].discard(ws)

    def get_channels(self) -> list[str]:
        """Список активных каналов."""
        return list(self._connections.keys())

    def get_client_count(self, channel: str) -> int:
        """Количество клиентов в канале."""
        return len(self._connections.get(channel, set()))

    @property
    def total_clients(self) -> int:
        """Общее количество подключённых клиентов."""
        return sum(len(conns) for conns in self._connections.values())


# Глобальный менеджер
manager = ConnectionManager()
