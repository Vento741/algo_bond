"""Celery задачи для Telegram: дневной P&L отчет и предупреждения о марже."""

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal

from app.celery_app import celery

logger = logging.getLogger(__name__)


def _import_all_models() -> None:
    """Импорт всех моделей для резолва SQLAlchemy relationships."""
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.notifications.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.telegram.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401


@celery.task(name="telegram.send_daily_pnl_report")
def send_daily_pnl_report_task() -> dict:
    """Дневной P&L отчет в Telegram (запускается в 23:55 UTC)."""
    _import_all_models()
    return asyncio.run(_send_daily_pnl_report())


@celery.task(name="telegram.check_margin_warnings")
def check_margin_warnings_task() -> dict:
    """Проверка маржи по активным ботам (каждые 5 минут)."""
    _import_all_models()
    return asyncio.run(_check_margin_warnings())


async def _send_daily_pnl_report() -> dict:
    """Async реализация дневного P&L отчета."""
    from sqlalchemy import and_, select

    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode

    from app.config import settings
    from app.database import create_standalone_session
    from app.modules.notifications.models import NotificationPreference
    from app.modules.telegram.formatters import format_daily_report
    from app.modules.telegram.models import TelegramLink
    from app.modules.trading.models import Bot as TradingBot, BotStatus, Position, PositionStatus

    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан, пропуск дневного отчета")
        return {"sent": 0, "skipped": 0, "error": "no_token"}

    session_factory = create_standalone_session()
    sent = 0
    skipped = 0
    errors = 0

    async with session_factory() as session:
        # Получаем всех пользователей с включенным telegram
        result = await session.execute(
            select(NotificationPreference.user_id)
            .where(NotificationPreference.telegram_enabled.is_(True))
        )
        user_ids = list(result.scalars().all())

        if not user_ids:
            return {"sent": 0, "skipped": 0}

        # Начало сегодняшнего дня UTC
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        async with Bot(
            token=settings.telegram_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        ) as temp_bot:
            for user_id in user_ids:
                # Проверяем наличие TelegramLink
                link_result = await session.execute(
                    select(TelegramLink).where(
                        and_(
                            TelegramLink.user_id == user_id,
                            TelegramLink.is_active.is_(True),
                        )
                    )
                )
                link = link_result.scalar_one_or_none()
                if link is None:
                    skipped += 1
                    continue

                # Получаем закрытые позиции за сегодня
                positions_result = await session.execute(
                    select(Position).where(
                        and_(
                            Position.status == PositionStatus.CLOSED,
                            Position.closed_at >= today_start,
                        )
                    ).join(TradingBot, TradingBot.id == Position.bot_id)
                    .where(TradingBot.user_id == user_id)
                )
                positions = list(positions_result.scalars().all())

                trades_count = len(positions)
                if trades_count == 0:
                    # Нет сделок за день, но отчет все равно отправляем
                    text = format_daily_report(
                        total_pnl=Decimal("0"),
                        trades_count=0,
                        wins=0,
                        losses=0,
                        best_trade="-",
                        best_pnl=Decimal("0"),
                        worst_trade="-",
                        worst_pnl=Decimal("0"),
                        balance=Decimal("0"),
                    )
                else:
                    total_pnl = sum(
                        (p.realized_pnl or Decimal("0")) for p in positions
                    )
                    wins = sum(1 for p in positions if (p.realized_pnl or Decimal("0")) > 0)
                    losses = trades_count - wins

                    best_pos = max(positions, key=lambda p: p.realized_pnl or Decimal("0"))
                    worst_pos = min(positions, key=lambda p: p.realized_pnl or Decimal("0"))

                    text = format_daily_report(
                        total_pnl=Decimal(str(total_pnl)),
                        trades_count=trades_count,
                        wins=wins,
                        losses=losses,
                        best_trade=best_pos.symbol,
                        best_pnl=Decimal(str(best_pos.realized_pnl or 0)),
                        worst_trade=worst_pos.symbol,
                        worst_pnl=Decimal(str(worst_pos.realized_pnl or 0)),
                        balance=Decimal("0"),  # баланс не критичен для отчета
                    )

                try:
                    await temp_bot.send_message(chat_id=link.chat_id, text=text)
                    sent += 1
                except Exception as e:
                    logger.error(
                        "Ошибка отправки дневного отчета пользователю %s: %s",
                        user_id, e,
                    )
                    errors += 1

    logger.info("Дневной P&L отчет: sent=%d, skipped=%d, errors=%d", sent, skipped, errors)
    return {"sent": sent, "skipped": skipped, "errors": errors}


async def _check_margin_warnings() -> dict:
    """Async реализация проверки маржи и отправки предупреждений."""
    import asyncio as _asyncio

    from sqlalchemy import and_, select

    import redis as sync_redis

    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode

    from app.config import settings
    from app.core.security import decrypt_value
    from app.database import create_standalone_session
    from app.modules.auth.models import ExchangeAccount
    from app.modules.market.bybit_client import BybitClient
    from app.modules.notifications.models import NotificationPreference
    from app.modules.telegram.formatters import format_margin_warning
    from app.modules.telegram.models import TelegramLink
    from app.modules.trading.models import Bot as TradingBot, BotStatus

    MARGIN_THRESHOLD = 80.0
    WARNING_COOLDOWN_SECONDS = 3600  # не спамим чаще раза в час

    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан, пропуск проверки маржи")
        return {"checked": 0, "warned": 0, "error": "no_token"}

    session_factory = create_standalone_session()
    checked = 0
    warned = 0
    errors = 0

    # Redis для отслеживания времени последнего предупреждения
    try:
        redis_client = sync_redis.from_url(settings.redis_url)
    except Exception as e:
        logger.error("Не удалось подключиться к Redis: %s", e)
        return {"checked": 0, "warned": 0, "error": "redis_unavailable"}

    async with session_factory() as session:
        # Пользователи с telegram_enabled и активными ботами
        result = await session.execute(
            select(NotificationPreference.user_id)
            .where(NotificationPreference.telegram_enabled.is_(True))
            .join(
                TradingBot,
                and_(
                    TradingBot.user_id == NotificationPreference.user_id,
                    TradingBot.status == BotStatus.RUNNING,
                )
            )
            .distinct()
        )
        user_ids = list(result.scalars().all())

        if not user_ids:
            redis_client.close()
            return {"checked": 0, "warned": 0}

        async with Bot(
            token=settings.telegram_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        ) as temp_bot:
            for user_id in user_ids:
                # Проверяем TelegramLink
                link_result = await session.execute(
                    select(TelegramLink).where(
                        and_(
                            TelegramLink.user_id == user_id,
                            TelegramLink.is_active.is_(True),
                        )
                    )
                )
                link = link_result.scalar_one_or_none()
                if link is None:
                    continue

                # Проверяем cooldown через Redis
                redis_key = f"telegram:margin_warning:{user_id}"
                if redis_client.exists(redis_key):
                    continue

                # Получаем активный exchange account
                account_result = await session.execute(
                    select(ExchangeAccount).where(
                        and_(
                            ExchangeAccount.user_id == user_id,
                            ExchangeAccount.is_active.is_(True),
                        )
                    )
                    .order_by(ExchangeAccount.is_testnet.asc())
                    .limit(1)
                )
                account = account_result.scalar_one_or_none()
                if account is None:
                    continue

                checked += 1

                try:
                    api_key = decrypt_value(account.api_key_encrypted)
                    api_secret = decrypt_value(account.api_secret_encrypted)
                    client = BybitClient(
                        api_key=api_key,
                        api_secret=api_secret,
                        demo=account.is_testnet,
                    )

                    balance_data = await _asyncio.to_thread(
                        client.get_wallet_balance, "USDT"
                    )

                    wallet_balance = Decimal(str(balance_data.get("wallet_balance", 0)))
                    available = Decimal(str(balance_data.get("available", 0)))

                    if wallet_balance <= 0:
                        continue

                    # Использованная маржа = баланс - доступные средства
                    used_margin = max(Decimal("0"), wallet_balance - available)
                    margin_pct = float(used_margin / wallet_balance * 100)

                    if margin_pct >= MARGIN_THRESHOLD:
                        text = format_margin_warning(
                            margin_pct=Decimal(str(margin_pct)),
                            balance=wallet_balance,
                            used_margin=used_margin,
                        )
                        await temp_bot.send_message(chat_id=link.chat_id, text=text)

                        # Ставим cooldown на 1 час
                        redis_client.set(redis_key, "1", ex=WARNING_COOLDOWN_SECONDS)
                        warned += 1

                except Exception as e:
                    logger.error(
                        "Ошибка проверки маржи для пользователя %s: %s",
                        user_id, e,
                    )
                    errors += 1

    try:
        redis_client.close()
    except Exception:
        pass

    logger.info("Проверка маржи: checked=%d, warned=%d, errors=%d", checked, warned, errors)
    return {"checked": checked, "warned": warned, "errors": errors}
