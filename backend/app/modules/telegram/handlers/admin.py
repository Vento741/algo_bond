"""Обработчики административных команд /admin, /health, /logs, /users."""

import uuid

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.telegram.keyboards import admin_panel
from app.modules.trading.models import Bot, BotStatus

router = Router(name="admin")


@router.message(Command("admin"))
async def admin_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Панель администратора с кнопками управления."""
    await message.answer(
        "<b>Панель администратора</b>\n\n"
        "Выберите действие:",
        reply_markup=admin_panel(),
    )


@router.message(Command("health"))
async def health_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Проверить состояние сервисов: БД, Redis, Celery."""
    lines = ["<b>Health Check</b>", "━━━━━━━━━━━━━━━━━"]

    # Проверка БД
    try:
        await session.execute(select(func.now()))
        lines.append("Database: OK")
    except Exception as exc:
        lines.append(f"Database: FAIL ({exc})")

    # Проверка Redis
    try:
        from app.redis import pool as redis_pool
        await redis_pool.ping()
        lines.append("Redis: OK")
    except Exception as exc:
        lines.append(f"Redis: FAIL ({exc})")

    # Проверка Celery (через Redis broker)
    try:
        from app.celery_app import celery_app
        inspector = celery_app.control.inspect(timeout=2.0)
        stats = inspector.stats()
        if stats:
            worker_count = len(stats)
            lines.append(f"Celery: OK ({worker_count} workers)")
        else:
            lines.append("Celery: нет активных воркеров")
    except Exception as exc:
        lines.append(f"Celery: FAIL ({exc})")

    await message.answer("\n".join(lines))


@router.message(Command("logs"))
async def logs_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Просмотр логов - доступно только через веб-панель."""
    await message.answer(
        "Логи API доступны в веб-панели или через SSH.\n\n"
        "Откройте панель мониторинга для просмотра логов."
    )


@router.message(Command("users"))
async def users_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Статистика пользователей и ботов."""
    from app.modules.auth.models import User

    # Считаем пользователей
    users_result = await session.execute(
        select(func.count()).select_from(User)
    )
    total_users = users_result.scalar_one() or 0

    active_users_result = await session.execute(
        select(func.count()).select_from(User).where(User.is_active.is_(True))
    )
    active_users = active_users_result.scalar_one() or 0

    # Считаем ботов
    bots_result = await session.execute(
        select(func.count()).select_from(Bot)
    )
    total_bots = bots_result.scalar_one() or 0

    running_bots_result = await session.execute(
        select(func.count()).select_from(Bot).where(Bot.status == BotStatus.RUNNING)
    )
    running_bots = running_bots_result.scalar_one() or 0

    lines = [
        "<b>Статистика платформы</b>",
        "━━━━━━━━━━━━━━━━━",
        f"Пользователей: {total_users} (активных: {active_users})",
        f"Ботов: {total_bots} (запущено: {running_bots})",
    ]
    await message.answer("\n".join(lines))
