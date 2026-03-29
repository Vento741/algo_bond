"""Redis pub/sub мост: Listener → API → Browser WebSocket.

Bybit Listener (отдельный Docker-контейнер) публикует события в Redis pub/sub.
Этот модуль подписывается на каналы trading:* и ретранслирует
сообщения через ConnectionManager в браузерные WebSocket.

Запускается как background task при старте FastAPI приложения.
"""

import asyncio
import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)

# Задача подписчика, чтобы можно было отменить при shutdown
_subscriber_task: asyncio.Task | None = None


async def _redis_subscriber() -> None:
    """Фоновая задача: подписка на Redis pub/sub каналы trading:*.

    Получает сообщения от Bybit Listener и пересылает в браузерные WS
    через ConnectionManager.
    """
    from redis.asyncio import Redis

    from app.modules.market.ws_manager import manager

    redis: Redis | None = None
    backoff = 1

    while True:
        try:
            redis = Redis.from_url(settings.redis_url, decode_responses=True)
            pubsub = redis.pubsub()

            # Подписка на паттерн trading:* (все user-каналы)
            await pubsub.psubscribe("trading:*")
            logger.info("Redis pub/sub подписка активирована: trading:*")
            backoff = 1

            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue

                channel: str = message["channel"]  # "trading:{user_id}"
                raw_data: str = message["data"]

                try:
                    data = json.loads(raw_data)
                except (json.JSONDecodeError, TypeError):
                    logger.warning("Невалидный JSON из Redis: %s", raw_data[:200])
                    continue

                # Ретрансляция в браузерный WebSocket через ConnectionManager
                # channel уже в формате "trading:{user_id}" — совпадает с ws_router
                client_count = manager.get_client_count(channel)
                if client_count > 0:
                    await manager.broadcast(channel, data)
                    logger.debug(
                        "Ретрансляция %s → %d клиентов: %s",
                        channel, client_count, data.get("type", "?"),
                    )

        except asyncio.CancelledError:
            logger.info("Redis pub/sub подписка отменена")
            break
        except Exception:
            logger.exception(
                "Ошибка Redis pub/sub, переподключение через %d сек",
                backoff,
            )
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
        finally:
            if redis:
                try:
                    await redis.aclose()
                except Exception:
                    pass
                redis = None


def start_ws_bridge() -> None:
    """Запустить Redis pub/sub мост как background task.

    Вызывается при старте FastAPI приложения (lifespan).
    """
    global _subscriber_task
    if _subscriber_task is not None and not _subscriber_task.done():
        logger.warning("WS bridge уже запущен")
        return

    _subscriber_task = asyncio.create_task(
        _redis_subscriber(),
        name="ws-bridge-subscriber",
    )
    logger.info("WS bridge запущен")


async def stop_ws_bridge() -> None:
    """Остановить Redis pub/sub мост.

    Вызывается при остановке FastAPI приложения (lifespan).
    """
    global _subscriber_task
    if _subscriber_task is not None and not _subscriber_task.done():
        _subscriber_task.cancel()
        try:
            await _subscriber_task
        except asyncio.CancelledError:
            pass
    _subscriber_task = None
    logger.info("WS bridge остановлен")
