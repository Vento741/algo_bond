"""Celery задачи для торгового бота."""

import asyncio
import uuid

from app.celery_app import celery


@celery.task(name="trading.run_bot_cycle", bind=True, max_retries=0)
def run_bot_cycle_task(self, bot_id: str) -> dict:
    """Celery task: один цикл торгового бота.

    Обёртка над async run_bot_cycle — запускает через asyncio.run().
    Принимает bot_id как строку (Celery JSON-сериализация).
    """
    from app.modules.trading.bot_worker import run_bot_cycle

    return asyncio.run(run_bot_cycle(uuid.UUID(bot_id)))
