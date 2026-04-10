"""Pydantic v2 схемы для Telegram модуля."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TelegramLinkResponse(BaseModel):
    """Статус привязки Telegram."""

    model_config = ConfigDict(from_attributes=True)

    is_linked: bool
    telegram_username: str | None = None
    linked_at: datetime | None = None
    telegram_enabled: bool = False


class TelegramLinkCreate(BaseModel):
    """Ответ на создание deep link."""

    deep_link_url: str
    token: str
    expires_in_seconds: int = 900


class TelegramWebAppAuthRequest(BaseModel):
    """Запрос аутентификации через WebApp."""

    init_data: str


class TelegramWebAppAuthResponse(BaseModel):
    """JWT токены после WebApp аутентификации."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TelegramSettingsResponse(BaseModel):
    """Настройки Telegram-уведомлений."""

    model_config = ConfigDict(from_attributes=True)

    telegram_enabled: bool
    positions_telegram: bool
    bots_telegram: bool
    orders_telegram: bool
    backtest_telegram: bool
    system_telegram: bool
    finance_telegram: bool
    security_telegram: bool


class TelegramSettingsUpdate(BaseModel):
    """Обновление настроек Telegram-уведомлений."""

    telegram_enabled: bool | None = None
    positions_telegram: bool | None = None
    bots_telegram: bool | None = None
    orders_telegram: bool | None = None
    backtest_telegram: bool | None = None
    system_telegram: bool | None = None
    finance_telegram: bool | None = None
    security_telegram: bool | None = None


class AdminNotifyRequest(BaseModel):
    """Отправка произвольного уведомления админу."""

    message: str
    parse_mode: str = "HTML"
