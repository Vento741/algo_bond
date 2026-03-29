"""Celery задачи для торгового бота."""

import asyncio
import logging
import uuid
from typing import Any

from app.celery_app import celery

logger = logging.getLogger(__name__)

def _import_all_models() -> None:
    """Импорт всех модулей моделей для резолва SQLAlchemy relationships."""
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401
    import app.modules.backtest.models  # noqa: F401


@celery.task(name="trading.run_bot_cycle", bind=True, max_retries=0)
def run_bot_cycle_task(self: Any, bot_id: str) -> dict:
    """Celery task: один цикл торгового бота."""
    _import_all_models()
    from app.modules.trading.bot_worker import run_bot_cycle

    return asyncio.run(run_bot_cycle(uuid.UUID(bot_id)))


async def _fetch_running_bot_ids() -> list[str]:
    """Получить ID всех ботов со статусом RUNNING из БД."""
    from sqlalchemy import select

    from app.database import create_standalone_session
    from app.modules.trading.models import Bot, BotStatus

    session_factory = create_standalone_session()
    async with session_factory() as session:
        result = await session.execute(
            select(Bot.id).where(Bot.status == BotStatus.RUNNING)
        )
        return [str(bot_id) for bot_id in result.scalars().all()]


@celery.task(name="trading.run_active_bots")
def run_active_bots_task() -> dict:
    """Периодическая задача: запустить цикл для всех активных ботов."""
    _import_all_models()
    bot_ids = asyncio.run(_fetch_running_bot_ids())

    for bot_id in bot_ids:
        run_bot_cycle_task.delay(bot_id)

    logger.info("run_active_bots: диспатчено %d задач", len(bot_ids))
    return {"dispatched": len(bot_ids), "bot_ids": bot_ids}
