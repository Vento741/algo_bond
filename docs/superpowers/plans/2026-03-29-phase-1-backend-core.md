# Фаза 1: Backend Core — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Создать полноценный backend-каркас с модульной структурой, модулями auth (JWT, регистрация, логин, роли) и billing (планы, подписки), PostgreSQL + Alembic миграциями, Redis подключением. Результат: API авторизации работает, тарифные планы CRUD.

**Architecture:** Модульный монолит на FastAPI. Каждый модуль изолирован (models, schemas, service, router). Модули общаются через service layer. Async SQLAlchemy + asyncpg. JWT access + refresh tokens. Fernet-шифрование API-ключей бирж. Расширяемая система бирж (сейчас Bybit, потом другие).

**Tech Stack:** Python 3.12, FastAPI 0.115.6, SQLAlchemy 2.0.36 (async), asyncpg, Alembic 1.14.1, Redis 5.2.1, Pydantic 2.10.4, python-jose (JWT), passlib (bcrypt), cryptography (Fernet)

---

## Файловая структура (создаётся/модифицируется в этом плане)

```
backend/
├── alembic.ini                    # CREATE
├── alembic/                       # CREATE
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 001_initial_schema.py
├── app/
│   ├── main.py                    # MODIFY: подключить роутеры, lifespan
│   ├── config.py                  # MODIFY: добавить refresh token, frontend_url
│   ├── database.py                # CREATE: async engine, session, Base
│   ├── redis.py                   # CREATE: Redis connection pool
│   ├── celery_app.py              # CREATE: базовый Celery
│   │
│   ├── core/                      # CREATE
│   │   ├── __init__.py
│   │   ├── security.py            # JWT, хеширование, шифрование
│   │   └── exceptions.py          # HTTP exceptions
│   │
│   └── modules/                   # CREATE
│       ├── __init__.py
│       ├── auth/
│       │   ├── __init__.py
│       │   ├── models.py          # User, ExchangeAccount, UserSettings
│       │   ├── schemas.py         # Pydantic v2 request/response
│       │   ├── service.py         # AuthService
│       │   ├── dependencies.py    # get_current_user, get_current_active_user
│       │   └── router.py          # /api/auth/*
│       └── billing/
│           ├── __init__.py
│           ├── models.py          # Plan, Subscription
│           ├── schemas.py
│           ├── service.py         # BillingService
│           └── router.py          # /api/billing/*
│
└── tests/
    ├── conftest.py                # CREATE: fixtures, test DB
    ├── test_health.py             # EXISTS
    ├── test_auth.py               # CREATE
    └── test_billing.py            # CREATE
```

---

## Task 1: Инфраструктура БД и Redis

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/redis.py`
- Create: `backend/app/celery_app.py`
- Modify: `backend/app/config.py`

- [x] **Step 1: Обновить config.py — добавить недостающие настройки**

```python
"""Конфигурация приложения AlgoBond."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Загружаются из переменных окружения."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Приложение
    app_name: str = "AlgoBond"
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_url: str = "http://localhost:5173"

    # База данных
    database_url: str = "postgresql+asyncpg://algobond:changeme@db:5432/algobond"

    # Redis
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    # JWT
    jwt_secret_key: str = "changeme_jwt_secret_at_least_32_chars"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # Шифрование API-ключей бирж
    encryption_key: str = "changeme_fernet_key_base64"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Bybit
    bybit_testnet: bool = True


settings = Settings()
```

- [x] **Step 2: Создать database.py**

```python
"""Подключение к PostgreSQL через async SQLAlchemy."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.app_debug,
    pool_size=20,
    max_overflow=10,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Базовый класс для всех моделей."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency: сессия БД для каждого запроса."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

- [x] **Step 3: Создать redis.py**

```python
"""Подключение к Redis."""

from redis.asyncio import ConnectionPool, Redis

from app.config import settings

pool = ConnectionPool.from_url(
    settings.redis_url,
    max_connections=20,
    decode_responses=True,
)


def get_redis() -> Redis:
    """Dependency: клиент Redis."""
    return Redis(connection_pool=pool)
```

- [x] **Step 4: Создать celery_app.py**

```python
"""Конфигурация Celery для фоновых задач."""

from celery import Celery

from app.config import settings

celery = Celery(
    "algobond",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Автоматический поиск задач в модулях
celery.autodiscover_tasks([
    "app.modules.trading",
    "app.modules.backtest",
    "app.modules.market",
    "app.modules.notifications",
])
```

- [x] **Step 5: Коммит**

```bash
git add backend/app/config.py backend/app/database.py backend/app/redis.py backend/app/celery_app.py
git commit -m "feat: database, redis, celery infrastructure"
```

---

## Task 2: Core — security.py и exceptions.py

**Files:**
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/security.py`
- Create: `backend/app/core/exceptions.py`

- [x] **Step 1: Создать core/__init__.py**

```python
"""Ядро приложения: безопасность, исключения, middleware."""
```

- [x] **Step 2: Создать core/security.py**

```python
"""Безопасность: JWT-токены, хеширование паролей, шифрование API-ключей."""

from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# === Хеширование паролей ===

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Хешировать пароль bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверить пароль по хешу."""
    return pwd_context.verify(plain_password, hashed_password)


# === JWT-токены ===

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Создать access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict) -> str:
    """Создать refresh token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Декодировать и верифицировать JWT-токен. Выбрасывает JWTError при невалидном токене."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


# === Шифрование API-ключей бирж (Fernet) ===

def get_fernet() -> Fernet:
    """Получить экземпляр Fernet для шифрования."""
    return Fernet(settings.encryption_key.encode())


def encrypt_value(value: str) -> str:
    """Зашифровать строку (API-ключ, секрет)."""
    return get_fernet().encrypt(value.encode()).decode()


def decrypt_value(encrypted_value: str) -> str:
    """Расшифровать строку."""
    return get_fernet().decrypt(encrypted_value.encode()).decode()
```

- [x] **Step 3: Создать core/exceptions.py**

```python
"""Кастомные HTTP-исключения."""

from fastapi import HTTPException, status


class CredentialsException(HTTPException):
    """Невалидные учётные данные (401)."""

    def __init__(self, detail: str = "Невалидные учётные данные"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenException(HTTPException):
    """Доступ запрещён (403)."""

    def __init__(self, detail: str = "Доступ запрещён"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class NotFoundException(HTTPException):
    """Ресурс не найден (404)."""

    def __init__(self, detail: str = "Ресурс не найден"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ConflictException(HTTPException):
    """Конфликт данных (409)."""

    def __init__(self, detail: str = "Ресурс уже существует"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)
```

- [x] **Step 4: Коммит**

```bash
git add backend/app/core/
git commit -m "feat: core security (JWT, bcrypt, Fernet) and exceptions"
```

---

## Task 3: Auth — модели SQLAlchemy

**Files:**
- Create: `backend/app/modules/__init__.py`
- Create: `backend/app/modules/auth/__init__.py`
- Create: `backend/app/modules/auth/models.py`

- [x] **Step 1: Создать modules/__init__.py и modules/auth/__init__.py**

```python
# modules/__init__.py
"""Модули приложения AlgoBond."""
```

```python
# modules/auth/__init__.py
"""Модуль аутентификации и авторизации."""
```

- [x] **Step 2: Создать auth/models.py**

```python
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


# Импорт для корректной работы relationship (forward refs)
from app.modules.billing.models import Subscription  # noqa: E402, F401
```

**Важно:** Последний import будет добавлен после создания billing/models.py в Task 4. Пока оставить без него — добавить после Task 4.

- [x] **Step 3: Коммит**

```bash
git add backend/app/modules/
git commit -m "feat(auth): User, ExchangeAccount, UserSettings models"
```

---

## Task 4: Billing — модели SQLAlchemy

**Files:**
- Create: `backend/app/modules/billing/__init__.py`
- Create: `backend/app/modules/billing/models.py`

- [x] **Step 1: Создать modules/billing/__init__.py**

```python
"""Модуль тарифных планов и подписок."""
```

- [x] **Step 2: Создать billing/models.py**

```python
"""Модели биллинга: Plan, Subscription."""

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SubscriptionStatus(str, enum.Enum):
    """Статусы подписки."""
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class Plan(Base):
    """Тарифный план (Free / Basic / Pro / VIP)."""

    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(50))
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    price_monthly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    max_bots: Mapped[int] = mapped_column(Integer, default=1)
    max_strategies: Mapped[int] = mapped_column(Integer, default=1)
    max_backtests_per_day: Mapped[int] = mapped_column(Integer, default=5)
    features: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Связи
    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="plan")


class Subscription(Base):
    """Подписка пользователя на тарифный план."""

    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id")
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"),
        default=SubscriptionStatus.ACTIVE,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Связи
    user: Mapped["User"] = relationship(back_populates="subscription")
    plan: Mapped["Plan"] = relationship(back_populates="subscriptions")


from app.modules.auth.models import User  # noqa: E402, F401
```

- [x] **Step 3: Добавить forward-ref import в auth/models.py**

В конец файла `backend/app/modules/auth/models.py` добавить:

```python
from app.modules.billing.models import Subscription  # noqa: E402, F401
```

- [x] **Step 4: Коммит**

```bash
git add backend/app/modules/billing/ backend/app/modules/auth/models.py
git commit -m "feat(billing): Plan, Subscription models"
```

---

## Task 5: Alembic — инициализация и первая миграция

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/` (директория)

- [x] **Step 1: Инициализировать Alembic внутри Docker-контейнера**

```bash
cd backend
docker compose exec api alembic init alembic
```

Если контейнер не запущен — инициализировать локально:
```bash
cd backend && python -m alembic init alembic
```

- [x] **Step 2: Настроить alembic.ini**

В файле `backend/alembic.ini` заменить строку sqlalchemy.url:

```ini
# Используем async URL из env.py, здесь пусто
sqlalchemy.url =
```

- [x] **Step 3: Настроить alembic/env.py**

Заменить содержимое `backend/alembic/env.py`:

```python
"""Конфигурация Alembic для async SQLAlchemy."""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.database import Base

# Импорт всех моделей для autogenerate
from app.modules.auth.models import ExchangeAccount, User, UserSettings  # noqa: F401
from app.modules.billing.models import Plan, Subscription  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Миграции в offline-режиме (генерация SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    """Запуск миграций с подключением."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Миграции в online-режиме (async)."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Точка входа для online-миграций."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [x] **Step 4: Сгенерировать первую миграцию**

```bash
cd backend
alembic revision --autogenerate -m "initial schema: users, exchange_accounts, user_settings, plans, subscriptions"
```

- [x] **Step 5: Проверить сгенерированную миграцию**

Открыть файл в `backend/alembic/versions/` и убедиться что создаются 5 таблиц:
- `users` (id, email, hashed_password, username, is_active, is_verified, role, created_at, updated_at)
- `exchange_accounts` (id, user_id FK, exchange, label, api_key_encrypted, api_secret_encrypted, is_testnet, is_active, created_at)
- `user_settings` (id, user_id FK UNIQUE, timezone, notification_channels, default_symbol, default_timeframe, ui_preferences)
- `plans` (id, name, slug UNIQUE, price_monthly, max_bots, max_strategies, max_backtests_per_day, features)
- `subscriptions` (id, user_id FK UNIQUE, plan_id FK, status, started_at, expires_at)

- [x] **Step 6: Применить миграцию**

```bash
alembic upgrade head
```

- [x] **Step 7: Проверить состояние**

```bash
alembic current
```

Expected: `001... (head)`

- [x] **Step 8: Коммит**

```bash
git add backend/alembic.ini backend/alembic/
git commit -m "feat: Alembic init + initial schema migration (5 tables)"
```

---

## Task 6: Auth — schemas (Pydantic v2)

**Files:**
- Create: `backend/app/modules/auth/schemas.py`

- [x] **Step 1: Создать auth/schemas.py**

```python
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

class UserSettingsResponse(BaseModel):
    """Ответ — настройки пользователя."""
    model_config = ConfigDict(from_attributes=True)

    timezone: str
    notification_channels: dict
    default_symbol: str
    default_timeframe: str
    ui_preferences: dict


class UserSettingsUpdate(BaseModel):
    """Обновление настроек."""
    timezone: str | None = None
    notification_channels: dict | None = None
    default_symbol: str | None = None
    default_timeframe: str | None = None
    ui_preferences: dict | None = None
```

- [x] **Step 2: Добавить email-validator в requirements.txt**

Добавить строку:
```
email-validator==2.1.0
```

- [x] **Step 3: Коммит**

```bash
git add backend/app/modules/auth/schemas.py backend/requirements.txt
git commit -m "feat(auth): Pydantic v2 request/response schemas"
```

---

## Task 7: Auth — service

**Files:**
- Create: `backend/app/modules/auth/service.py`

- [x] **Step 1: Создать auth/service.py**

```python
"""Бизнес-логика модуля auth."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictException, CredentialsException, NotFoundException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decrypt_value,
    encrypt_value,
    hash_password,
    verify_password,
)
from app.modules.auth.models import ExchangeAccount, User, UserSettings
from app.modules.auth.schemas import (
    ExchangeAccountCreate,
    RegisterRequest,
    TokenResponse,
    UserSettingsUpdate,
)


class AuthService:
    """Сервис аутентификации и управления пользователями."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register(self, data: RegisterRequest) -> User:
        """Регистрация нового пользователя."""
        # Проверка уникальности email
        existing = await self.db.execute(
            select(User).where(User.email == data.email)
        )
        if existing.scalar_one_or_none():
            raise ConflictException("Пользователь с таким email уже существует")

        user = User(
            email=data.email,
            username=data.username,
            hashed_password=hash_password(data.password),
        )
        self.db.add(user)
        await self.db.flush()

        # Создать дефолтные настройки
        user_settings = UserSettings(user_id=user.id)
        self.db.add(user_settings)
        await self.db.flush()

        return user

    async def login(self, email: str, password: str) -> TokenResponse:
        """Аутентификация: email + пароль → JWT-токены."""
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.hashed_password):
            raise CredentialsException("Неверный email или пароль")

        if not user.is_active:
            raise CredentialsException("Аккаунт деактивирован")

        return TokenResponse(
            access_token=create_access_token({"sub": str(user.id)}),
            refresh_token=create_refresh_token({"sub": str(user.id)}),
        )

    async def get_user_by_id(self, user_id: uuid.UUID) -> User:
        """Получить пользователя по ID."""
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")
        return user

    async def update_user(self, user: User, username: str | None = None) -> User:
        """Обновить профиль пользователя."""
        if username is not None:
            user.username = username
        await self.db.flush()
        return user

    # === Exchange Accounts ===

    async def create_exchange_account(
        self, user_id: uuid.UUID, data: ExchangeAccountCreate
    ) -> ExchangeAccount:
        """Создать привязку к бирже (ключи шифруются)."""
        account = ExchangeAccount(
            user_id=user_id,
            exchange=data.exchange,
            label=data.label,
            api_key_encrypted=encrypt_value(data.api_key),
            api_secret_encrypted=encrypt_value(data.api_secret),
            is_testnet=data.is_testnet,
        )
        self.db.add(account)
        await self.db.flush()
        return account

    async def get_exchange_accounts(self, user_id: uuid.UUID) -> list[ExchangeAccount]:
        """Список аккаунтов бирж пользователя."""
        result = await self.db.execute(
            select(ExchangeAccount).where(ExchangeAccount.user_id == user_id)
        )
        return list(result.scalars().all())

    async def delete_exchange_account(
        self, user_id: uuid.UUID, account_id: uuid.UUID
    ) -> None:
        """Удалить привязку к бирже."""
        result = await self.db.execute(
            select(ExchangeAccount).where(
                ExchangeAccount.id == account_id,
                ExchangeAccount.user_id == user_id,
            )
        )
        account = result.scalar_one_or_none()
        if not account:
            raise NotFoundException("Аккаунт биржи не найден")
        await self.db.delete(account)

    # === User Settings ===

    async def get_user_settings(self, user_id: uuid.UUID) -> UserSettings:
        """Получить настройки пользователя."""
        result = await self.db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            raise NotFoundException("Настройки не найдены")
        return settings

    async def update_user_settings(
        self, user_id: uuid.UUID, data: UserSettingsUpdate
    ) -> UserSettings:
        """Обновить настройки пользователя."""
        settings = await self.get_user_settings(user_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(settings, field, value)
        await self.db.flush()
        return settings
```

- [x] **Step 2: Коммит**

```bash
git add backend/app/modules/auth/service.py
git commit -m "feat(auth): AuthService — регистрация, логин, exchange accounts, settings"
```

---

## Task 8: Auth — dependencies и router

**Files:**
- Create: `backend/app/modules/auth/dependencies.py`
- Create: `backend/app/modules/auth/router.py`

- [x] **Step 1: Создать auth/dependencies.py**

```python
"""FastAPI dependencies модуля auth."""

import uuid

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import CredentialsException
from app.core.security import decode_token
from app.database import get_db
from app.modules.auth.models import User
from app.modules.auth.service import AuthService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency: текущий аутентифицированный пользователь."""
    try:
        payload = decode_token(token)
        user_id_str: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id_str is None or token_type != "access":
            raise CredentialsException()
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        raise CredentialsException()

    service = AuthService(db)
    user = await service.get_user_by_id(user_id)

    if not user.is_active:
        raise CredentialsException("Аккаунт деактивирован")

    return user


async def get_current_active_user(
    user: User = Depends(get_current_user),
) -> User:
    """Dependency: активный пользователь (is_active=True)."""
    if not user.is_active:
        raise CredentialsException("Аккаунт деактивирован")
    return user
```

- [x] **Step 2: Создать auth/router.py**

```python
"""API-эндпоинты модуля auth."""

import uuid

from fastapi import APIRouter, Depends
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import CredentialsException
from app.core.security import create_access_token, decode_token
from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    ExchangeAccountCreate,
    ExchangeAccountResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    UserUpdateRequest,
)
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Регистрация нового пользователя."""
    service = AuthService(db)
    return await service.register(data)


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Вход: email + пароль → JWT-токены."""
    service = AuthService(db)
    return await service.login(data.email, data.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Обновить access token по refresh token."""
    try:
        payload = decode_token(data.refresh_token)
        user_id_str: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id_str is None or token_type != "refresh":
            raise CredentialsException("Невалидный refresh token")
    except JWTError:
        raise CredentialsException("Невалидный refresh token")

    service = AuthService(db)
    user = await service.get_user_by_id(uuid.UUID(user_id_str))

    from app.core.security import create_refresh_token

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
) -> User:
    """Получить данные текущего пользователя."""
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Обновить профиль текущего пользователя."""
    service = AuthService(db)
    return await service.update_user(user, username=data.username)


# === Exchange Accounts ===

@router.post("/exchange-accounts", response_model=ExchangeAccountResponse, status_code=201)
async def create_exchange_account(
    data: ExchangeAccountCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExchangeAccountResponse:
    """Привязать аккаунт биржи."""
    service = AuthService(db)
    account = await service.create_exchange_account(user.id, data)
    return account


@router.get("/exchange-accounts", response_model=list[ExchangeAccountResponse])
async def list_exchange_accounts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ExchangeAccountResponse]:
    """Список привязанных аккаунтов бирж."""
    service = AuthService(db)
    return await service.get_exchange_accounts(user.id)


@router.delete("/exchange-accounts/{account_id}", status_code=204)
async def delete_exchange_account(
    account_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить привязку к бирже."""
    service = AuthService(db)
    await service.delete_exchange_account(user.id, account_id)


# === User Settings ===

@router.get("/settings", response_model=UserSettingsResponse)
async def get_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsResponse:
    """Получить настройки пользователя."""
    service = AuthService(db)
    return await service.get_user_settings(user.id)


@router.patch("/settings", response_model=UserSettingsResponse)
async def update_settings(
    data: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsResponse:
    """Обновить настройки пользователя."""
    service = AuthService(db)
    return await service.update_user_settings(user.id, data)
```

- [x] **Step 3: Коммит**

```bash
git add backend/app/modules/auth/dependencies.py backend/app/modules/auth/router.py
git commit -m "feat(auth): dependencies (JWT guard) and router (register, login, refresh, me, exchange accounts, settings)"
```

---

## Task 9: Billing — schemas, service, router

**Files:**
- Create: `backend/app/modules/billing/schemas.py`
- Create: `backend/app/modules/billing/service.py`
- Create: `backend/app/modules/billing/router.py`

- [x] **Step 1: Создать billing/schemas.py**

```python
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
```

- [x] **Step 2: Создать billing/service.py**

```python
"""Бизнес-логика модуля billing."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictException, NotFoundException
from app.modules.billing.models import Plan, Subscription, SubscriptionStatus
from app.modules.billing.schemas import PlanCreate


class BillingService:
    """Сервис тарифных планов и подписок."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # === Plans ===

    async def get_plans(self) -> list[Plan]:
        """Список всех тарифных планов."""
        result = await self.db.execute(select(Plan).order_by(Plan.price_monthly))
        return list(result.scalars().all())

    async def get_plan_by_slug(self, slug: str) -> Plan:
        """Получить план по slug."""
        result = await self.db.execute(
            select(Plan).where(Plan.slug == slug)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundException(f"Тарифный план '{slug}' не найден")
        return plan

    async def create_plan(self, data: PlanCreate) -> Plan:
        """Создать тарифный план (admin)."""
        existing = await self.db.execute(
            select(Plan).where(Plan.slug == data.slug)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(f"План с slug '{data.slug}' уже существует")

        plan = Plan(**data.model_dump())
        self.db.add(plan)
        await self.db.flush()
        return plan

    # === Subscriptions ===

    async def get_user_subscription(self, user_id: uuid.UUID) -> Subscription:
        """Получить активную подписку пользователя."""
        result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.user_id == user_id)
        )
        sub = result.scalar_one_or_none()
        if not sub:
            raise NotFoundException("Подписка не найдена")
        return sub

    async def subscribe(self, user_id: uuid.UUID, plan_slug: str) -> Subscription:
        """Подписать пользователя на тарифный план."""
        plan = await self.get_plan_by_slug(plan_slug)

        # Проверить существующую подписку
        result = await self.db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Обновить план
            existing.plan_id = plan.id
            existing.status = SubscriptionStatus.ACTIVE
            await self.db.flush()
            # Подгрузить связанный план
            result = await self.db.execute(
                select(Subscription)
                .options(selectinload(Subscription.plan))
                .where(Subscription.id == existing.id)
            )
            return result.scalar_one()

        sub = Subscription(user_id=user_id, plan_id=plan.id)
        self.db.add(sub)
        await self.db.flush()

        # Подгрузить связанный план
        result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.id == sub.id)
        )
        return result.scalar_one()
```

- [x] **Step 3: Создать billing/router.py**

```python
"""API-эндпоинты модуля billing."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException
from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User, UserRole
from app.modules.billing.schemas import PlanCreate, PlanResponse, SubscriptionResponse
from app.modules.billing.service import BillingService

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(
    db: AsyncSession = Depends(get_db),
) -> list[PlanResponse]:
    """Список всех тарифных планов (публичный)."""
    service = BillingService(db)
    return await service.get_plans()


@router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_plan(
    data: PlanCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlanResponse:
    """Создать тарифный план (только admin)."""
    if user.role != UserRole.ADMIN:
        raise ForbiddenException("Только администратор может создавать тарифные планы")
    service = BillingService(db)
    return await service.create_plan(data)


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """Получить текущую подписку пользователя."""
    service = BillingService(db)
    return await service.get_user_subscription(user.id)


@router.post("/subscribe/{plan_slug}", response_model=SubscriptionResponse)
async def subscribe_to_plan(
    plan_slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """Подписаться на тарифный план."""
    service = BillingService(db)
    return await service.subscribe(user.id, plan_slug)
```

- [x] **Step 4: Коммит**

```bash
git add backend/app/modules/billing/
git commit -m "feat(billing): schemas, service, router — plans CRUD + subscriptions"
```

---

## Task 10: Сборка — main.py + lifespan

**Files:**
- Modify: `backend/app/main.py`

- [x] **Step 1: Обновить main.py — подключить роутеры и lifespan**

```python
"""Точка входа FastAPI приложения AlgoBond."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация и завершение приложения."""
    # Startup
    yield
    # Shutdown
    from app.redis import pool
    await pool.disconnect()


app = FastAPI(
    title=settings.app_name,
    description="Платформа алгоритмической торговли криптовалютными фьючерсами",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роутеры модулей
app.include_router(auth_router)
app.include_router(billing_router)


@app.get("/health")
async def health_check():
    """Проверка работоспособности API."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "0.1.0",
    }
```

- [x] **Step 2: Проверить что приложение стартует**

```bash
cd backend
python -c "from app.main import app; print('OK:', [r.path for r in app.routes])"
```

Expected: список роутов включает `/api/auth/register`, `/api/auth/login`, `/api/billing/plans`, и т.д.

- [x] **Step 3: Коммит**

```bash
git add backend/app/main.py
git commit -m "feat: wire auth + billing routers into main.py with lifespan"
```

---

## Task 11: Тесты — conftest.py и fixtures

**Files:**
- Create: `backend/tests/conftest.py`
- Modify: `backend/requirements.txt`

- [x] **Step 1: Добавить aiosqlite в requirements.txt для тестов**

Добавить:
```
aiosqlite==0.20.0
```

- [x] **Step 2: Создать tests/conftest.py**

```python
"""Тестовые фикстуры для pytest."""

import asyncio
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app
from app.modules.auth.models import User, UserRole


# === Тестовая БД (SQLite async для изоляции) ===

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest.fixture(scope="session")
def event_loop():
    """Единый event loop для всей тестовой сессии."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Создать/пересоздать таблицы перед каждым тестом."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    """Подменить get_db на тестовую сессию."""
    async with test_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP-клиент для тестирования."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Сессия БД для прямых операций в тестах."""
    async with test_session() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Создать тестового пользователя."""
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        username="testuser",
        hashed_password=hash_password("TestPass123"),
        is_active=True,
        role=UserRole.USER,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    """Создать тестового администратора."""
    user = User(
        id=uuid.uuid4(),
        email="admin@example.com",
        username="admin",
        hashed_password=hash_password("AdminPass123"),
        is_active=True,
        role=UserRole.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    """Заголовки авторизации для обычного пользователя."""
    token = create_access_token({"sub": str(test_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
def admin_headers(admin_user: User) -> dict[str, str]:
    """Заголовки авторизации для администратора."""
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}
```

- [x] **Step 3: Коммит**

```bash
git add backend/tests/conftest.py backend/requirements.txt
git commit -m "test: conftest with async fixtures, test DB, auth helpers"
```

---

## Task 12: Тесты Auth

**Files:**
- Create: `backend/tests/test_auth.py`

- [x] **Step 1: Создать tests/test_auth.py**

```python
"""Тесты модуля auth."""

import pytest
from httpx import AsyncClient

from app.modules.auth.models import User

pytestmark = pytest.mark.asyncio


class TestRegister:
    """Тесты регистрации."""

    async def test_register_success(self, client: AsyncClient):
        """Успешная регистрация нового пользователя."""
        response = await client.post("/api/auth/register", json={
            "email": "new@example.com",
            "username": "newuser",
            "password": "SecurePass123",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "new@example.com"
        assert data["username"] == "newuser"
        assert data["is_active"] is True
        assert data["role"] == "user"
        assert "id" in data

    async def test_register_duplicate_email(self, client: AsyncClient, test_user: User):
        """Ошибка при дублировании email."""
        response = await client.post("/api/auth/register", json={
            "email": test_user.email,
            "username": "another",
            "password": "SecurePass123",
        })
        assert response.status_code == 409

    async def test_register_short_password(self, client: AsyncClient):
        """Ошибка при коротком пароле."""
        response = await client.post("/api/auth/register", json={
            "email": "short@example.com",
            "username": "short",
            "password": "123",
        })
        assert response.status_code == 422

    async def test_register_invalid_email(self, client: AsyncClient):
        """Ошибка при невалидном email."""
        response = await client.post("/api/auth/register", json={
            "email": "not-an-email",
            "username": "bad",
            "password": "SecurePass123",
        })
        assert response.status_code == 422


class TestLogin:
    """Тесты аутентификации."""

    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Успешный логин → получить access + refresh токены."""
        response = await client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Ошибка при неверном пароле."""
        response = await client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "WrongPassword",
        })
        assert response.status_code == 401

    async def test_login_unknown_email(self, client: AsyncClient):
        """Ошибка при несуществующем email."""
        response = await client.post("/api/auth/login", json={
            "email": "ghost@example.com",
            "password": "Anything123",
        })
        assert response.status_code == 401


class TestRefreshToken:
    """Тесты обновления токена."""

    async def test_refresh_success(self, client: AsyncClient, test_user: User):
        """Успешное обновление access token."""
        # Сначала залогиниться
        login_resp = await client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123",
        })
        refresh_token = login_resp.json()["refresh_token"]

        # Обновить
        response = await client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert response.status_code == 200
        assert "access_token" in response.json()

    async def test_refresh_invalid_token(self, client: AsyncClient):
        """Ошибка при невалидном refresh token."""
        response = await client.post("/api/auth/refresh", json={
            "refresh_token": "invalid.token.here",
        })
        assert response.status_code == 401


class TestMe:
    """Тесты профиля пользователя."""

    async def test_get_me(self, client: AsyncClient, auth_headers: dict, test_user: User):
        """Получить данные текущего пользователя."""
        response = await client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["email"] == test_user.email

    async def test_get_me_unauthorized(self, client: AsyncClient):
        """Ошибка без авторизации."""
        response = await client.get("/api/auth/me")
        assert response.status_code == 401

    async def test_update_me(self, client: AsyncClient, auth_headers: dict):
        """Обновить username."""
        response = await client.patch("/api/auth/me", headers=auth_headers, json={
            "username": "updated_name",
        })
        assert response.status_code == 200
        assert response.json()["username"] == "updated_name"


class TestSettings:
    """Тесты настроек пользователя."""

    async def test_get_settings(self, client: AsyncClient, auth_headers: dict, test_user: User):
        """Получить настройки (создаются при регистрации)."""
        # Регистрируем нового пользователя чтобы настройки были созданы автоматически
        reg_resp = await client.post("/api/auth/register", json={
            "email": "settings@example.com",
            "username": "settingsuser",
            "password": "SecurePass123",
        })
        # Логинимся
        login_resp = await client.post("/api/auth/login", json={
            "email": "settings@example.com",
            "password": "SecurePass123",
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get("/api/auth/settings", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["default_symbol"] == "RIVERUSDT"
        assert data["timezone"] == "Europe/Moscow"
```

- [x] **Step 2: Запустить тесты**

```bash
cd backend
pytest tests/test_auth.py -v
```

Expected: все тесты PASS

- [x] **Step 3: Коммит**

```bash
git add backend/tests/test_auth.py
git commit -m "test(auth): register, login, refresh, me, settings — all passing"
```

---

## Task 13: Тесты Billing

**Files:**
- Create: `backend/tests/test_billing.py`

- [x] **Step 1: Создать tests/test_billing.py**

```python
"""Тесты модуля billing."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.billing.models import Plan

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def free_plan(db_session: AsyncSession) -> Plan:
    """Создать бесплатный план."""
    plan = Plan(
        name="Free",
        slug="free",
        price_monthly=0,
        max_bots=1,
        max_strategies=1,
        max_backtests_per_day=5,
        features={},
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.fixture
async def pro_plan(db_session: AsyncSession) -> Plan:
    """Создать Pro-план."""
    plan = Plan(
        name="Pro",
        slug="pro",
        price_monthly=49.99,
        max_bots=10,
        max_strategies=10,
        max_backtests_per_day=100,
        features={"priority_support": True},
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


class TestPlans:
    """Тесты тарифных планов."""

    async def test_list_plans_empty(self, client: AsyncClient):
        """Пустой список планов (публичный эндпоинт)."""
        response = await client.get("/api/billing/plans")
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_plans(self, client: AsyncClient, free_plan: Plan, pro_plan: Plan):
        """Список планов с данными."""
        response = await client.get("/api/billing/plans")
        assert response.status_code == 200
        plans = response.json()
        assert len(plans) == 2
        assert plans[0]["slug"] == "free"  # сортировка по цене
        assert plans[1]["slug"] == "pro"

    async def test_create_plan_admin(
        self, client: AsyncClient, admin_headers: dict
    ):
        """Admin может создать план."""
        response = await client.post("/api/billing/plans", headers=admin_headers, json={
            "name": "Basic",
            "slug": "basic",
            "price_monthly": 19.99,
            "max_bots": 3,
            "max_strategies": 5,
            "max_backtests_per_day": 20,
            "features": {},
        })
        assert response.status_code == 201
        assert response.json()["slug"] == "basic"

    async def test_create_plan_user_forbidden(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Обычный пользователь не может создать план."""
        response = await client.post("/api/billing/plans", headers=auth_headers, json={
            "name": "Hack",
            "slug": "hack",
            "price_monthly": 0,
        })
        assert response.status_code == 403

    async def test_create_plan_duplicate_slug(
        self, client: AsyncClient, admin_headers: dict, free_plan: Plan
    ):
        """Дублирование slug → 409."""
        response = await client.post("/api/billing/plans", headers=admin_headers, json={
            "name": "Another Free",
            "slug": "free",
            "price_monthly": 0,
        })
        assert response.status_code == 409


class TestSubscriptions:
    """Тесты подписок."""

    async def test_subscribe(
        self, client: AsyncClient, auth_headers: dict, free_plan: Plan
    ):
        """Подписаться на бесплатный план."""
        response = await client.post(
            "/api/billing/subscribe/free", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"
        assert data["plan"]["slug"] == "free"

    async def test_get_subscription(
        self, client: AsyncClient, auth_headers: dict, free_plan: Plan
    ):
        """Получить текущую подписку."""
        # Сначала подписаться
        await client.post("/api/billing/subscribe/free", headers=auth_headers)

        response = await client.get("/api/billing/subscription", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["plan"]["slug"] == "free"

    async def test_change_plan(
        self, client: AsyncClient, auth_headers: dict, free_plan: Plan, pro_plan: Plan
    ):
        """Сменить план подписки."""
        await client.post("/api/billing/subscribe/free", headers=auth_headers)
        response = await client.post(
            "/api/billing/subscribe/pro", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["plan"]["slug"] == "pro"

    async def test_subscribe_unknown_plan(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Подписка на несуществующий план → 404."""
        response = await client.post(
            "/api/billing/subscribe/nonexistent", headers=auth_headers
        )
        assert response.status_code == 404

    async def test_get_subscription_none(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Получить подписку когда её нет → 404."""
        response = await client.get("/api/billing/subscription", headers=auth_headers)
        assert response.status_code == 404
```

- [x] **Step 2: Запустить все тесты**

```bash
cd backend
pytest tests/ -v
```

Expected: все тесты PASS

- [x] **Step 3: Коммит**

```bash
git add backend/tests/test_billing.py
git commit -m "test(billing): plans CRUD, subscriptions, admin guard — all passing"
```

---

## Task 14: Seed-скрипт для начальных данных

**Files:**
- Create: `backend/scripts/seed_plans.py`

- [x] **Step 1: Создать scripts/seed_plans.py**

```python
"""Скрипт инициализации тарифных планов."""

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

# Добавить корень проекта в sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.database import async_session
from app.modules.billing.models import Plan

PLANS = [
    {
        "name": "Free",
        "slug": "free",
        "price_monthly": Decimal("0.00"),
        "max_bots": 1,
        "max_strategies": 1,
        "max_backtests_per_day": 5,
        "features": {"demo_mode": True},
    },
    {
        "name": "Basic",
        "slug": "basic",
        "price_monthly": Decimal("19.99"),
        "max_bots": 3,
        "max_strategies": 5,
        "max_backtests_per_day": 20,
        "features": {"demo_mode": True, "live_trading": True},
    },
    {
        "name": "Pro",
        "slug": "pro",
        "price_monthly": Decimal("49.99"),
        "max_bots": 10,
        "max_strategies": 10,
        "max_backtests_per_day": 100,
        "features": {
            "demo_mode": True,
            "live_trading": True,
            "priority_support": True,
            "custom_strategies": True,
        },
    },
    {
        "name": "VIP",
        "slug": "vip",
        "price_monthly": Decimal("99.99"),
        "max_bots": 50,
        "max_strategies": 50,
        "max_backtests_per_day": 500,
        "features": {
            "demo_mode": True,
            "live_trading": True,
            "priority_support": True,
            "custom_strategies": True,
            "api_access": True,
            "dedicated_server": True,
        },
    },
]


async def seed_plans() -> None:
    """Создать начальные тарифные планы (идемпотентно)."""
    async with async_session() as db:
        for plan_data in PLANS:
            result = await db.execute(
                select(Plan).where(Plan.slug == plan_data["slug"])
            )
            if result.scalar_one_or_none():
                print(f"  План '{plan_data['name']}' уже существует, пропуск")
                continue

            plan = Plan(**plan_data)
            db.add(plan)
            print(f"  + Создан план: {plan_data['name']} (${plan_data['price_monthly']}/мес)")

        await db.commit()
    print("Seed завершён!")


if __name__ == "__main__":
    asyncio.run(seed_plans())
```

- [x] **Step 2: Запустить seed**

```bash
cd backend
python scripts/seed_plans.py
```

Expected:
```
  + Создан план: Free ($0.00/мес)
  + Создан план: Basic ($19.99/мес)
  + Создан план: Pro ($49.99/мес)
  + Создан план: VIP ($99.99/мес)
Seed завершён!
```

- [x] **Step 3: Коммит**

```bash
git add backend/scripts/seed_plans.py
git commit -m "feat: seed script for initial billing plans (Free/Basic/Pro/VIP)"
```

---

## Task 15: Финальная проверка и коммит

- [x] **Step 1: Запустить все тесты**

```bash
cd backend
pytest tests/ -v --tb=short
```

Expected: все тесты PASS

- [x] **Step 2: Проверить что приложение стартует в Docker**

```bash
docker compose up -d --build api db redis
docker compose exec api alembic upgrade head
docker compose exec api python scripts/seed_plans.py
curl http://localhost:8000/health
curl http://localhost:8000/api/docs
```

Expected:
- `/health` → `{"status":"ok"}`
- `/api/docs` → Swagger UI с разделами auth и billing

- [x] **Step 3: Проверить основные API-вызовы**

```bash
# Регистрация
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@algobond.com","username":"demo","password":"DemoPass123"}'

# Логин
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@algobond.com","password":"DemoPass123"}'

# Список планов (публичный)
curl http://localhost:8000/api/billing/plans
```

- [x] **Step 4: Финальный коммит всей фазы**

```bash
git add -A
git commit -m "feat: Phase 1 Backend Core complete — auth (JWT, register, login, roles, exchange accounts, settings) + billing (plans, subscriptions) + Alembic + Redis"
```

---

## Итого: что создано в Фазе 1

| Компонент | Файлы | Описание |
|-----------|-------|----------|
| **database.py** | 1 файл | Async SQLAlchemy engine, session, Base |
| **redis.py** | 1 файл | Redis connection pool |
| **celery_app.py** | 1 файл | Celery с автообнаружением задач |
| **core/** | 3 файла | security (JWT, bcrypt, Fernet), exceptions |
| **auth/** | 6 файлов | models, schemas, service, dependencies, router |
| **billing/** | 5 файлов | models, schemas, service, router |
| **Alembic** | 3+ файлов | Инициализация + первая миграция (5 таблиц) |
| **Тесты** | 3 файла | conftest, test_auth (12 тестов), test_billing (8 тестов) |
| **Seed** | 1 файл | Начальные тарифные планы |

**Таблицы БД (5):** users, exchange_accounts, user_settings, plans, subscriptions

**API-эндпоинты (14):**
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход
- `POST /api/auth/refresh` — обновление токена
- `GET /api/auth/me` — профиль
- `PATCH /api/auth/me` — обновление профиля
- `POST /api/auth/exchange-accounts` — привязка биржи
- `GET /api/auth/exchange-accounts` — список бирж
- `DELETE /api/auth/exchange-accounts/{id}` — удалить биржу
- `GET /api/auth/settings` — настройки
- `PATCH /api/auth/settings` — обновить настройки
- `GET /api/billing/plans` — список планов (публичный)
- `POST /api/billing/plans` — создать план (admin)
- `GET /api/billing/subscription` — моя подписка
- `POST /api/billing/subscribe/{slug}` — подписаться
