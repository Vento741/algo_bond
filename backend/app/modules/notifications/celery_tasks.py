"""Celery задачи модуля notifications."""

import asyncio
import logging

from app.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(name="notifications.cleanup_old")
def cleanup_old_notifications_task() -> dict:
    """Удалить прочитанные уведомления старше 30 дней."""
    from app.modules.notifications.service import NotificationService

    count = asyncio.run(NotificationService.cleanup_old(days=30))
    return {"deleted": count}
