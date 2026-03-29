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
        except Exception:
            await session.rollback()
            raise


def create_standalone_session() -> async_sessionmaker[AsyncSession]:
    """Создать изолированный engine + session для Celery tasks.

    Каждый вызов asyncio.run() создаёт новый event loop.
    asyncpg привязывает connection pool к loop, поэтому
    нужен свежий engine для каждого Celery task.
    """
    fresh_engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_size=5,
        max_overflow=2,
    )
    return async_sessionmaker(
        fresh_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
