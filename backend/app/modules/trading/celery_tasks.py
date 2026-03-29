"""Celery задачи для торгового бота."""

import asyncio
import logging
import uuid
from typing import Any

from app.celery_app import celery

logger = logging.getLogger(__name__)

_loop = None


def _get_loop() -> asyncio.AbstractEventLoop:
    """Получить или создать persistent event loop для Celery worker."""
    global _loop
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
    return _loop


@celery.task(name="trading.run_bot_cycle", bind=True, max_retries=0)
def run_bot_cycle_task(self: Any, bot_id: str) -> dict:
    """Celery task: один цикл торгового бота.

    Обёртка над async run_bot_cycle — запускает через persistent event loop.
    Принимает bot_id как строку (Celery JSON-сериализация).
    """
    from app.modules.trading.bot_worker import run_bot_cycle

    loop = _get_loop()
    return loop.run_until_complete(run_bot_cycle(uuid.UUID(bot_id)))


async def _fetch_running_bot_ids() -> list[str]:
    """Получить ID всех ботов со статусом RUNNING из БД."""
    from sqlalchemy import select

    from app.database import async_session
    from app.modules.trading.models import Bot, BotStatus

    async with async_session() as session:
        result = await session.execute(
            select(Bot.id).where(Bot.status == BotStatus.RUNNING)
        )
        return [str(bot_id) for bot_id in result.scalars().all()]


@celery.task(name="trading.run_active_bots")
def run_active_bots_task() -> dict:
    """Периодическая задача: запустить цикл для всех активных ботов.

    Вызывается Celery Beat каждые 5 минут.
    Получает все боты со статусом RUNNING и диспатчит
    run_bot_cycle_task для каждого из них.
    """
    loop = _get_loop()
    bot_ids = loop.run_until_complete(_fetch_running_bot_ids())

    for bot_id in bot_ids:
        run_bot_cycle_task.delay(bot_id)

    logger.info("run_active_bots: диспатчено %d задач", len(bot_ids))
    return {"dispatched": len(bot_ids), "bot_ids": bot_ids}
