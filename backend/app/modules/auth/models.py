"""Модели аутентификации: User, ExchangeAccount, UserSettings, InviteCode, AccessRequest."""

import enum
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Безопасные символы для инвайт-кодов (без ambiguous: 0/O, 1/I/L)
SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'


def generate_invite_code() -> str:
    """Генерация 8-символьного инвайт-кода без ambiguous символов."""
    return ''.join(secrets.choice(SAFE_CHARS) for _ in range(8))


class UserRole(str, enum.Enum):
    """Роли пользователей."""
    USER = "user"
    ADMIN = "admin"


class ExchangeType(str, enum.Enum):
    """Поддерживаемые биржи. Расширяемо для будущих интеграций."""
    BYBIT = "bybit"


class AccessRequestStatus(str, enum.Enum):
    """Статусы заявки на доступ."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


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
    consent_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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


class InviteCode(Base):
    """Инвайт-код для закрытой регистрации."""

    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    used_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AccessRequest(Base):
    """Заявка на получение доступа к платформе."""

    __tablename__ = "access_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    telegram: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[AccessRequestStatus] = mapped_column(
        Enum(AccessRequestStatus, name="access_request_status", values_callable=lambda e: [x.value for x in e]),
        default=AccessRequestStatus.PENDING,
    )
    generated_invite_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invite_codes.id"), nullable=True
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
