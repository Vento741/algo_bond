"""Pydantic v2 схемы модуля admin."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Стандартный формат пагинации для всех admin endpoints."""

    items: list[T]
    total: int
    limit: int
    offset: int


# === Dashboard Stats ===


class AdminStats(BaseModel):
    """Статистика платформы для admin dashboard."""

    users_count: int
    active_bots: int
    pending_requests: int
    total_trades: int
    total_pnl: Decimal
    active_invites: int


# === Users ===


class AdminUserListItem(BaseModel):
    """Пользователь в списке admin panel."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    role: str
    is_active: bool
    created_at: datetime
    bots_count: int = 0
    subscription_plan: str | None = None


class AdminUserDetail(BaseModel):
    """Детальная информация о пользователе для admin."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    bots_count: int = 0
    exchange_accounts_count: int = 0
    subscription_plan: str | None = None
    subscription_status: str | None = None
    subscription_expires_at: datetime | None = None
    total_pnl: Decimal = Decimal("0")
    total_trades: int = 0


class AdminUserUpdate(BaseModel):
    """Обновление пользователя админом."""

    role: str | None = None
    is_active: bool | None = None


# === Access Requests ===


class AdminAccessRequestItem(BaseModel):
    """Заявка на доступ в списке admin."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram: str
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None
    reject_reason: str | None = None


class AdminRequestReject(BaseModel):
    """Тело запроса для отклонения заявки."""

    reason: str | None = Field(None, max_length=500)


# === Invite Codes ===


class AdminInviteCodeItem(BaseModel):
    """Инвайт-код в списке admin."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    is_active: bool
    created_at: datetime
    expires_at: datetime | None = None
    used_at: datetime | None = None
    created_by_email: str | None = None
    used_by_email: str | None = None


class AdminInviteGenerate(BaseModel):
    """Генерация инвайт-кодов."""

    count: int = Field(ge=1, le=20, default=1)
    expires_in_days: int | None = Field(None, ge=1, le=365)


# === Billing Plans ===


class AdminPlanUpdate(BaseModel):
    """Обновление тарифного плана админом."""

    name: str | None = Field(None, min_length=1, max_length=50)
    price_monthly: Decimal | None = Field(None, ge=0)
    max_bots: int | None = Field(None, ge=0)
    max_strategies: int | None = Field(None, ge=0)
    max_backtests_per_day: int | None = Field(None, ge=0)
    features: dict | None = None


# === System Logs ===


class AdminLogItem(BaseModel):
    """Лог бота в admin panel."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bot_id: uuid.UUID
    level: str
    message: str
    details: dict | None = None
    created_at: datetime
    user_email: str | None = None
