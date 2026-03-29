"""Бизнес-логика модуля trading."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.modules.trading.models import Bot, BotStatus, Order, Position, TradeSignal
from app.modules.trading.schemas import BotCreate


class TradingService:
    """Сервис торговых ботов, ордеров, позиций и сигналов."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # === Bots ===

    async def create_bot(self, user_id: uuid.UUID, data: BotCreate) -> Bot:
        """Создать торгового бота."""
        bot = Bot(
            user_id=user_id,
            strategy_config_id=data.strategy_config_id,
            exchange_account_id=data.exchange_account_id,
            mode=data.mode,
        )
        self.db.add(bot)
        await self.db.flush()
        await self.db.commit()
        return bot

    async def get_bot(self, bot_id: uuid.UUID, user_id: uuid.UUID) -> Bot:
        """Получить бота по ID (только своего)."""
        result = await self.db.execute(
            select(Bot).where(Bot.id == bot_id, Bot.user_id == user_id)
        )
        bot = result.scalar_one_or_none()
        if not bot:
            raise NotFoundException("Бот не найден")
        return bot

    async def list_user_bots(
        self, user_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> list[Bot]:
        """Список ботов пользователя."""
        result = await self.db.execute(
            select(Bot)
            .where(Bot.user_id == user_id)
            .order_by(Bot.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def start_bot(self, bot_id: uuid.UUID, user_id: uuid.UUID) -> Bot:
        """Запустить бота (status=running, started_at=now)."""
        bot = await self.get_bot(bot_id, user_id)
        bot.status = BotStatus.RUNNING
        bot.started_at = datetime.now(timezone.utc)
        bot.stopped_at = None
        await self.db.flush()
        await self.db.commit()
        return bot

    async def stop_bot(self, bot_id: uuid.UUID, user_id: uuid.UUID) -> Bot:
        """Остановить бота (status=stopped, stopped_at=now)."""
        bot = await self.get_bot(bot_id, user_id)
        bot.status = BotStatus.STOPPED
        bot.stopped_at = datetime.now(timezone.utc)
        await self.db.flush()
        await self.db.commit()
        return bot

    # === Orders ===

    async def get_bot_orders(
        self, bot_id: uuid.UUID, user_id: uuid.UUID,
        limit: int = 50, offset: int = 0,
    ) -> list[Order]:
        """Список ордеров бота (проверяя владельца)."""
        await self.get_bot(bot_id, user_id)
        result = await self.db.execute(
            select(Order)
            .where(Order.bot_id == bot_id)
            .order_by(Order.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    # === Positions ===

    async def get_bot_positions(
        self, bot_id: uuid.UUID, user_id: uuid.UUID,
        limit: int = 50, offset: int = 0,
    ) -> list[Position]:
        """Список позиций бота (проверяя владельца)."""
        await self.get_bot(bot_id, user_id)
        result = await self.db.execute(
            select(Position)
            .where(Position.bot_id == bot_id)
            .order_by(Position.opened_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    # === Trade Signals ===

    async def get_bot_signals(
        self, bot_id: uuid.UUID, user_id: uuid.UUID,
        limit: int = 50, offset: int = 0,
    ) -> list[TradeSignal]:
        """Список торговых сигналов бота (проверяя владельца)."""
        await self.get_bot(bot_id, user_id)
        result = await self.db.execute(
            select(TradeSignal)
            .where(TradeSignal.bot_id == bot_id)
            .order_by(TradeSignal.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())
