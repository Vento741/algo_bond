"""Pydantic v2 схемы модуля billing."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PlanResponse(BaseModel):
    """Ответ — тарифный план."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    price_monthly: Decimal
    max_bots: int
    max_strategies: int
    max_backtests_per_day: int
    features: dict


class PlanCreate(BaseModel):
    """Создание тарифного плана (admin only)."""
    name: str = Field(min_length=1, max_length=50)
    slug: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    price_monthly: Decimal = Field(ge=0)
    max_bots: int = Field(ge=0, default=1)
    max_strategies: int = Field(ge=0, default=1)
    max_backtests_per_day: int = Field(ge=0, default=5)
    features: dict = Field(default_factory=dict)


class SubscriptionResponse(BaseModel):
    """Ответ — подписка пользователя."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    plan_id: uuid.UUID
    status: str
    started_at: datetime
    expires_at: datetime | None
    plan: PlanResponse
