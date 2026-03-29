"""Тестовые фикстуры для pytest."""

# --- Monkey-patch: passlib + bcrypt 4.x/5.x совместимость ---
# passlib не обновляется и ломается с bcrypt>=4.1 (нет __about__.__version__).
# Патчим ДО любого импорта passlib.
import types

import bcrypt as _bcrypt_module

if not hasattr(_bcrypt_module, "__about__"):
    _about = types.SimpleNamespace(__version__=getattr(_bcrypt_module, "__version__", "5.0.0"))
    _bcrypt_module.__about__ = _about

import asyncio
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# --- SQLite-совместимость для PostgreSQL-типов ---
# Регистрируем компиляцию JSONB как JSON для SQLite
SQLiteTypeCompiler.visit_JSONB = lambda self, type_, **kw: "JSON"

# Импортируем модели billing, чтобы Base.metadata знала про все таблицы
# (до импорта app как FastAPI-инстанса, чтобы не было конфликта имён)
import app.modules.billing.models  # noqa: F401
import app.modules.market.models  # noqa: F401
import app.modules.strategy.models  # noqa: F401

from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app as fastapi_app
from app.modules.auth.models import User, UserRole, UserSettings

# Тестовая БД — SQLite async (in-memory)
TEST_DATABASE_URL = "sqlite+aiosqlite://"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@event.listens_for(test_engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Включить foreign keys и WAL для SQLite."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


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


fastapi_app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP-клиент для тестирования."""
    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app),
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
    """Создать тестового пользователя с настройками."""
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        username="testuser",
        hashed_password=hash_password("TestPass123"),
        is_active=True,
        role=UserRole.USER,
    )
    db_session.add(user)
    await db_session.flush()

    # Создать настройки
    settings = UserSettings(user_id=user.id)
    db_session.add(settings)
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
