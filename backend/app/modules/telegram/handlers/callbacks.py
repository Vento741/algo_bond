"""Обработчики inline callback кнопок."""

import uuid
from datetime import datetime, timezone

from aiogram import F, Router
from aiogram.types import CallbackQuery
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.telegram.keyboards import confirm_close_position, webapp_button
from app.modules.trading.models import Bot, BotStatus, Position, PositionStatus

router = Router(name="callbacks")


# === Управление ботами ===


@router.callback_query(F.data.startswith("bot_start:"))
async def callback_bot_start(
    query: CallbackQuery, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Запустить бота по нажатию кнопки."""
    bot_id_str = query.data.split(":", 1)[1]
    try:
        bot_id = uuid.UUID(bot_id_str)
    except ValueError:
        await query.answer("Некорректный ID бота", show_alert=True)
        return

    result = await session.execute(
        select(Bot).where(Bot.id == bot_id, Bot.user_id == user_id)
    )
    bot = result.scalar_one_or_none()

    if bot is None:
        await query.answer("Бот не найден", show_alert=True)
        return

    if bot.status == BotStatus.RUNNING:
        await query.answer("Бот уже запущен", show_alert=True)
        return

    bot.status = BotStatus.RUNNING
    bot.started_at = datetime.now(timezone.utc)
    bot.stopped_at = None
    await session.commit()

    await query.answer("Бот запущен")
    await query.message.edit_text(
        f"{query.message.text}\n\n<i>Статус изменён: RUNNING</i>"
    )


@router.callback_query(F.data.startswith("bot_stop:"))
async def callback_bot_stop(
    query: CallbackQuery, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Остановить бота по нажатию кнопки."""
    bot_id_str = query.data.split(":", 1)[1]
    try:
        bot_id = uuid.UUID(bot_id_str)
    except ValueError:
        await query.answer("Некорректный ID бота", show_alert=True)
        return

    result = await session.execute(
        select(Bot).where(Bot.id == bot_id, Bot.user_id == user_id)
    )
    bot = result.scalar_one_or_none()

    if bot is None:
        await query.answer("Бот не найден", show_alert=True)
        return

    if bot.status == BotStatus.STOPPED:
        await query.answer("Бот уже остановлен", show_alert=True)
        return

    bot.status = BotStatus.STOPPED
    bot.stopped_at = datetime.now(timezone.utc)
    await session.commit()

    await query.answer("Бот остановлен")
    await query.message.edit_text(
        f"{query.message.text}\n\n<i>Статус изменён: STOPPED</i>"
    )


# === Управление позициями ===


@router.callback_query(F.data.startswith("close_pos:"))
async def callback_close_position(
    query: CallbackQuery, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Показать подтверждение закрытия позиции."""
    position_id_str = query.data.split(":", 1)[1]
    try:
        position_id = uuid.UUID(position_id_str)
    except ValueError:
        await query.answer("Некорректный ID позиции", show_alert=True)
        return

    result = await session.execute(
        select(Position)
        .join(Bot, Position.bot_id == Bot.id)
        .where(Position.id == position_id, Bot.user_id == user_id)
    )
    position = result.scalar_one_or_none()

    if position is None:
        await query.answer("Позиция не найдена", show_alert=True)
        return

    if position.status != PositionStatus.OPEN:
        await query.answer("Позиция уже закрыта", show_alert=True)
        return

    await query.message.edit_reply_markup(
        reply_markup=confirm_close_position(position_id_str)
    )
    await query.answer()


@router.callback_query(F.data.startswith("confirm_close:"))
async def callback_confirm_close(
    query: CallbackQuery, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Подтвердить закрытие позиции.

    Реальное закрытие выполняется bot_worker через биржевой API.
    Перенаправляем на платформу для безопасного ручного закрытия.
    """
    position_id_str = query.data.split(":", 1)[1]
    try:
        position_id = uuid.UUID(position_id_str)
    except ValueError:
        await query.answer("Некорректный ID позиции", show_alert=True)
        return

    result = await session.execute(
        select(Position)
        .join(Bot, Position.bot_id == Bot.id)
        .where(Position.id == position_id, Bot.user_id == user_id)
    )
    position = result.scalar_one_or_none()

    if position is None:
        await query.answer("Позиция не найдена", show_alert=True)
        return

    if position.status != PositionStatus.OPEN:
        await query.answer("Позиция уже закрыта", show_alert=True)
        return

    await query.answer("Откройте платформу для закрытия позиции", show_alert=True)
    await query.message.edit_reply_markup(
        reply_markup=webapp_button("Закрыть на платформе", "/bots")
    )


@router.callback_query(F.data == "cancel")
async def callback_cancel(query: CallbackQuery) -> None:
    """Отмена действия - убрать кнопки подтверждения."""
    await query.message.edit_reply_markup(reply_markup=None)
    await query.answer("Отменено")


# === Callback кнопки админ-панели ===


@router.callback_query(F.data == "admin_health")
async def callback_admin_health(
    query: CallbackQuery, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Health check через кнопку админ-панели."""
    from app.modules.telegram.handlers.admin import check_health, _SEPARATOR

    lines = ["<b>Health Check</b>", _SEPARATOR] + await check_health(session)
    await query.answer()
    await query.message.answer("\n".join(lines))


@router.callback_query(F.data == "admin_logs")
async def callback_admin_logs(query: CallbackQuery) -> None:
    """Логи - заглушка через кнопку."""
    await query.answer()
    await query.message.answer(
        "Логи API доступны в веб-панели или через SSH.\n\n"
        "Откройте панель мониторинга для просмотра логов."
    )


@router.callback_query(F.data == "admin_users")
async def callback_admin_users(
    query: CallbackQuery, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Статистика пользователей через кнопку."""
    from app.modules.telegram.handlers.admin import get_platform_stats, _SEPARATOR

    total_users, active_users, _total_bots, running_bots = await get_platform_stats(session)
    lines = [
        "<b>Пользователи</b>",
        _SEPARATOR,
        f"Всего: {total_users} (активных: {active_users})",
        f"Ботов запущено: {running_bots}",
    ]
    await query.answer()
    await query.message.answer("\n".join(lines))
