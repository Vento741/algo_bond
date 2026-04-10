# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete in-app notification system with bell icon, dropdown panel, real-time WebSocket delivery, hybrid Redis+PostgreSQL storage, and user preferences.

**Architecture:** Dedicated backend module `app/modules/notifications/` following existing project patterns. Hybrid storage: PostgreSQL for persistence, Redis pub/sub for real-time delivery via a separate `/ws/notifications` WebSocket channel. Frontend: Zustand store + notification components in Topbar dropdown.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (async), Redis pub/sub, Celery Beat, React 18, Zustand, Radix Popover, Lucide icons, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-10-notification-system-design.md`

---

### Task 1: Backend enums and models

**Files:**
- Create: `backend/app/modules/notifications/__init__.py`
- Create: `backend/app/modules/notifications/enums.py`
- Create: `backend/app/modules/notifications/models.py`
- Modify: `backend/alembic/env.py:20` (add import)

- [ ] **Step 1: Create module directory and __init__.py**

```bash
mkdir -p backend/app/modules/notifications
```

Write `backend/app/modules/notifications/__init__.py`:
```python
"""Модуль уведомлений."""
```

- [ ] **Step 2: Create enums.py**

Write `backend/app/modules/notifications/enums.py`:
```python
"""Перечисления для системы уведомлений."""

import enum


class NotificationType(str, enum.Enum):
    """Тип уведомления."""
    # Позиции
    POSITION_OPENED = "position_opened"
    POSITION_CLOSED = "position_closed"
    TP_HIT = "tp_hit"
    SL_HIT = "sl_hit"
    # Боты
    BOT_STARTED = "bot_started"
    BOT_STOPPED = "bot_stopped"
    BOT_ERROR = "bot_error"
    BOT_EMERGENCY = "bot_emergency"
    # Ордера
    ORDER_FILLED = "order_filled"
    ORDER_CANCELLED = "order_cancelled"
    ORDER_ERROR = "order_error"
    # Бэктесты
    BACKTEST_COMPLETED = "backtest_completed"
    BACKTEST_FAILED = "backtest_failed"
    # Системные
    CONNECTION_LOST = "connection_lost"
    CONNECTION_RESTORED = "connection_restored"
    SYSTEM_ERROR = "system_error"
    # Биллинг
    SUBSCRIPTION_EXPIRING = "subscription_expiring"
    PAYMENT_SUCCESS = "payment_success"
    PAYMENT_FAILED = "payment_failed"


class NotificationPriority(str, enum.Enum):
    """Приоритет уведомления."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# Категории для фильтрации и настроек
NOTIFICATION_CATEGORIES: dict[str, list[NotificationType]] = {
    "positions": [
        NotificationType.POSITION_OPENED,
        NotificationType.POSITION_CLOSED,
        NotificationType.TP_HIT,
        NotificationType.SL_HIT,
    ],
    "bots": [
        NotificationType.BOT_STARTED,
        NotificationType.BOT_STOPPED,
        NotificationType.BOT_ERROR,
        NotificationType.BOT_EMERGENCY,
    ],
    "orders": [
        NotificationType.ORDER_FILLED,
        NotificationType.ORDER_CANCELLED,
        NotificationType.ORDER_ERROR,
    ],
    "backtest": [
        NotificationType.BACKTEST_COMPLETED,
        NotificationType.BACKTEST_FAILED,
    ],
    "system": [
        NotificationType.CONNECTION_LOST,
        NotificationType.CONNECTION_RESTORED,
        NotificationType.SYSTEM_ERROR,
    ],
    "billing": [
        NotificationType.SUBSCRIPTION_EXPIRING,
        NotificationType.PAYMENT_SUCCESS,
        NotificationType.PAYMENT_FAILED,
    ],
}


def get_category(ntype: NotificationType) -> str:
    """Получить категорию для типа уведомления."""
    for category, types in NOTIFICATION_CATEGORIES.items():
        if ntype in types:
            return category
    return "system"
```

- [ ] **Step 3: Create models.py**

Write `backend/app/modules/notifications/models.py`:
```python
"""Модели уведомлений: Notification, NotificationPreference."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.modules.notifications.enums import NotificationPriority, NotificationType


class Notification(Base):
    """Уведомление пользователя."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notificationtype"), nullable=False
    )
    priority: Mapped[NotificationPriority] = mapped_column(
        Enum(NotificationPriority, name="notificationpriority"),
        nullable=False,
        default=NotificationPriority.MEDIUM,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index("ix_notifications_user_unread", "user_id", "is_read"),
    )


class NotificationPreference(Base):
    """Настройки уведомлений пользователя по категориям."""

    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    positions_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    bots_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    orders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    backtest_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    system_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    billing_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

- [ ] **Step 4: Add model import to alembic env.py**

In `backend/alembic/env.py`, after line 20 (`from app.modules.analytics.models import ...`), add:
```python
from app.modules.notifications.models import Notification, NotificationPreference  # noqa: F401
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/notifications/ backend/alembic/env.py
git commit -m "feat(notifications): add enums and SQLAlchemy models"
```

---

### Task 2: Pydantic schemas

**Files:**
- Create: `backend/app/modules/notifications/schemas.py`

- [ ] **Step 1: Create schemas.py**

Write `backend/app/modules/notifications/schemas.py`:
```python
"""Pydantic v2 схемы для уведомлений."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.modules.notifications.enums import NotificationPriority, NotificationType


class NotificationResponse(BaseModel):
    """Ответ - одно уведомление."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: NotificationType
    priority: NotificationPriority
    title: str
    message: str
    data: dict | None = None
    link: str | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Список уведомлений с пагинацией."""
    items: list[NotificationResponse]
    total: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    """Счетчик непрочитанных."""
    count: int


class NotificationPreferencesResponse(BaseModel):
    """Настройки уведомлений пользователя."""
    model_config = ConfigDict(from_attributes=True)

    positions_enabled: bool = True
    bots_enabled: bool = True
    orders_enabled: bool = True
    backtest_enabled: bool = True
    system_enabled: bool = True
    billing_enabled: bool = True


class NotificationPreferencesUpdate(BaseModel):
    """Обновление настроек уведомлений."""
    positions_enabled: bool | None = None
    bots_enabled: bool | None = None
    orders_enabled: bool | None = None
    backtest_enabled: bool | None = None
    system_enabled: bool | None = None
    billing_enabled: bool | None = None


class NotificationCreate(BaseModel):
    """Внутренняя схема для создания уведомления (не для API)."""
    user_id: UUID
    type: NotificationType
    priority: NotificationPriority
    title: str
    message: str
    data: dict | None = None
    link: str | None = None
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/modules/notifications/schemas.py
git commit -m "feat(notifications): add Pydantic v2 schemas"
```

---

### Task 3: NotificationService

**Files:**
- Create: `backend/app/modules/notifications/service.py`

- [ ] **Step 1: Create service.py**

Write `backend/app/modules/notifications/service.py`:
```python
"""Сервис уведомлений: CRUD + Redis publish."""

import json
import logging
import uuid
from datetime import datetime, timezone

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
            cutoff = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            from datetime import timedelta
            cutoff = cutoff - timedelta(days=days)

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
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/modules/notifications/service.py
git commit -m "feat(notifications): add NotificationService with CRUD and Redis publish"
```

---

### Task 4: REST API router

**Files:**
- Create: `backend/app/modules/notifications/router.py`
- Modify: `backend/app/main.py:22` (add router import and include)

- [ ] **Step 1: Create router.py**

Write `backend/app/modules/notifications/router.py`:
```python
"""REST API endpoints для уведомлений."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.modules.notifications.schemas import (
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    UnreadCountResponse,
)
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[dict, Depends(get_current_user)],
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    category: str | None = Query(None, description="Фильтр по категории: positions, bots, orders, backtest, system, billing"),
) -> NotificationListResponse:
    """Получить список уведомлений."""
    service = NotificationService(db)
    items, total, unread = await service.get_user_notifications(
        user_id=uuid.UUID(user["sub"]),
        limit=limit,
        offset=offset,
        type_filter=category,
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        unread_count=unread,
    )


@router.get("/unread/count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[dict, Depends(get_current_user)],
) -> UnreadCountResponse:
    """Количество непрочитанных уведомлений."""
    service = NotificationService(db)
    count = await service.get_unread_count(uuid.UUID(user["sub"]))
    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Отметить уведомление прочитанным."""
    service = NotificationService(db)
    ok = await service.mark_read(uuid.UUID(user["sub"]), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "ok"}


@router.patch("/read-all")
async def mark_all_read(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Прочитать все уведомления."""
    service = NotificationService(db)
    count = await service.mark_all_read(uuid.UUID(user["sub"]))
    return {"status": "ok", "marked": count}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Удалить уведомление."""
    service = NotificationService(db)
    ok = await service.delete_notification(uuid.UUID(user["sub"]), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "ok"}


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_preferences(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[dict, Depends(get_current_user)],
) -> NotificationPreferencesResponse:
    """Получить настройки уведомлений."""
    service = NotificationService(db)
    prefs = await service.get_preferences(uuid.UUID(user["sub"]))
    if prefs is None:
        return NotificationPreferencesResponse()
    return NotificationPreferencesResponse.model_validate(prefs)


@router.put("/preferences", response_model=NotificationPreferencesResponse)
async def update_preferences(
    body: NotificationPreferencesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[dict, Depends(get_current_user)],
) -> NotificationPreferencesResponse:
    """Обновить настройки уведомлений."""
    service = NotificationService(db)
    updates = body.model_dump(exclude_none=True)
    prefs = await service.update_preferences(uuid.UUID(user["sub"]), updates)
    return NotificationPreferencesResponse.model_validate(prefs)
```

- [ ] **Step 2: Register router in main.py**

In `backend/app/main.py`, add import after line 22 (after analytics imports):
```python
from app.modules.notifications.router import router as notifications_router
```

Add include after line 87 (after `analytics_admin_router`):
```python
app.include_router(notifications_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/notifications/router.py backend/app/main.py
git commit -m "feat(notifications): add REST API endpoints"
```

---

### Task 5: WebSocket router and bridge

**Files:**
- Create: `backend/app/modules/notifications/ws_router.py`
- Modify: `backend/app/modules/trading/ws_bridge.py:41` (add notifications subscription)
- Modify: `backend/app/main.py` (add ws_router)

- [ ] **Step 1: Create ws_router.py**

Write `backend/app/modules/notifications/ws_router.py`:
```python
"""WebSocket endpoint для real-time уведомлений."""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.core.security import decode_token
from app.modules.market.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/notifications")
async def notifications_stream(
    websocket: WebSocket,
    token: str = Query(""),
) -> None:
    """Приватный WebSocket стрим уведомлений.

    Требует JWT токен в query: /ws/notifications?token=xxx

    Отправляет:
    - {"type": "new_notification", "data": {...}}
    """
    # Проверить JWT
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except (JWTError, Exception):
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"notifications:{user_id}"
    await manager.connect(websocket, channel)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)
    except Exception:
        manager.disconnect(websocket, channel)
```

- [ ] **Step 2: Add notifications pattern to ws_bridge.py**

In `backend/app/modules/trading/ws_bridge.py`, modify the `psubscribe` call at line 41. Replace:
```python
            await pubsub.psubscribe("trading:*")
            logger.info("Redis pub/sub подписка активирована: trading:*")
```
With:
```python
            await pubsub.psubscribe("trading:*", "notifications:*")
            logger.info("Redis pub/sub подписка активирована: trading:*, notifications:*")
```

- [ ] **Step 3: Register ws_router in main.py**

In `backend/app/main.py`, add import:
```python
from app.modules.notifications.ws_router import router as notifications_ws_router
```

Add include after `notifications_router`:
```python
app.include_router(notifications_ws_router)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/notifications/ws_router.py backend/app/modules/trading/ws_bridge.py backend/app/main.py
git commit -m "feat(notifications): add WebSocket endpoint and bridge subscription"
```

---

### Task 6: Celery cleanup task

**Files:**
- Create: `backend/app/modules/notifications/celery_tasks.py`
- Modify: `backend/app/celery_app.py:24-41` (add beat schedule)

- [ ] **Step 1: Create celery_tasks.py**

Write `backend/app/modules/notifications/celery_tasks.py`:
```python
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
```

- [ ] **Step 2: Add beat schedule entry**

In `backend/app/celery_app.py`, add to `beat_schedule` dict (after "beat-heartbeat" entry):
```python
    "cleanup-old-notifications": {
        "task": "notifications.cleanup_old",
        "schedule": 86400.0,  # каждые 24 часа
    },
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/notifications/celery_tasks.py backend/app/celery_app.py
git commit -m "feat(notifications): add Celery cleanup task with 24h schedule"
```

---

### Task 7: Alembic migration

**Files:**
- Create: new migration file (autogenerated)

- [ ] **Step 1: Generate migration**

Run on VPS (Docker):
```bash
docker compose exec api alembic revision --autogenerate -m "add_notifications_tables"
```

- [ ] **Step 2: Apply migration**

```bash
docker compose exec api alembic upgrade head
```

- [ ] **Step 3: Verify tables created**

```bash
docker compose exec db psql -U algobond -d algobond -c "\dt notifications*"
```

Expected: tables `notifications` and `notification_preferences`.

- [ ] **Step 4: Commit migration**

```bash
git add backend/alembic/versions/
git commit -m "feat(notifications): add database migration"
```

---

### Task 8: Frontend TypeScript types

**Files:**
- Modify: `frontend/src/types/api.ts` (add notification types)

- [ ] **Step 1: Add notification types to api.ts**

Append to `frontend/src/types/api.ts`:
```typescript
/* ---- Notifications ---- */

export type NotificationType =
  | 'position_opened' | 'position_closed' | 'tp_hit' | 'sl_hit'
  | 'bot_started' | 'bot_stopped' | 'bot_error' | 'bot_emergency'
  | 'order_filled' | 'order_cancelled' | 'order_error'
  | 'backtest_completed' | 'backtest_failed'
  | 'connection_lost' | 'connection_restored' | 'system_error'
  | 'subscription_expiring' | 'payment_success' | 'payment_failed';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export type NotificationCategory = 'positions' | 'bots' | 'orders' | 'backtest' | 'system' | 'billing';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
}

export interface NotificationPreferences {
  positions_enabled: boolean;
  bots_enabled: boolean;
  orders_enabled: boolean;
  backtest_enabled: boolean;
  system_enabled: boolean;
  billing_enabled: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/api.ts
git commit -m "feat(notifications): add TypeScript types"
```

---

### Task 9: Zustand notification store

**Files:**
- Create: `frontend/src/stores/notifications.ts`

- [ ] **Step 1: Create notifications store**

Write `frontend/src/stores/notifications.ts`:
```typescript
import { create } from 'zustand';
import api from '@/lib/api';
import type { NotificationItem, NotificationCategory } from '@/types/api';

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  filter: NotificationCategory | 'all';

  addNotification: (n: NotificationItem) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  setFilter: (f: NotificationCategory | 'all') => void;
  setOpen: (v: boolean) => void;
  fetchNotifications: (category?: string) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  filter: 'all',

  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + 1,
    })),

  markRead: (id) => {
    api.patch(`/notifications/${id}/read`).catch(() => {});
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n,
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: () => {
    api.patch('/notifications/read-all').catch(() => {});
    set((s) => ({
      notifications: s.notifications.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at || new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
  },

  deleteNotification: (id) => {
    const n = get().notifications.find((x) => x.id === id);
    api.delete(`/notifications/${id}`).catch(() => {});
    set((s) => ({
      notifications: s.notifications.filter((x) => x.id !== id),
      unreadCount: n && !n.is_read ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
    }));
  },

  setFilter: (f) => {
    set({ filter: f });
    get().fetchNotifications(f === 'all' ? undefined : f);
  },

  setOpen: (v) => set({ isOpen: v }),

  fetchNotifications: async (category) => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (category) params.set('category', category);
      const { data } = await api.get(`/notifications?${params}`);
      set({
        notifications: data.items,
        unreadCount: data.unread_count,
      });
    } catch {
      // Не критично при первой загрузке
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread/count');
      set({ unreadCount: data.count });
    } catch {
      // Не критично
    }
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/notifications.ts
git commit -m "feat(notifications): add Zustand store"
```

---

### Task 10: WebSocket hook

**Files:**
- Create: `frontend/src/hooks/useNotificationStream.ts`
- Modify: `frontend/src/components/layout/DashboardLayout.tsx:4,9` (add hook call)

- [ ] **Step 1: Create useNotificationStream.ts**

Write `frontend/src/hooks/useNotificationStream.ts`:
```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useNotificationStore } from '@/stores/notifications';
import { useToast } from '@/components/ui/toast';
import type { NotificationItem } from '@/types/api';

interface NotificationMessage {
  type: 'new_notification';
  data: NotificationItem;
}

function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

/**
 * Хук для подключения к WebSocket стриму уведомлений.
 * ws://host/ws/notifications?token=JWT
 */
export function useNotificationStream(): void {
  const { addNotification, fetchNotifications, fetchUnreadCount } = useNotificationStore();
  const { toast } = useToast();

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws/notifications?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      attemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const msg: NotificationMessage = JSON.parse(event.data);
        if (msg.type === 'new_notification') {
          addNotification(msg.data);
          // Toast для high/critical
          if (msg.data.priority === 'critical' || msg.data.priority === 'high') {
            toastRef.current(
              msg.data.title,
              msg.data.priority === 'critical' ? 'error' : 'default',
            );
          }
        }
      } catch {
        // Некорректное сообщение
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      wsRef.current = null;
      const delay = getReconnectDelay(attemptRef.current);
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [addNotification]);

  useEffect(() => {
    unmountedRef.current = false;
    // Загрузить начальные данные
    fetchNotifications();
    fetchUnreadCount();
    // Подключиться к WS
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, fetchNotifications, fetchUnreadCount]);
}
```

- [ ] **Step 2: Add hook to DashboardLayout**

In `frontend/src/components/layout/DashboardLayout.tsx`, add import:
```typescript
import { useNotificationStream } from '@/hooks/useNotificationStream';
```

Add hook call after `useTradingStream()`:
```typescript
  useNotificationStream();
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useNotificationStream.ts frontend/src/components/layout/DashboardLayout.tsx
git commit -m "feat(notifications): add WebSocket hook and connect in DashboardLayout"
```

---

### Task 11: NotificationItem component

**Files:**
- Create: `frontend/src/components/notifications/NotificationItem.tsx`

- [ ] **Step 1: Create NotificationItem.tsx**

Write `frontend/src/components/notifications/NotificationItem.tsx`:
```tsx
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useNotificationStore } from '@/stores/notifications';
import type { NotificationItem as NotificationItemType } from '@/types/api';
import { cn } from '@/lib/utils';

/** Иконки по типу уведомления */
const TYPE_ICONS: Record<string, string> = {
  position_opened: '📈',
  position_closed: '📈',
  tp_hit: '🎯',
  sl_hit: '🛑',
  bot_started: '🤖',
  bot_stopped: '🤖',
  bot_error: '⚠️',
  bot_emergency: '🚨',
  order_filled: '📋',
  order_cancelled: '📋',
  order_error: '📋',
  backtest_completed: '📊',
  backtest_failed: '📊',
  connection_lost: '🔌',
  connection_restored: '🔌',
  system_error: '⚙️',
  subscription_expiring: '💳',
  payment_success: '💳',
  payment_failed: '💳',
};

/** Цвет фона иконки по приоритету */
const PRIORITY_BG: Record<string, string> = {
  low: 'bg-white/5',
  medium: 'bg-brand-accent/15',
  high: 'bg-brand-premium/15',
  critical: 'bg-brand-loss/15',
};

/** Relative time: "2 мин назад", "1 час назад" */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} д назад`;
}

interface Props {
  notification: NotificationItemType;
}

export function NotificationItem({ notification }: Props) {
  const navigate = useNavigate();
  const { markRead, deleteNotification } = useNotificationStore();

  const handleClick = () => {
    if (!notification.is_read) {
      markRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      useNotificationStore.getState().setOpen(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNotification(notification.id);
  };

  const icon = TYPE_ICONS[notification.type] || '🔔';
  const bgClass = PRIORITY_BG[notification.priority] || 'bg-white/5';

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group',
        notification.is_read
          ? 'opacity-50 hover:opacity-70'
          : 'bg-brand-accent/[0.04] border-l-[3px] border-brand-accent hover:bg-brand-accent/[0.08]',
        !notification.is_read && 'border-l-[3px]',
        notification.is_read && 'border-l-[3px] border-transparent',
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-sm',
          bgClass,
        )}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white truncate">
          {notification.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-[11px] text-gray-600 mt-1">
          {timeAgo(notification.created_at)}
        </p>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className="text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity self-start mt-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/notifications/NotificationItem.tsx
git commit -m "feat(notifications): add NotificationItem component"
```

---

### Task 12: NotificationDropdown and NotificationBell

**Files:**
- Create: `frontend/src/components/notifications/NotificationBell.tsx`
- Create: `frontend/src/components/notifications/NotificationDropdown.tsx`
- Modify: `frontend/src/components/layout/Topbar.tsx:99-106` (replace bell placeholder)

- [ ] **Step 1: Create NotificationDropdown.tsx**

Write `frontend/src/components/notifications/NotificationDropdown.tsx`:
```tsx
import { useNotificationStore } from '@/stores/notifications';
import { NotificationItem } from './NotificationItem';
import type { NotificationCategory } from '@/types/api';

const FILTER_OPTIONS: { value: NotificationCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'positions', label: 'Позиции' },
  { value: 'bots', label: 'Боты' },
  { value: 'orders', label: 'Ордера' },
  { value: 'backtest', label: 'Бэктесты' },
  { value: 'system', label: 'Система' },
  { value: 'billing', label: 'Биллинг' },
];

export function NotificationDropdown() {
  const { notifications, unreadCount, filter, setFilter, markAllRead, setOpen } =
    useNotificationStore();

  return (
    <div className="w-[380px] max-h-[480px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-semibold text-white">Уведомления</span>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-brand-accent hover:text-brand-accent/80 transition-colors"
          >
            Прочитать все
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto scrollbar-none">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`
              px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors
              ${filter === opt.value
                ? 'bg-brand-accent text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <span className="text-2xl mb-2">🔔</span>
            <p className="text-xs">Нет уведомлений</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 px-4 py-2.5 text-center">
        <button
          onClick={() => {
            setOpen(false);
            window.location.hash = '#notification-settings';
            window.location.pathname = '/settings';
          }}
          className="text-xs text-brand-accent hover:text-brand-accent/80 transition-colors"
        >
          ⚙ Настройки уведомлений
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create NotificationBell.tsx**

Write `frontend/src/components/notifications/NotificationBell.tsx`:
```tsx
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotificationStore } from '@/stores/notifications';
import { NotificationDropdown } from './NotificationDropdown';

export function NotificationBell() {
  const { unreadCount, isOpen, setOpen } = useNotificationStore();

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-gray-400 hover:text-white h-8 w-8"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand-loss text-white text-[10px] font-bold font-mono leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-auto p-0 border-white/10 bg-brand-card"
      >
        <NotificationDropdown />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Replace bell placeholder in Topbar**

In `frontend/src/components/layout/Topbar.tsx`, add import:
```typescript
import { NotificationBell } from '@/components/notifications/NotificationBell';
```

Replace lines 99-106 (the bell Button placeholder):
```tsx
          {/* Notification bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-400 hover:text-white h-8 w-8"
          >
            <Bell className="h-4 w-4" />
          </Button>
```
With:
```tsx
          {/* Notification bell */}
          <NotificationBell />
```

Remove `Bell` from the lucide-react import (line 2) since it's no longer used directly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/notifications/ frontend/src/components/layout/Topbar.tsx
git commit -m "feat(notifications): add NotificationBell and NotificationDropdown components"
```

---

### Task 13: Notification preferences in Settings page

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Add notification preferences section to Settings**

In `frontend/src/pages/Settings.tsx`:

Add to imports (line 8):
```typescript
import { Bell as BellIcon } from 'lucide-react';
```

Add state variables after the existing settings state (around line 94):
```typescript
  /* Настройки уведомлений */
  const [notifPrefs, setNotifPrefs] = useState({
    positions_enabled: true,
    bots_enabled: true,
    orders_enabled: true,
    backtest_enabled: true,
    system_enabled: true,
    billing_enabled: true,
  });
  const [loadingNotifPrefs, setLoadingNotifPrefs] = useState(true);
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false);
  const [notifPrefsOriginal, setNotifPrefsOriginal] = useState(notifPrefs);
```

Add load function after `loadSettings`:
```typescript
  const loadNotifPrefs = useCallback(() => {
    setLoadingNotifPrefs(true);
    api
      .get('/notifications/preferences')
      .then(({ data }) => {
        setNotifPrefs(data);
        setNotifPrefsOriginal(data);
      })
      .catch(() => {})
      .finally(() => setLoadingNotifPrefs(false));
  }, []);
```

Add `loadNotifPrefs` to the useEffect that calls `loadAccounts` and `loadSettings`:
```typescript
  useEffect(() => {
    loadAccounts();
    loadSettings();
    loadNotifPrefs();
  }, [loadAccounts, loadSettings, loadNotifPrefs]);
```

Add save handler:
```typescript
  function handleSaveNotifPrefs() {
    setSavingNotifPrefs(true);
    api
      .put('/notifications/preferences', notifPrefs)
      .then(({ data }) => {
        setNotifPrefs(data);
        setNotifPrefsOriginal(data);
        toast('Настройки уведомлений сохранены', 'success');
      })
      .catch(() => {
        toast('Ошибка сохранения настроек', 'error');
      })
      .finally(() => setSavingNotifPrefs(false));
  }

  const notifPrefsChanged = JSON.stringify(notifPrefs) !== JSON.stringify(notifPrefsOriginal);
```

Add notification preferences Card after the Preferences card (after `</Card>` around line 357), inside the left column:
```tsx
          {/* ---- Уведомления ---- */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <BellIcon className="h-4 w-4 text-brand-accent" />
                Уведомления
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingNotifPrefs ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {[
                    { key: 'positions_enabled', label: '📈 Позиции', desc: 'Открытие, закрытие, TP/SL' },
                    { key: 'bots_enabled', label: '🤖 Боты', desc: 'Старт, стоп, ошибки' },
                    { key: 'orders_enabled', label: '📋 Ордера', desc: 'Исполнение, отмена, ошибки' },
                    { key: 'backtest_enabled', label: '📊 Бэктесты', desc: 'Завершение, ошибки' },
                    { key: 'system_enabled', label: '⚙️ Системные', desc: 'Соединение, ошибки сервисов' },
                    { key: 'billing_enabled', label: '💳 Биллинг', desc: 'Подписки, платежи' },
                  ].map(({ key, label, desc }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <div>
                        <p className="text-sm text-white">{label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifPrefs[key as keyof typeof notifPrefs]}
                        onClick={() =>
                          setNotifPrefs((p) => ({
                            ...p,
                            [key]: !p[key as keyof typeof p],
                          }))
                        }
                        className={`
                          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                          ${notifPrefs[key as keyof typeof notifPrefs] ? 'bg-brand-accent' : 'bg-gray-600'}
                        `}
                      >
                        <span
                          className={`
                            inline-block h-4 w-4 rounded-full bg-white transition-transform
                            ${notifPrefs[key as keyof typeof notifPrefs] ? 'translate-x-6' : 'translate-x-1'}
                          `}
                        />
                      </button>
                    </div>
                  ))}

                  <div className="p-2.5 rounded-lg bg-brand-loss/5 border border-brand-loss/10">
                    <p className="text-[11px] text-brand-loss/70">
                      ⚠ Critical уведомления (аварийное закрытие, системные ошибки) приходят всегда
                    </p>
                  </div>

                  <Separator className="bg-white/5" />

                  <Button
                    onClick={handleSaveNotifPrefs}
                    disabled={!notifPrefsChanged || savingNotifPrefs}
                    className="w-full bg-brand-premium text-brand-bg hover:bg-brand-premium/90 disabled:opacity-40"
                  >
                    {savingNotifPrefs ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Сохранить настройки
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat(notifications): add notification preferences to Settings page"
```

---

### Task 14: Integration - inject notifications into backend event sources

**Files:**
- Modify: `backend/app/modules/trading/router.py` (bot start/stop)
- Modify: `backend/app/modules/backtest/celery_tasks.py` (backtest complete/fail)

- [ ] **Step 1: Add notification helper function**

Create a thin helper to avoid repeating boilerplate in each integration point. Add to the end of `backend/app/modules/notifications/service.py`:
```python
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
```

- [ ] **Step 2: Integrate into trading/router.py - bot start/stop**

In `backend/app/modules/trading/router.py`, at the bot start endpoint (after the bot is successfully started), add:
```python
    # Уведомление о запуске бота
    from app.modules.notifications.service import notify
    from app.modules.notifications.enums import NotificationType, NotificationPriority
    await notify(
        db, bot.user_id,
        NotificationType.BOT_STARTED, NotificationPriority.LOW,
        title=f"Бот запущен",
        message=f"{bot.strategy_config.symbol} - {bot.strategy_config.name}",
        data={"bot_id": str(bot.id)},
        link=f"/bots/{bot.id}",
    )
```

Similarly for bot stop endpoint:
```python
    from app.modules.notifications.service import notify
    from app.modules.notifications.enums import NotificationType, NotificationPriority
    await notify(
        db, bot.user_id,
        NotificationType.BOT_STOPPED, NotificationPriority.LOW,
        title=f"Бот остановлен",
        message=f"{bot.strategy_config.symbol} - {bot.strategy_config.name}",
        data={"bot_id": str(bot.id)},
        link=f"/bots/{bot.id}",
    )
```

- [ ] **Step 3: Integrate into backtest/celery_tasks.py**

In `backend/app/modules/backtest/celery_tasks.py`, after line 181 (after `update_run_status(run_id, BacktestStatus.COMPLETED, progress=100)`):
```python
            # Уведомление о завершении бэктеста
            from app.modules.notifications.service import notify
            from app.modules.notifications.enums import NotificationType, NotificationPriority
            await notify(
                session, run.user_id,
                NotificationType.BACKTEST_COMPLETED, NotificationPriority.LOW,
                title="Бэктест завершен",
                message=f"{run.symbol} {run.timeframe}: {metrics.total_trades} сделок, PnL {metrics.total_pnl_pct:+.1f}%",
                data={"run_id": str(run_id)},
                link="/backtest",
            )
```

After the except block (line 195-198), inside the except before return:
```python
            # Уведомление об ошибке бэктеста
            from app.modules.notifications.service import notify
            from app.modules.notifications.enums import NotificationType, NotificationPriority
            await notify(
                session, run.user_id,
                NotificationType.BACKTEST_FAILED, NotificationPriority.HIGH,
                title="Бэктест провален",
                message=f"{run.symbol}: {str(e)[:100]}",
                data={"run_id": str(run_id)},
                link="/backtest",
            )
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/notifications/service.py backend/app/modules/trading/router.py backend/app/modules/backtest/celery_tasks.py
git commit -m "feat(notifications): integrate into bot start/stop and backtest events"
```

---

### Task 15: Integration - bot_worker notifications (positions, errors)

**Files:**
- Modify: `backend/app/modules/trading/bot_worker.py` (position open/close, TP/SL, errors, emergency)

- [ ] **Step 1: Add notification calls to bot_worker**

This task requires careful injection at specific points in `bot_worker.py`. The bot_worker uses `create_standalone_session()` and runs in Celery. Notification calls need the session from the current context.

At position open (after order placed successfully and position created):
```python
# Уведомление: позиция открыта
from app.modules.notifications.service import notify
from app.modules.notifications.enums import NotificationType, NotificationPriority
await notify(
    session, bot.user_id,
    NotificationType.POSITION_OPENED, NotificationPriority.MEDIUM,
    title=f"{symbol}: позиция {direction.value.upper()} открыта",
    message=f"Цена входа: {entry_price}, Размер: {quantity}",
    data={"bot_id": str(bot.id), "symbol": symbol, "direction": direction.value},
    link=f"/bots/{bot.id}",
)
```

At position close (when position is detected closed - SL/TP/trailing/reverse):
```python
# Определить тип закрытия
if exit_reason == "tp" or exit_reason == "tp1" or exit_reason == "tp2":
    n_type = NotificationType.TP_HIT
    n_priority = NotificationPriority.MEDIUM
elif exit_reason == "sl":
    n_type = NotificationType.SL_HIT
    n_priority = NotificationPriority.HIGH
else:
    n_type = NotificationType.POSITION_CLOSED
    n_priority = NotificationPriority.MEDIUM

pnl_str = f"+${realized_pnl:.2f}" if realized_pnl >= 0 else f"-${abs(realized_pnl):.2f}"
await notify(
    session, bot.user_id,
    n_type, n_priority,
    title=f"{symbol}: позиция закрыта",
    message=f"P&L: {pnl_str}",
    data={"bot_id": str(bot.id), "symbol": symbol, "pnl": float(realized_pnl)},
    link=f"/bots/{bot.id}",
)
```

At emergency close:
```python
await notify(
    session, bot.user_id,
    NotificationType.BOT_EMERGENCY, NotificationPriority.CRITICAL,
    title=f"{symbol}: аварийное закрытие",
    message="SL не установлен, позиция закрыта принудительно",
    data={"bot_id": str(bot.id), "symbol": symbol},
    link=f"/bots/{bot.id}",
)
```

At bot error (when status changes to ERROR):
```python
await notify(
    session, bot.user_id,
    NotificationType.BOT_ERROR, NotificationPriority.HIGH,
    title=f"Ошибка бота",
    message=f"{symbol}: {error_message[:100]}",
    data={"bot_id": str(bot.id), "symbol": symbol},
    link=f"/bots/{bot.id}",
)
```

Note: The exact lines depend on bot_worker.py structure. The implementing agent should find the right injection points by looking at where BotLog entries with ERROR/WARN levels are created, where positions are opened/closed, and where emergency closes happen.

- [ ] **Step 2: Commit**

```bash
git add backend/app/modules/trading/bot_worker.py
git commit -m "feat(notifications): integrate into bot_worker - positions, errors, emergency"
```

---

### Task 16: Verify and test end-to-end

**Files:** No new files - verification only.

- [ ] **Step 1: Verify backend starts without errors**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 2: Run existing tests to check no regressions**

```bash
cd backend && pytest tests/ -v --timeout=30
```

Expected: All existing tests pass.

- [ ] **Step 3: Test API endpoints manually (on VPS after deploy)**

```bash
# Get notifications
curl -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/notifications

# Get unread count
curl -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/notifications/unread/count

# Get preferences
curl -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/notifications/preferences
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Final commit with all changes**

```bash
git add -A
git commit -m "feat(notifications): complete notification system implementation"
```

---

### Task 17: Deploy to VPS

- [ ] **Step 1: Push to remote**

```bash
git push origin main
```

- [ ] **Step 2: Deploy**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api"
```

- [ ] **Step 3: Run migration on VPS**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec api alembic upgrade head"
```

- [ ] **Step 4: Health check**

```bash
ssh jeremy-vps "curl -sf http://localhost:8100/health"
```

Expected: `{"status":"ok","app":"AlgoBond","version":"0.9.0"}`
