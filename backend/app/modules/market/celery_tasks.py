"""Celery задачи модуля market."""

import asyncio
import logging

from app.celery_app import celery

logger = logging.getLogger(__name__)


def _import_all_models() -> None:
    """Импорт моделей для корректной работы SQLAlchemy."""
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.market.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401
    import app.modules.backtest.models  # noqa: F401


async def _sync_pairs() -> int:
    """Асинхронная синхронизация пар."""
    from app.database import async_session
    from app.modules.market.service import MarketService

    service = MarketService()
    async with async_session() as db:
        count = await service.sync_pairs(db)
    return count


@celery.task(name="market.sync_trading_pairs")
def sync_trading_pairs_task() -> dict:
    """Периодическая задача: синхронизация торговых пар с Bybit."""
    _import_all_models()
    count = asyncio.run(_sync_pairs())
    logger.info("Синхронизировано %d торговых пар", count)
    return {"synced": count}
