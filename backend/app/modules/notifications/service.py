"""Сервис уведомлений: CRUD + Redis publish."""

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.enums import (
    NotificationPriority,
    NotificationType,
    get_category,
)
from app.modules.notifications.models import Notification, NotificationPreference

logger = logging.getLogger(__name__)


class NotificationService:
    """Сервис для работы с уведомлениями."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        user_id: uuid.UUID,
        type: NotificationType,
        priority: NotificationPriority,
        title: str,
        message: str,
        data: dict | None = None,
        link: str | None = None,
    ) -> Notification | None:
        """Создать уведомление в БД и опубликовать в Redis.

        Возвращает None если категория отключена пользователем
        (кроме critical - приходят всегда).
        """
        # Проверить preferences (кроме critical)
        if priority != NotificationPriority.CRITICAL:
            category = get_category(type)
            prefs = await self.get_preferences(user_id)
            if prefs and not getattr(prefs, f"{category}_enabled", True):
                return None

        notification = Notification(
            user_id=user_id,
            type=type,
            priority=priority,
            title=title,
            message=message,
            data=data,
            link=link,
        )
        self.db.add(notification)
        await self.db.flush()

        # Публикация в Redis для real-time доставки
        await self._publish_to_redis(notification)
        await self._send_to_telegram(notification)

        await self.db.commit()
        return notification

    async def _publish_to_redis(self, notification: Notification) -> None:
        """Опубликовать уведомление в Redis pub/sub."""
        try:
            from app.redis import get_redis
            redis = get_redis()
            channel = f"notifications:{notification.user_id}"
            payload = json.dumps({
                "type": "new_notification",
                "data": {
                    "id": str(notification.id),
                    "type": notification.type.value,
                    "priority": notification.priority.value,
                    "title": notification.title,
                    "message": notification.message,
                    "data": notification.data,
                    "link": notification.link,
                    "is_read": False,
                    "created_at": notification.created_at.isoformat(),
                },
            })
            await redis.publish(channel, payload)
            await redis.aclose()
        except Exception:
            logger.exception("Ошибка публикации уведомления в Redis")

    async def _send_to_telegram(self, notification: Notification) -> None:
        """Отправить уведомление в Telegram (если включено пользователем)."""
        try:
            from app.modules.telegram.notifications import TelegramNotifier
            notifier = TelegramNotifier(self.db)
            await notifier.on_notification(notification)
        except Exception:
            logger.exception("Ошибка отправки уведомления в Telegram")

    async def get_user_notifications(
        self,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
        type_filter: str | None = None,
    ) -> tuple[list[Notification], int, int]:
        """Получить уведомления пользователя.

        Returns: (notifications, total_count, unread_count)
        """
        query = select(Notification).where(Notification.user_id == user_id)

        if type_filter:
            # Фильтр по категории
            from app.modules.notifications.enums import NOTIFICATION_CATEGORIES
            types = NOTIFICATION_CATEGORIES.get(type_filter)
            if types:
                query = query.where(Notification.type.in_(types))

        # Total count
        count_query = select(func.count()).select_from(
            query.subquery()
        )
        total = (await self.db.execute(count_query)).scalar() or 0

        # Unread count (без фильтра)
        unread = await self.get_unread_count(user_id)

        # Paginated results
        query = query.order_by(Notification.created_at.desc())
        query = query.limit(limit).offset(offset)
        result = await self.db.execute(query)
        notifications = list(result.scalars().all())

        return notifications, total, unread

    async def get_unread_count(self, user_id: uuid.UUID) -> int:
        """Количество непрочитанных уведомлений."""
        query = select(func.count()).where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def mark_read(self, user_id: uuid.UUID, notification_id: uuid.UUID) -> bool:
        """Отметить уведомление прочитанным."""
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return result.rowcount > 0  # type: ignore[return-value]

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        """Отметить все уведомления прочитанными."""
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read == False,  # noqa: E712
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return result.rowcount  # type: ignore[return-value]

    async def delete_notification(
        self, user_id: uuid.UUID, notification_id: uuid.UUID
    ) -> bool:
        """Удалить уведомление."""
        result = await self.db.execute(
            delete(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        await self.db.commit()
        return result.rowcount > 0  # type: ignore[return-value]

    async def get_preferences(
        self, user_id: uuid.UUID
    ) -> NotificationPreference | None:
        """Получить настройки уведомлений пользователя."""
        result = await self.db.execute(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def update_preferences(
        self, user_id: uuid.UUID, updates: dict
    ) -> NotificationPreference:
        """Обновить или создать настройки уведомлений."""
        pref = await self.get_preferences(user_id)
        if pref is None:
            pref = NotificationPreference(user_id=user_id, **updates)
            self.db.add(pref)
        else:
            for key, value in updates.items():
                if hasattr(pref, key) and value is not None:
                    setattr(pref, key, value)
        await self.db.flush()
        await self.db.commit()
        return pref

    @staticmethod
    async def cleanup_old(days: int = 30) -> int:
        """Удалить старые уведомления. Вызывается из Celery task."""
        from app.database import create_standalone_session

        standalone_session = create_standalone_session()
        async with standalone_session() as session:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)

            result = await session.execute(
                delete(Notification).where(
                    Notification.created_at < cutoff,
                    Notification.is_read == True,  # noqa: E712
                )
            )
            await session.commit()
            count = result.rowcount  # type: ignore[assignment]
            logger.info("Cleanup: удалено %d старых уведомлений", count)
            return count


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID,
    type: NotificationType,
    priority: NotificationPriority,
    title: str,
    message: str,
    data: dict | None = None,
    link: str | None = None,
) -> None:
    """Удобная функция для создания уведомления без создания экземпляра сервиса."""
    service = NotificationService(db)
    await service.create(
        user_id=user_id,
        type=type,
        priority=priority,
        title=title,
        message=message,
        data=data,
        link=link,
    )
