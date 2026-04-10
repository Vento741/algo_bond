"""Обработчики команд /status, /pnl, /balance, /positions (требуют AuthMiddleware)."""

import uuid
from decimal import Decimal

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.telegram.formatters import format_bot_status
from app.modules.telegram.keyboards import bot_control_buttons, position_buttons, webapp_button
from app.modules.trading.models import Bot, BotStatus, Position, PositionStatus

router = Router(name="status")


@router.message(Command("status"))
async def status_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Статус всех торговых ботов пользователя."""
    result = await session.execute(
        select(Bot).where(Bot.user_id == user_id).order_by(Bot.created_at.desc())
    )
    bots = list(result.scalars().all())

    if not bots:
        await message.answer(
            "У вас нет ботов.\n"
            "Создайте бота на платформе: /app"
        )
        return

    for bot in bots:
        # Определяем имя бота из конфига стратегии
        bot_name = "Бот"
        symbol = "N/A"
        timeframe = "N/A"
        if bot.strategy_config is not None:
            cfg = bot.strategy_config
            bot_name = cfg.name or "Бот"
            symbol = cfg.symbol or "N/A"
            timeframe = cfg.timeframe or "N/A"

        text = format_bot_status(
            name=bot_name,
            symbol=symbol,
            timeframe=timeframe,
            status=bot.status,
            pnl=bot.total_pnl or Decimal("0"),
            trades=bot.total_trades or 0,
            win_rate=bot.win_rate or Decimal("0"),
        )
        is_running = bot.status == BotStatus.RUNNING
        await message.answer(
            text,
            reply_markup=bot_control_buttons(str(bot.id), is_running),
        )


@router.message(Command("pnl"))
async def pnl_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Суммарный P&L по всем ботам пользователя."""
    result = await session.execute(
        select(Bot).where(Bot.user_id == user_id)
    )
    bots = list(result.scalars().all())

    if not bots:
        await message.answer("У вас нет ботов. Создайте бота на платформе: /app")
        return

    total_pnl = sum((bot.total_pnl or Decimal("0")) for bot in bots)
    total_trades = sum((bot.total_trades or 0) for bot in bots)
    running = sum(1 for b in bots if b.status == BotStatus.RUNNING)

    emoji = "💰" if total_pnl >= 0 else "📉"
    lines = [
        f"{emoji} <b>P&L сводка</b>",
        "━━━━━━━━━━━━━━━━━",
        f"Всего P&L: {total_pnl:+,.2f} USDT",
        f"Сделок: {total_trades}",
        f"Ботов: {len(bots)} (активных: {running})",
    ]
    await message.answer("\n".join(lines))


@router.message(Command("balance"))
async def balance_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Информация о балансе - предлагает открыть платформу."""
    await message.answer(
        "Актуальный баланс счёта доступен на платформе:",
        reply_markup=webapp_button("Открыть баланс", "/dashboard"),
    )


@router.message(Command("positions"))
async def positions_command(
    message: Message, session: AsyncSession, user_id: uuid.UUID
) -> None:
    """Список открытых позиций всех ботов пользователя."""
    # Получаем ботов пользователя
    bots_result = await session.execute(
        select(Bot.id).where(Bot.user_id == user_id)
    )
    bot_ids = [row[0] for row in bots_result.all()]

    if not bot_ids:
        await message.answer("У вас нет ботов. Создайте бота на платформе: /app")
        return

    positions_result = await session.execute(
        select(Position)
        .where(
            Position.bot_id.in_(bot_ids),
            Position.status == PositionStatus.OPEN,
        )
        .order_by(Position.opened_at.desc())
    )
    positions = list(positions_result.scalars().all())

    if not positions:
        await message.answer("Открытых позиций нет.")
        return

    for pos in positions:
        side_str = pos.side.value.upper()
        pnl = pos.unrealized_pnl or Decimal("0")
        pnl_emoji = "💚" if pnl >= 0 else "🔴"
        text = (
            f"<b>{side_str} {pos.symbol}</b>\n"
            f"Вход: {pos.entry_price:,.4f}\n"
            f"Кол-во: {pos.quantity}\n"
            f"Unrealized P&L: {pnl_emoji} {pnl:+,.2f} USDT"
        )
        await message.answer(
            text,
            reply_markup=position_buttons(str(pos.id)),
        )
