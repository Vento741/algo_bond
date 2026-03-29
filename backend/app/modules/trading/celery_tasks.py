"""Celery задачи для торгового бота."""

import asyncio
import uuid

from app.celery_app import celery

_loop = None


def _get_loop() -> asyncio.AbstractEventLoop:
    """Получить или создать persistent event loop для Celery worker."""
    global _loop
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
    return _loop


@celery.task(name="trading.run_bot_cycle", bind=True, max_retries=0)
def run_bot_cycle_task(self, bot_id: str) -> dict:
    """Celery task: один цикл торгового бота.

    Обёртка над async run_bot_cycle — запускает через persistent event loop.
    Принимает bot_id как строку (Celery JSON-сериализация).
    """
    from app.modules.trading.bot_worker import run_bot_cycle

    loop = _get_loop()
    return loop.run_until_complete(run_bot_cycle(uuid.UUID(bot_id)))
