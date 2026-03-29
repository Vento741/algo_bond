"""Воркер торгового бота — Celery task.

Цикл бота:
1. Загрузить конфигурацию (стратегия, exchange account, символ)
2. Получить свечи с Bybit
3. Запустить стратегию → получить сигналы
4. Если есть новый сигнал → разместить ордер
5. Записать сигнал и ордер в БД
6. Управлять SL/TP/trailing для открытых позиций
"""

import logging
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.security import decrypt_value
from app.database import async_session
from app.modules.market.bybit_client import BybitAPIError, BybitClient
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.trading.models import (
    Bot,
    BotMode,
    BotStatus,
    Order,
    OrderSide,
    OrderStatus,
    OrderType,
    Position,
    PositionSide,
    PositionStatus,
    SignalDirection,
    TradeSignal,
)

logger = logging.getLogger(__name__)

# Минимальное количество свечей для работы стратегии (KNN нужно 80+ баров)
MIN_CANDLES = 200


async def run_bot_cycle(
    bot_id: uuid.UUID,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> dict:
    """Один цикл работы бота.

    Args:
        bot_id: ID бота.
        session_factory: Фабрика сессий (для тестов). По умолчанию — production async_session.

    Returns:
        dict с результатом: {"status": "ok"|"no_signal"|"error", ...}
    """
    factory = session_factory or async_session
    async with factory() as db:
        try:
            # 1. Загрузить бота с конфигом и exchange account
            bot = await _load_bot(db, bot_id)
            if not bot:
                return {"status": "error", "message": "Bot not found"}

            if bot.status != BotStatus.RUNNING:
                return {"status": "skipped", "message": f"Bot status: {bot.status.value}"}

            # 2. Создать Bybit клиент с ключами пользователя
            client = _create_client(bot)

            # 3. Получить свечи
            strategy_config = bot.strategy_config
            symbol = strategy_config.symbol
            timeframe = strategy_config.timeframe
            candles = client.get_klines(symbol, timeframe, MIN_CANDLES)

            if len(candles) < MIN_CANDLES:
                logger.warning(
                    "Bot %s: not enough candles (%d/%d)",
                    bot_id, len(candles), MIN_CANDLES,
                )
                return {"status": "error", "message": f"Not enough candles: {len(candles)}"}

            # 4. Конвертировать в OHLCV и запустить стратегию
            arrays = client.klines_to_arrays(candles)
            ohlcv = OHLCV(
                open=arrays["open"],
                high=arrays["high"],
                low=arrays["low"],
                close=arrays["close"],
                volume=arrays["volume"],
                timestamps=arrays["timestamps"],
            )

            strategy = strategy_config.strategy
            config = {**strategy.default_config, **strategy_config.config}
            engine = get_engine(strategy.engine_type, config)
            result = engine.generate_signals(ohlcv)

            # 5. Проверить последний сигнал
            if not result.signals:
                return {"status": "no_signal"}

            latest_signal = result.signals[-1]
            last_bar_idx = len(ohlcv) - 1

            # Сигнал должен быть на последних 2 барах (свежий)
            if latest_signal.bar_index < last_bar_idx - 1:
                return {"status": "no_signal", "message": "Signal too old"}

            # 6. Записать сигнал в БД
            direction = (
                SignalDirection.LONG
                if latest_signal.direction == "long"
                else SignalDirection.SHORT
            )
            knn_class = (
                "BULL"
                if result.knn_classes[-1] == 1
                else "BEAR"
                if result.knn_classes[-1] == -1
                else "NEUTRAL"
            )

            trade_signal = TradeSignal(
                bot_id=bot.id,
                strategy_config_id=strategy_config.id,
                symbol=symbol,
                direction=direction,
                signal_strength=latest_signal.confluence_score,
                knn_class=knn_class,
                knn_confidence=(
                    float(result.knn_scores[-1]) * 100
                    if result.knn_scores[-1]
                    else 50.0
                ),
                indicators_snapshot={
                    "entry_price": latest_signal.entry_price,
                    "stop_loss": latest_signal.stop_loss,
                    "take_profit": latest_signal.take_profit,
                    "signal_type": latest_signal.signal_type,
                    "confluence_long": float(result.confluence_scores_long[-1]),
                    "confluence_short": float(result.confluence_scores_short[-1]),
                },
                was_executed=False,
            )
            db.add(trade_signal)

            # 7. Проверить нет ли уже открытой позиции
            existing_position = await db.execute(
                select(Position).where(
                    Position.bot_id == bot.id,
                    Position.symbol == symbol,
                    Position.status == PositionStatus.OPEN,
                )
            )
            if existing_position.scalar_one_or_none():
                logger.info(
                    "Bot %s: position already open for %s, skipping",
                    bot_id, symbol,
                )
                await db.commit()
                return {"status": "no_signal", "message": "Position already open"}

            # 8. Разместить ордер на Bybit
            side = "Buy" if latest_signal.direction == "long" else "Sell"
            order_link_id = f"ab-{bot.id}-{uuid.uuid4().hex[:8]}"

            try:
                # Установить leverage (1x по умолчанию)
                client.set_leverage(symbol, 1)

                # Получить баланс и рассчитать размер позиции
                balance = client.get_wallet_balance("USDT")
                available = balance["available"]
                symbol_info = client.get_symbol_info(symbol)
                ticker = client.get_ticker(symbol)

                # Размер позиции: order_size% от доступного баланса (из конфига)
                backtest_cfg = config.get("backtest", {})
                order_size_pct = backtest_cfg.get("order_size", 75) / 100
                position_value = available * order_size_pct
                qty = position_value / ticker.last_price

                # Округлить до qty_step
                qty = round(
                    qty // symbol_info.qty_step * symbol_info.qty_step, 8
                )
                if qty < symbol_info.min_qty:
                    logger.warning(
                        "Bot %s: qty %s < min %s",
                        bot_id, qty, symbol_info.min_qty,
                    )
                    await db.commit()
                    return {"status": "error", "message": f"Qty too small: {qty}"}

                bybit_result = client.place_order(
                    symbol=symbol,
                    side=side,
                    order_type="Market",
                    qty=qty,
                    take_profit=latest_signal.take_profit,
                    stop_loss=latest_signal.stop_loss,
                    order_link_id=order_link_id,
                )

                # 9. Записать ордер в БД
                order = Order(
                    bot_id=bot.id,
                    exchange_order_id=bybit_result.get("orderId", ""),
                    symbol=symbol,
                    side=OrderSide.BUY if side == "Buy" else OrderSide.SELL,
                    type=OrderType.MARKET,
                    quantity=qty,
                    price=ticker.last_price,
                    status=OrderStatus.OPEN,
                )
                db.add(order)

                # 10. Записать позицию в БД
                position = Position(
                    bot_id=bot.id,
                    symbol=symbol,
                    side=(
                        PositionSide.LONG
                        if latest_signal.direction == "long"
                        else PositionSide.SHORT
                    ),
                    entry_price=ticker.last_price,
                    quantity=qty,
                    stop_loss=latest_signal.stop_loss,
                    take_profit=latest_signal.take_profit,
                    trailing_stop=latest_signal.trailing_atr,
                    unrealized_pnl=0,
                    status=PositionStatus.OPEN,
                )
                db.add(position)

                # 11. Установить trailing stop если есть
                if latest_signal.trailing_atr:
                    try:
                        active_price = (
                            latest_signal.entry_price + latest_signal.trailing_atr
                            if latest_signal.direction == "long"
                            else latest_signal.entry_price - latest_signal.trailing_atr
                        )
                        client.set_trading_stop(
                            symbol=symbol,
                            trailing_stop=latest_signal.trailing_atr,
                            active_price=active_price,
                        )
                    except BybitAPIError as e:
                        logger.warning(
                            "Bot %s: trailing stop failed: %s",
                            bot_id, e.message,
                        )

                # Обновить сигнал как исполненный
                trade_signal.was_executed = True

                # Обновить статистику бота
                bot.total_trades = (bot.total_trades or 0) + 1

                await db.commit()
                logger.info(
                    "Bot %s: %s %s %s qty=%s price=%s SL=%s TP=%s",
                    bot_id, side, "Market", symbol, qty,
                    ticker.last_price, latest_signal.stop_loss,
                    latest_signal.take_profit,
                )

                return {
                    "status": "ok",
                    "signal": {
                        "direction": latest_signal.direction,
                        "confluence": latest_signal.confluence_score,
                        "type": latest_signal.signal_type,
                    },
                    "order": {
                        "order_id": bybit_result.get("orderId"),
                        "side": side,
                        "qty": qty,
                        "symbol": symbol,
                    },
                }

            except BybitAPIError as e:
                logger.error("Bot %s: Bybit API error: %s", bot_id, e.message)
                await db.commit()
                return {"status": "error", "message": f"Bybit: {e.message}"}

        except Exception as e:
            logger.exception("Bot %s: unexpected error", bot_id)
            # Попытка пометить бота как error
            try:
                bot_result = await db.execute(
                    select(Bot).where(Bot.id == bot_id)
                )
                bot_obj = bot_result.scalar_one_or_none()
                if bot_obj:
                    bot_obj.status = BotStatus.ERROR
                    await db.commit()
            except Exception:
                pass
            return {"status": "error", "message": str(e)}


async def _load_bot(db: AsyncSession, bot_id: uuid.UUID) -> Bot | None:
    """Загрузить бота с eager-загрузкой зависимостей.

    Загружает strategy_config → strategy и exchange_account
    через selectinload для избежания lazy-load в async контексте.
    """
    result = await db.execute(
        select(Bot)
        .options(
            selectinload(Bot.strategy_config).selectinload(
                StrategyConfig.strategy
            ),
            selectinload(Bot.exchange_account),
        )
        .where(Bot.id == bot_id)
    )
    return result.scalar_one_or_none()


def _create_client(bot: Bot) -> BybitClient:
    """Создать BybitClient с ключами пользователя."""
    account = bot.exchange_account
    api_key = decrypt_value(account.api_key_encrypted)
    api_secret = decrypt_value(account.api_secret_encrypted)
    testnet = account.is_testnet or bot.mode == BotMode.DEMO

    return BybitClient(
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
    )
