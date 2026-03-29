"""Модели аутентификации: User, ExchangeAccount, UserSettings."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    """Роли пользователей."""
    USER = "user"
    ADMIN = "admin"


class ExchangeType(str, enum.Enum):
    """Поддерживаемые биржи. Расширяемо для будущих интеграций."""
    BYBIT = "bybit"


class User(Base):
    """Пользователь платформы."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    username: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.USER
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Связи
    settings: Mapped["UserSettings"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    exchange_accounts: Mapped[list["ExchangeAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    subscription: Mapped["Subscription"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class ExchangeAccount(Base):
    """Привязанный аккаунт биржи с зашифрованными API-ключами."""

    __tablename__ = "exchange_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    exchange: Mapped[ExchangeType] = mapped_column(
        Enum(ExchangeType, name="exchange_type"), default=ExchangeType.BYBIT
    )
    label: Mapped[str] = mapped_column(String(100))
    api_key_encrypted: Mapped[str] = mapped_column(Text)
    api_secret_encrypted: Mapped[str] = mapped_column(Text)
    # ВАЖНО: is_testnet в БД означает "demo mode" (api-demo.bybit.com).
    # True → BybitClient(demo=True), False → live (api.bybit.com).
    # testnet (api-testnet.bybit.com) больше НЕ используется.
    is_testnet: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи
    user: Mapped["User"] = relationship(back_populates="exchange_accounts")


class UserSettings(Base):
    """Персональные настройки пользователя."""

    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    timezone: Mapped[str] = mapped_column(String(50), default="Europe/Moscow")
    notification_channels: Mapped[dict] = mapped_column(
        JSONB, default=lambda: {"email": True, "websocket": True}
    )
    default_symbol: Mapped[str] = mapped_column(String(30), default="RIVERUSDT")
    default_timeframe: Mapped[str] = mapped_column(String(10), default="5")
    ui_preferences: Mapped[dict] = mapped_column(
        JSONB, default=lambda: {"theme": "dark", "chart_style": "candles"}
    )

    # Связи
    user: Mapped["User"] = relationship(back_populates="settings")
