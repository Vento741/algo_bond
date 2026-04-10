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
    finance_enabled: bool = True
    security_enabled: bool = True
    telegram_enabled: bool = False
    positions_telegram: bool = False
    bots_telegram: bool = False
    orders_telegram: bool = False
    backtest_telegram: bool = False
    system_telegram: bool = False
    finance_telegram: bool = False
    security_telegram: bool = False


class NotificationPreferencesUpdate(BaseModel):
    """Обновление настроек уведомлений."""
    positions_enabled: bool | None = None
    bots_enabled: bool | None = None
    orders_enabled: bool | None = None
    backtest_enabled: bool | None = None
    system_enabled: bool | None = None
    billing_enabled: bool | None = None
    finance_enabled: bool | None = None
    security_enabled: bool | None = None
    telegram_enabled: bool | None = None
    positions_telegram: bool | None = None
    bots_telegram: bool | None = None
    orders_telegram: bool | None = None
    backtest_telegram: bool | None = None
    system_telegram: bool | None = None
    finance_telegram: bool | None = None
    security_telegram: bool | None = None


class NotificationCreate(BaseModel):
    """Внутренняя схема для создания уведомления (не для API)."""
    user_id: UUID
    type: NotificationType
    priority: NotificationPriority
    title: str
    message: str
    data: dict | None = None
    link: str | None = None
