"""Конфигурация Alembic для async SQLAlchemy."""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.database import Base

# Импорт всех моделей для autogenerate
from app.modules.auth.models import AccessRequest, ExchangeAccount, InviteCode, User, UserSettings  # noqa: F401
from app.modules.billing.models import Plan, Subscription  # noqa: F401
from app.modules.backtest.models import BacktestResult, BacktestRun  # noqa: F401
from app.modules.strategy.models import Strategy, StrategyConfig  # noqa: F401
from app.modules.trading.models import Bot, BotLog, Order, Position, TradeSignal  # noqa: F401
from app.modules.market.models import CandleSyncState, OHLCVCandle, TradingPair  # noqa: F401
from app.modules.analytics.models import AnalyticsSession, AnalyticsEvent, AnalyticsConversion  # noqa: F401
from app.modules.notifications.models import Notification, NotificationPreference  # noqa: F401
from app.modules.telegram.models import TelegramLink, TelegramDeepLinkToken  # noqa: F401
from app.modules.admin.models import SystemSetting  # noqa: F401

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
