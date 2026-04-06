"""Бизнес-логика модуля trading."""

import asyncio
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.core.security import decrypt_value
from app.modules.auth.models import ExchangeAccount
from app.modules.market.bybit_client import BybitClient
from app.modules.trading.models import Bot, BotLog, BotMode, BotStatus, Order, Position, PositionStatus, TradeSignal
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

    async def delete_bot(self, bot_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Удалить бота (только если остановлен). Каскадно удалит ордера, позиции, сигналы, логи."""
        bot = await self.get_bot(bot_id, user_id)
        if bot.status == BotStatus.RUNNING:
            from app.core.exceptions import ForbiddenException
            raise ForbiddenException("Нельзя удалить работающего бота. Сначала остановите.")
        await self.db.delete(bot)
        await self.db.commit()

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

    # === Bot Logs ===

    async def get_bot_logs(
        self, bot_id: uuid.UUID, user_id: uuid.UUID,
        limit: int = 100, offset: int = 0,
    ) -> list[BotLog]:
        """Получить логи бота (проверяя владельца)."""
        await self.get_bot(bot_id, user_id)
        result = await self.db.execute(
            select(BotLog)
            .where(BotLog.bot_id == bot_id)
            .order_by(BotLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    # === Balance ===

    async def get_user_balance(self, user_id: uuid.UUID) -> dict | None:
        """Получить баланс USDT с Bybit для активного live-аккаунта пользователя.

        Ищет первый активный не-demo аккаунт. Если таких нет - первый активный demo.
        Возвращает None если у пользователя нет привязанных аккаунтов.
        """
        result = await self.db.execute(
            select(ExchangeAccount)
            .where(
                ExchangeAccount.user_id == user_id,
                ExchangeAccount.is_active.is_(True),
            )
            .order_by(ExchangeAccount.is_testnet.asc())  # live первые
        )
        accounts = list(result.scalars().all())
        if not accounts:
            return None

        account = accounts[0]
        api_key = decrypt_value(account.api_key_encrypted)
        api_secret = decrypt_value(account.api_secret_encrypted)
        client = BybitClient(api_key=api_key, api_secret=api_secret, demo=account.is_testnet)

        balance = await asyncio.to_thread(client.get_wallet_balance, "USDT")
        return {
            "equity": balance["equity"],
            "available": balance["available"],
            "unrealized_pnl": balance["unrealized_pnl"],
            "wallet_balance": balance["wallet_balance"],
            "is_demo": account.is_testnet,
            "account_label": account.label,
        }

    # === Reconciliation ===

    def _create_client(self, bot: Bot) -> BybitClient:
        """Создать BybitClient с ключами пользователя."""
        account = bot.exchange_account
        api_key = decrypt_value(account.api_key_encrypted)
        api_secret = decrypt_value(account.api_secret_encrypted)
        demo = account.is_testnet or bot.mode == BotMode.DEMO
        return BybitClient(api_key=api_key, api_secret=api_secret, demo=demo)

    async def reconcile_bot_pnl(
        self, bot_id: uuid.UUID, user_id: uuid.UUID,
    ) -> dict:
        """Сверка P&L бота с данными Bybit. Обновляет расхождения."""
        bot = await self.get_bot(bot_id, user_id)
        client = self._create_client(bot)

        symbol = bot.strategy_config.symbol
        bybit_records = await asyncio.to_thread(
            client.get_closed_pnl, symbol, limit=100,
        )

        result = await self.db.execute(
            select(Position).where(
                Position.bot_id == bot_id,
                Position.status == PositionStatus.CLOSED,
            ).order_by(Position.opened_at)
        )
        db_positions = list(result.scalars().all())

        # Группировать Bybit записи по entry_price для матчинга
        # Bybit V5 API: поле avgEntryPrice (не entryPrice)
        # Округляем до 3 знаков — DB хранит float64 precision (15.381999999...)
        # а Bybit возвращает "15.382"
        def _round_key(val: str | Decimal) -> str:
            return str(round(float(val), 3))

        bybit_by_entry: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for rec in bybit_records:
            raw_entry = rec.get("avgEntryPrice") or rec.get("entryPrice", "0")
            entry_key = _round_key(raw_entry)
            bybit_by_entry[entry_key] += Decimal(rec["closedPnl"])

        corrections: list[dict] = []
        for pos in db_positions:
            entry_key = _round_key(pos.entry_price)
            if entry_key in bybit_by_entry:
                bybit_total = bybit_by_entry[entry_key]
                db_pnl = pos.realized_pnl or Decimal("0")
                diff = bybit_total - db_pnl
                if abs(diff) > Decimal("0.01"):
                    corrections.append({
                        "position_id": str(pos.id),
                        "entry_price": entry_key,
                        "db_pnl": str(db_pnl),
                        "bybit_pnl": str(bybit_total),
                        "diff": str(diff),
                    })
                    pos.realized_pnl = bybit_total

        if corrections:
            total = sum(
                (p.realized_pnl or Decimal("0"))
                for p in db_positions
            )
            bot.total_pnl = total

            wins = sum(1 for p in db_positions if (p.realized_pnl or Decimal("0")) > 0)
            bot.win_rate = (
                Decimal(str(round(wins / len(db_positions) * 100, 2)))
                if db_positions
                else Decimal("0")
            )

            if total > bot.max_pnl:
                bot.max_pnl = total

            await self.db.commit()

        return {
            "bot_id": str(bot_id),
            "positions_checked": len(db_positions),
            "bybit_records": len(bybit_records),
            "corrections": corrections,
            "new_total_pnl": str(bot.total_pnl),
        }
