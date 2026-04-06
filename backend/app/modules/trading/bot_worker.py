"""Воркер торгового бота — Celery task.

Цикл бота:
1. Синхронизировать состояние позиций с биржей
2. Управлять открытыми позициями (multi-TP, breakeven)
3. Получить свечи → запустить стратегию → получить сигналы
4. Если есть новый сигнал → разместить ордер с multi-TP
5. Записать всё в БД
"""

import logging
import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.security import decrypt_value
from app.database import create_standalone_session
from app.modules.market.bybit_client import BybitAPIError, BybitClient
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV
from app.modules.strategy.models import StrategyConfig
from app.modules.trading.models import (
    Bot,
    BotLog,
    BotLogLevel,
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

MIN_CANDLES = 200


async def _log(
    session: AsyncSession, bot_id: uuid.UUID,
    level: str, message: str, details: dict | None = None,
) -> None:
    """Записать лог бота в БД."""
    try:
        session.add(BotLog(
            bot_id=bot_id, level=BotLogLevel(level),
            message=message[:500], details=details,
        ))
        await session.commit()
    except Exception:
        logger.debug("Не удалось записать лог бота %s", bot_id, exc_info=True)


async def run_bot_cycle(
    bot_id: uuid.UUID,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> dict:
    """Один цикл работы бота."""
    factory = session_factory or create_standalone_session()
    async with factory() as db:
        try:
            bot = await _load_bot(db, bot_id)
            if not bot:
                return {"status": "error", "message": "Bot not found"}
            if bot.status != BotStatus.RUNNING:
                return {"status": "skipped", "message": f"Bot status: {bot.status.value}"}

            await _log(db, bot.id, "info", "Цикл бота запущен")

            client = _create_client(bot)
            strategy_config = bot.strategy_config
            symbol = strategy_config.symbol
            timeframe = strategy_config.timeframe
            strategy = strategy_config.strategy
            config = {**strategy.default_config, **strategy_config.config}

            # --- 1. Синхронизация позиций с биржей ---
            await _sync_positions(db, bot, client, symbol, config)

            # --- 2. Управление открытыми позициями (multi-TP, breakeven) ---
            open_position = await _get_open_position(db, bot.id, symbol)
            if open_position:
                await _manage_position(db, bot, client, open_position, config)
                return {"status": "managing", "message": "Position open, managing"}

            # --- 3. Получить свечи и запустить стратегию ---
            candles = client.get_klines(symbol, timeframe, MIN_CANDLES)
            if len(candles) < MIN_CANDLES:
                await _log(db, bot.id, "warn", f"Недостаточно свечей: {len(candles)}/{MIN_CANDLES}")
                return {"status": "error", "message": f"Not enough candles: {len(candles)}"}

            arrays = client.klines_to_arrays(candles)
            ohlcv = OHLCV(
                open=arrays["open"], high=arrays["high"],
                low=arrays["low"], close=arrays["close"],
                volume=arrays["volume"], timestamps=arrays["timestamps"],
            )

            engine = get_engine(strategy.engine_type, config)
            result = engine.generate_signals(ohlcv)

            await _log(db, bot.id, "info", "Стратегия выполнена", {
                "signals_count": len(result.signals),
            })

            # --- 4. Проверить последний сигнал ---
            if not result.signals:
                await _log(db, bot.id, "debug", "Нет сигнала")
                return {"status": "no_signal"}

            latest_signal = result.signals[-1]
            last_bar_idx = len(ohlcv) - 1

            if latest_signal.bar_index < last_bar_idx - 1:
                return {"status": "no_signal", "message": "Signal too old"}

            # --- 5. Записать сигнал ---
            direction = SignalDirection.LONG if latest_signal.direction == "long" else SignalDirection.SHORT
            knn_class = "BULL" if result.knn_classes[-1] == 1 else "BEAR" if result.knn_classes[-1] == -1 else "NEUTRAL"

            trade_signal = TradeSignal(
                bot_id=bot.id, strategy_config_id=strategy_config.id,
                symbol=symbol, direction=direction,
                signal_strength=latest_signal.confluence_score,
                knn_class=knn_class,
                knn_confidence=float(result.knn_scores[-1]) * 100 if result.knn_scores[-1] else 50.0,
                indicators_snapshot={
                    "entry_price": latest_signal.entry_price,
                    "stop_loss": latest_signal.stop_loss,
                    "take_profit": latest_signal.take_profit,
                    "signal_type": latest_signal.signal_type,
                },
                was_executed=False,
            )
            db.add(trade_signal)

            # --- 6. Разместить ордер ---
            return await _place_order(db, bot, client, latest_signal, config, trade_signal, symbol)

        except Exception as e:
            logger.exception("Bot %s: unexpected error", bot_id)
            await _log(db, bot_id, "error", f"Ошибка: {str(e)[:400]}", {"traceback": traceback.format_exc()[-1000:]})
            try:
                await db.execute(update(Bot).where(Bot.id == bot_id).values(status=BotStatus.ERROR))
                await db.commit()
            except Exception:
                pass
            return {"status": "error", "message": str(e)}


# === Position Sync ===

async def _sync_positions(
    db: AsyncSession, bot: Bot, client: BybitClient, symbol: str, config: dict,
) -> None:
    """Синхронизировать позиции с биржей.

    Если биржа показывает что позиция закрыта (size=0) а в БД открыта → закрыть в БД.
    Если биржа показывает частичное закрытие → обновить qty.
    """
    open_positions = await db.execute(
        select(Position).where(
            Position.bot_id == bot.id,
            Position.symbol == symbol,
            Position.status == PositionStatus.OPEN,
        )
    )
    db_positions = open_positions.scalars().all()
    if not db_positions:
        return

    try:
        exchange_positions = client.get_positions(symbol)
    except BybitAPIError as e:
        logger.warning("Bot %s: failed to get positions: %s", bot.id, e.message)
        return

    exchange_size = 0.0
    exchange_entry = 0.0
    exchange_pnl = 0.0
    for ep in exchange_positions:
        exchange_size = float(ep.get("size", "0"))
        exchange_entry = float(ep.get("avgPrice", "0"))
        exchange_pnl = float(ep.get("unrealisedPnl", "0"))

    for pos in db_positions:
        db_qty = float(pos.quantity)

        if exchange_size == 0:
            # Позиция закрыта на бирже (SL/TP/trailing сработал)
            pos.status = PositionStatus.CLOSED
            pos.unrealized_pnl = Decimal("0")

            # Обновить PnL бота
            realized = float(ep.get("cumRealisedPnl", "0")) if exchange_positions else 0.0
            bot.total_pnl = Decimal(str(float(bot.total_pnl or 0) + realized))

            await _log(db, bot.id, "info", f"Позиция закрыта биржей", {
                "symbol": symbol, "realized_pnl": realized,
            })

        elif exchange_size < db_qty * 0.95:
            # Частичное закрытие (TP1 сработал)
            pos.quantity = Decimal(str(exchange_size))
            pos.unrealized_pnl = Decimal(str(exchange_pnl))

            await _log(db, bot.id, "info", f"Частичное закрытие: {db_qty:.4f} → {exchange_size:.4f}", {
                "symbol": symbol,
            })
        else:
            # Позиция без изменений — обновить PnL
            pos.unrealized_pnl = Decimal(str(exchange_pnl))

    await db.commit()


# === Position Management (Multi-TP + Breakeven) ===

async def _manage_position(
    db: AsyncSession, bot: Bot, client: BybitClient,
    position: Position, config: dict,
) -> None:
    """Управление открытой позицией: multi-TP переключение + breakeven.

    Breakeven/TP2 устанавливаются listener'ом мгновенно при TP1.
    Здесь — подстраховка: если listener не успел или упал.
    """
    risk_cfg = config.get("risk", {})
    use_multi_tp = risk_cfg.get("use_multi_tp", False)
    use_breakeven = risk_cfg.get("use_breakeven", False)
    tp_levels = risk_cfg.get("tp_levels", [])

    if not use_multi_tp or not tp_levels:
        return  # Обычный режим — биржа управляет TP/SL

    symbol = position.symbol
    entry_price = float(position.entry_price)

    # Определить: был ли TP1 (listener ставит original_quantity при partial close)
    if not position.original_quantity:
        return  # TP1 ещё не сработал
    if float(position.quantity) >= float(position.original_quantity) * 0.95:
        return  # Нет реального уменьшения

    # TP1 сработал. Проверить, установлен ли уже breakeven (SL ≈ entry_price)
    current_sl = float(position.stop_loss or 0)
    breakeven_set = abs(current_sl - entry_price) < entry_price * 0.005  # ~0.5% tolerance

    try:
        sym_info = client.get_symbol_info(symbol)
    except BybitAPIError:
        sym_info = None

    if use_breakeven and not breakeven_set:
        # Listener не успел → установить breakeven
        try:
            tick = sym_info.tick_size if sym_info else 0.001
            entry_price = _round_price(entry_price, tick)
            client.set_trading_stop(symbol=symbol, stop_loss=entry_price)
            position.stop_loss = Decimal(str(entry_price))
            await _log(db, bot.id, "info", f"Breakeven (backup): SL = {entry_price}", {
                "symbol": symbol,
            })
        except BybitAPIError as e:
            logger.warning("Bot %s: breakeven failed: %s", bot.id, e.message)

    # Проверить, установлен ли TP2 (take_profit > 0 и отличается от оригинала)
    current_tp = float(position.take_profit or 0)
    if current_tp <= 0 and len(tp_levels) >= 2:
        # TP2 не выставлен → установить
        try:
            candles = client.get_klines(symbol, "15", 20)
            if candles and len(candles) >= 14:
                highs = [c["high"] for c in candles[-14:]]
                lows = [c["low"] for c in candles[-14:]]
                closes = [c["close"] for c in candles[-14:]]
                tr_vals = [
                    max(h - l, abs(h - closes[max(0, i - 1)]), abs(l - closes[max(0, i - 1)]))
                    for i, (h, l) in enumerate(zip(highs, lows))
                ]
                atr = sum(tr_vals) / len(tr_vals)

                tp2_mult = tp_levels[1]["atr_mult"]
                if position.side == PositionSide.LONG:
                    tp2_price = entry_price + atr * tp2_mult
                else:
                    tp2_price = entry_price - atr * tp2_mult

                tick = sym_info.tick_size if sym_info else 0.001
                tp2_price = _round_price(tp2_price, tick)
                client.set_trading_stop(symbol=symbol, take_profit=tp2_price)
                position.take_profit = Decimal(str(round(tp2_price, 6)))
                await _log(db, bot.id, "info", f"TP2 (backup): {tp2_price:.4f}", {
                    "symbol": symbol, "atr": atr,
                })
        except Exception as e:
            logger.warning("Bot %s: TP2 setup failed: %s", bot.id, e)

    await db.commit()


# === Helpers ===


def _round_price(price: float, tick_size: float) -> float:
    """Округлить цену до tick_size символа (требование Bybit)."""
    if tick_size <= 0:
        return round(price, 8)
    return round(round(price / tick_size) * tick_size, 8)


# === Order Placement ===

async def _place_order(
    db: AsyncSession, bot: Bot, client: BybitClient,
    signal, config: dict, trade_signal: TradeSignal, symbol: str,
) -> dict:
    """Разместить ордер с поддержкой multi-TP."""
    side = "Buy" if signal.direction == "long" else "Sell"
    order_link_id = f"ab{uuid.uuid4().hex[:12]}"

    risk_cfg = config.get("risk", {})
    use_multi_tp = risk_cfg.get("use_multi_tp", False)
    use_breakeven = risk_cfg.get("use_breakeven", False)
    tp_levels = risk_cfg.get("tp_levels", [])

    # Получить параметры для размера позиции
    live_cfg = config.get("live", config.get("backtest", {}))
    order_size_pct = live_cfg.get("order_size", 75) / 100
    leverage = live_cfg.get("leverage", 1)

    try:
        client.set_leverage(symbol, leverage)

        balance = client.get_wallet_balance("USDT")
        available = balance["available"]
        symbol_info = client.get_symbol_info(symbol)
        ticker = client.get_ticker(symbol)

        # order_size_pct = % баланса как маржа, leverage умножает позицию
        # Пример: 30% маржа * 10x = позиция на 300% от available
        margin_value = available * order_size_pct
        position_value = margin_value * leverage
        qty = position_value / ticker.last_price
        qty = round(qty // symbol_info.qty_step * symbol_info.qty_step, 8)

        if qty < symbol_info.min_qty:
            await _log(db, bot.id, "warn", f"Объём мал: {qty} < {symbol_info.min_qty}")
            await db.commit()
            return {"status": "error", "message": f"Qty too small: {qty}"}

        if qty > symbol_info.max_qty:
            qty = round(symbol_info.max_qty // symbol_info.qty_step * symbol_info.qty_step, 8)

        # Валидация SL — позиция без SL запрещена
        if not signal.stop_loss or float(signal.stop_loss) <= 0:
            await _log(db, bot.id, "error", "Сигнал без SL — ордер отклонён")
            await db.commit()
            return {"status": "error", "message": "Signal has no stop_loss"}

        tick = symbol_info.tick_size

        # Определить TP для ордера
        order_tp = None
        order_sl = _round_price(float(signal.stop_loss), tick)

        if use_multi_tp and tp_levels and signal.tp_levels:
            # Multi-TP: НЕ ставим SL/TP на ордер — избегаем tpslMode Full→Partial конфликт.
            # Всё устанавливается через set_trading_stop после fill.
            order_tp = None
            order_sl_for_order = None
        else:
            # Обычный режим: один TP + SL на ордере (tpslMode=Full)
            order_tp = _round_price(float(signal.take_profit), tick) if signal.take_profit else None
            order_sl_for_order = order_sl

        bybit_result = client.place_order(
            symbol=symbol, side=side, order_type="Market",
            qty=qty, take_profit=order_tp, stop_loss=order_sl_for_order,
            order_link_id=order_link_id,
        )

        # Записать ордер (market order исполняется мгновенно)
        order = Order(
            bot_id=bot.id, exchange_order_id=bybit_result.get("orderId", ""),
            symbol=symbol,
            side=OrderSide.BUY if side == "Buy" else OrderSide.SELL,
            type=OrderType.MARKET, quantity=qty,
            price=ticker.last_price, status=OrderStatus.FILLED,
            filled_price=ticker.last_price,
            filled_at=datetime.now(timezone.utc),
        )
        db.add(order)

        # Записать позицию
        position = Position(
            bot_id=bot.id, symbol=symbol,
            side=PositionSide.LONG if signal.direction == "long" else PositionSide.SHORT,
            entry_price=ticker.last_price, quantity=qty,
            original_quantity=qty,
            stop_loss=signal.stop_loss, take_profit=signal.take_profit,
            trailing_stop=signal.trailing_atr,
            unrealized_pnl=0, status=PositionStatus.OPEN,
            current_price=ticker.last_price,
            max_price=ticker.last_price,
            min_price=ticker.last_price,
        )
        db.add(position)

        # Установить trailing stop
        if signal.trailing_atr:
            try:
                active_price = _round_price(
                    float(signal.entry_price) + signal.trailing_atr
                    if signal.direction == "long"
                    else float(signal.entry_price) - signal.trailing_atr,
                    tick,
                )
                client.set_trading_stop(
                    symbol=symbol,
                    trailing_stop=round(signal.trailing_atr, 8),
                    active_price=active_price,
                )
            except BybitAPIError as e:
                logger.warning("Bot %s: trailing stop failed: %s", bot.id, e.message)

        # Установить multi-TP (partial TP1 + SL через set_trading_stop)
        if use_multi_tp and tp_levels and signal.tp_levels:
            try:
                tp1 = signal.tp_levels[0]
                tp1_atr_dist = tp1["atr_mult"]
                tp1_close_pct = tp1["close_pct"]
                tp1_qty = round(qty * tp1_close_pct / 100, 8)
                tp1_qty = round(tp1_qty // symbol_info.qty_step * symbol_info.qty_step, 8)

                if signal.direction == "long":
                    tp1_price = _round_price(float(ticker.last_price) + tp1_atr_dist, tick)
                else:
                    tp1_price = _round_price(float(ticker.last_price) - tp1_atr_dist, tick)

                # Рассчитать TP2 для сохранения (если есть)
                tp2_price = None
                if len(tp_levels) >= 2:
                    tp2_atr_dist = tp_levels[1]["atr_mult"]
                    if hasattr(signal, "tp_levels") and signal.tp_levels and len(signal.tp_levels) >= 2:
                        tp2_atr_dist = signal.tp_levels[1]["atr_mult"]
                    if signal.direction == "long":
                        tp2_price = _round_price(float(ticker.last_price) + tp2_atr_dist, tick)
                    else:
                        tp2_price = _round_price(float(ticker.last_price) - tp2_atr_dist, tick)

                # Сохранить TP1/TP2 цены в сигнал для фронтенда
                trade_signal.indicators_snapshot["tp1_price"] = round(tp1_price, 6)
                trade_signal.indicators_snapshot["tp1_qty"] = tp1_qty
                trade_signal.indicators_snapshot["tp1_pct"] = tp1_close_pct
                if tp2_price:
                    trade_signal.indicators_snapshot["tp2_price"] = round(tp2_price, 6)

                # Установить TP1 (Partial) + SL (Partial) единым вызовом
                # Избегаем конфликта tpslMode: ордер без SL/TP, всё через Partial
                client.set_trading_stop(
                    symbol=symbol,
                    take_profit=tp1_price,
                    stop_loss=float(order_sl),
                    tpsl_mode="Partial",
                    tp_size=tp1_qty,
                    sl_size=qty,  # SL на весь объём
                )
                await _log(db, bot.id, "info", f"Multi-TP1: {tp1_price:.4f} qty={tp1_qty} SL: {order_sl}", {
                    "tp1_pct": tp1_close_pct,
                })
            except BybitAPIError as e:
                # Fallback: установить хотя бы SL Full если Partial не сработал
                logger.warning("Bot %s: multi-TP1 failed: %s, fallback to Full SL", bot.id, e.message)
                try:
                    client.set_trading_stop(
                        symbol=symbol,
                        stop_loss=float(order_sl),
                        tpsl_mode="Full",
                    )
                except BybitAPIError as e2:
                    logger.error("Bot %s: CRITICAL - SL fallback also failed: %s", bot.id, e2.message)

        trade_signal.was_executed = True
        bot.total_trades = (bot.total_trades or 0) + 1
        await db.commit()

        await _log(db, bot.id, "info", f"Ордер: {side} {qty} {symbol}", {
            "order_id": bybit_result.get("orderId"),
            "price": float(ticker.last_price),
            "stop_loss": float(signal.stop_loss),
            "multi_tp": use_multi_tp,
        })

        return {
            "status": "ok",
            "signal": {"direction": signal.direction, "confluence": signal.confluence_score},
            "order": {"order_id": bybit_result.get("orderId"), "side": side, "qty": qty, "symbol": symbol},
        }

    except BybitAPIError as e:
        logger.error("Bot %s: Bybit API error: %s", bot.id, e.message)
        await _log(db, bot.id, "error", f"Ошибка Bybit: {e.message}")
        await db.commit()
        return {"status": "error", "message": f"Bybit: {e.message}"}


# === Helpers ===

async def _get_open_position(db: AsyncSession, bot_id: uuid.UUID, symbol: str) -> Position | None:
    """Получить открытую позицию для символа."""
    result = await db.execute(
        select(Position).where(
            Position.bot_id == bot_id,
            Position.symbol == symbol,
            Position.status == PositionStatus.OPEN,
        )
    )
    return result.scalar_one_or_none()


async def _load_bot(db: AsyncSession, bot_id: uuid.UUID) -> Bot | None:
    """Загрузить бота с eager-загрузкой зависимостей."""
    result = await db.execute(
        select(Bot)
        .options(
            selectinload(Bot.strategy_config).selectinload(StrategyConfig.strategy),
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
    demo = account.is_testnet or bot.mode == BotMode.DEMO
    return BybitClient(api_key=api_key, api_secret=api_secret, demo=demo)
