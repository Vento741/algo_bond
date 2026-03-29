"""Pydantic v2 схемы модуля auth."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# === Аутентификация ===

class RegisterRequest(BaseModel):
    """Запрос на регистрацию."""
    email: EmailStr
    username: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Запрос на вход."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Ответ с JWT-токенами."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Запрос на обновление access token."""
    refresh_token: str


# === Пользователь ===

class UserResponse(BaseModel):
    """Ответ с данными пользователя."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    is_active: bool
    is_verified: bool
    role: str
    created_at: datetime


class UserUpdateRequest(BaseModel):
    """Запрос на обновление профиля."""
    username: str | None = Field(None, min_length=2, max_length=100)


# === Exchange Account ===

class ExchangeAccountCreate(BaseModel):
    """Создание аккаунта биржи."""
    exchange: str = "bybit"
    label: str = Field(min_length=1, max_length=100)
    api_key: str = Field(min_length=1)
    api_secret: str = Field(min_length=1)
    is_testnet: bool = True


class ExchangeAccountResponse(BaseModel):
    """Ответ — аккаунт биржи (без секретов)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exchange: str
    label: str
    is_testnet: bool
    is_active: bool
    created_at: datetime


# === Настройки пользователя ===


class NotificationChannels(BaseModel):
    """Каналы уведомлений."""
    email: bool = True
    websocket: bool = True


class UIPreferences(BaseModel):
    """Настройки интерфейса."""
    theme: str = "dark"
    chart_style: str = "candles"


class UserSettingsResponse(BaseModel):
    """Ответ — настройки пользователя."""
    model_config = ConfigDict(from_attributes=True)

    timezone: str
    notification_channels: NotificationChannels
    default_symbol: str
    default_timeframe: str
    ui_preferences: UIPreferences


class UserSettingsUpdate(BaseModel):
    """Обновление настроек."""
    timezone: str | None = None
    notification_channels: NotificationChannels | None = None
    default_symbol: str | None = None
    default_timeframe: str | None = None
    ui_preferences: UIPreferences | None = None
