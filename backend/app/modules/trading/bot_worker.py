"""Воркер торгового бота -- Celery task.

Цикл бота:
1. Синхронизировать состояние позиций с биржей
2. Получить свечи -> проверить новую свечу (smart skip через Redis)
3. Запустить стратегию (ВСЕГДА при новой свече, даже с открытой позицией)
4. Управлять открытыми позициями (multi-TP, breakeven)
5. Если есть новый сигнал и нет позиции -> разместить ордер с multi-TP
6. Записать все в БД
"""

import logging
import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import numpy as np

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.security import decrypt_value
from app.database import create_standalone_session
from app.modules.market.bybit_client import BybitAPIError, BybitClient
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV
from app.modules.strategy.engines.indicators.trend import atr as calc_atr
from app.redis import get_redis
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

# Маппинг строки таймфрейма в секунды
_TIMEFRAME_SECONDS: dict[str, int] = {
    "1": 60, "3": 180, "5": 300, "15": 900,
    "30": 1800, "60": 3600, "120": 7200,
    "240": 14400, "360": 21600, "720": 43200,
    "D": 86400, "W": 604800,
}


def _timeframe_to_seconds(timeframe: str) -> int:
    """Конвертировать строку таймфрейма в секунды."""
    if timeframe in _TIMEFRAME_SECONDS:
        return _TIMEFRAME_SECONDS[timeframe]
    try:
        return int(timeframe) * 60
    except ValueError:
        return 900  # fallback: 15 минут


async def _check_new_candle(
    bot_id: uuid.UUID, last_candle_timestamp: float, timeframe: str,
) -> bool:
    """Проверить через Redis, появилась ли новая свеча.

    Возвращает True если свеча новая (или первый запуск).
    Обновляет Redis-ключ при новой свече.
    """
    try:
        redis = get_redis()
    except Exception:
        logger.debug("Не удалось создать Redis-клиент для smart skip", exc_info=True)
        return True

    try:
        key = f"bot:{bot_id}:last_candle"
        prev = await redis.get(key)
        current = str(int(last_candle_timestamp))

        # redis.get() возвращает bytes - декодируем для сравнения
        if prev is not None and prev.decode("utf-8") == current:
            return False

        ttl = 2 * _timeframe_to_seconds(timeframe)
        await redis.set(key, current, ex=ttl)
        return True
    except Exception:
        logger.debug("Redis недоступен для smart skip, выполняем полный цикл", exc_info=True)
        return True
    finally:
        await redis.aclose()


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
    """Один цикл работы бота.

    Smart cycle: beat каждую минуту, но полный цикл стратегии только при новой свече.
    Без новой свечи: manage позицию (если есть) или skip (без лога).
    """
    factory = session_factory or create_standalone_session()
    async with factory() as db:
        try:
            bot = await _load_bot(db, bot_id)
            if not bot:
                return {"status": "error", "message": "Bot not found"}
            if bot.status != BotStatus.RUNNING:
                return {"status": "skipped", "message": f"Bot status: {bot.status.value}"}

            client = _create_client(bot)
            strategy_config = bot.strategy_config
            symbol = strategy_config.symbol
            timeframe = strategy_config.timeframe
            strategy = strategy_config.strategy
            config = {**strategy.default_config, **strategy_config.config}

            # --- 1. Синхронизация позиций с биржей ---
            await _sync_positions(db, bot, client, symbol, config)

            # --- 2. Получить свечи ---
            candles = client.get_klines(symbol, timeframe, MIN_CANDLES)
            if len(candles) < MIN_CANDLES:
                await _log(db, bot.id, "warn", f"Недостаточно свечей: {len(candles)}/{MIN_CANDLES}")
                return {"status": "error", "message": f"Not enough candles: {len(candles)}"}

            # --- 3. Smart skip: проверить новую свечу через Redis ---
            last_candle_time = candles[-1]["timestamp"]
            has_new_candle = await _check_new_candle(bot.id, last_candle_time, timeframe)
            open_position = await _get_open_position(db, bot.id, symbol)

            if not has_new_candle:
                if open_position:
                    # Нет новой свечи, но есть позиция - только manage
                    await _manage_position(db, bot, client, open_position, config, timeframe)
                    return {"status": "managing", "message": "No new candle, managing position"}
                # Нет новой свечи, нет позиции - тихий skip
                return {"status": "skipped", "message": "No new candle"}

            # --- 4. Новая свеча - полный цикл стратегии ---
            candle_time = datetime.fromtimestamp(
                last_candle_time / 1000, tz=timezone.utc
            ).strftime("%H:%M")
            await _log(db, bot.id, "info", f"Новая свеча {candle_time}, запуск стратегии")

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

            # --- 5. Управление открытой позицией (если есть) ---
            if open_position:
                # Проверить: есть ли свежий сигнал в противоположном направлении?
                reverse_result = await _check_reverse_signal(
                    db, bot, client, open_position, result, ohlcv, config, symbol, timeframe,
                )
                if reverse_result:
                    return reverse_result
                # Нет реверса - обычное управление позицией
                await _manage_position(db, bot, client, open_position, config, timeframe)
                return {"status": "managing", "message": "Position open, managing"}

            # --- 6. Проверить последний сигнал ---
            if not result.signals:
                await _log(db, bot.id, "debug", "Нет сигнала")
                return {"status": "no_signal"}

            latest_signal = result.signals[-1]
            last_bar_idx = len(ohlcv) - 1

            if latest_signal.bar_index < last_bar_idx - 1:
                await _log(db, bot.id, "debug",
                           f"Сигнал устарел: bar {latest_signal.bar_index} < {last_bar_idx - 1}")
                return {"status": "no_signal", "message": "Signal too old"}

            # --- 7. Записать сигнал ---
            direction = SignalDirection.LONG if latest_signal.direction == "long" else SignalDirection.SHORT
            knn_class = "BULL" if result.knn_classes[-1] == 1 else "BEAR" if result.knn_classes[-1] == -1 else "NEUTRAL"

            trade_signal = TradeSignal(
                bot_id=bot.id, strategy_config_id=strategy_config.id,
                symbol=symbol, direction=direction,
                signal_strength=latest_signal.confluence_score,
                knn_class=knn_class,
                knn_confidence=float(result.knn_confidence[-1]) if len(result.knn_confidence) > 0 else 50.0,
                indicators_snapshot={
                    "entry_price": latest_signal.entry_price,
                    "stop_loss": latest_signal.stop_loss,
                    "take_profit": latest_signal.take_profit,
                    "signal_type": latest_signal.signal_type,
                    **(latest_signal.indicators or {}),
                },
                was_executed=False,
            )
            db.add(trade_signal)

            # --- 8. Разместить ордер ---
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

    Если биржа показывает что позиция закрыта (size=0) а в БД открыта -> закрыть в БД.
    Если биржа показывает частичное закрытие -> обновить qty.
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
            pos.closed_at = datetime.now(timezone.utc)
            pos.unrealized_pnl = Decimal("0")

            # Получить realized PnL из closed PnL API (точные данные с комиссиями)
            try:
                closed_pnl_records = client.get_closed_pnl(symbol, limit=5)
                entry_db = round(float(pos.entry_price), 3)
                for rec in closed_pnl_records:
                    entry_bybit = round(float(rec.get("avgEntryPrice", "0")), 3)
                    if entry_db == entry_bybit:
                        pos.realized_pnl = Decimal(rec["closedPnl"])
                        break
                else:
                    # Fallback: рассчитать вручную по последнему mark_price
                    if exchange_entry > 0:
                        entry = float(pos.entry_price)
                        qty = float(pos.quantity)
                        side_val = pos.side.value if hasattr(pos.side, "value") else str(pos.side)
                        if side_val == "long":
                            pos.realized_pnl = Decimal(str(round((exchange_entry - entry) * qty, 4)))
                        else:
                            pos.realized_pnl = Decimal(str(round((entry - exchange_entry) * qty, 4)))
            except Exception as e:
                logger.warning("Bot %s: get_closed_pnl failed: %s", bot.id, e)

            # Пересчитать total_pnl из ВСЕХ закрытых позиций (как делает listener)
            all_closed = await db.execute(
                select(Position).where(
                    Position.bot_id == bot.id,
                    Position.status == PositionStatus.CLOSED,
                )
            )
            bot.total_pnl = sum(
                (p.realized_pnl or Decimal("0")) for p in all_closed.scalars().all()
            )

            # Пересчитать win_rate
            all_closed2 = await db.execute(
                select(Position).where(
                    Position.bot_id == bot.id,
                    Position.status == PositionStatus.CLOSED,
                )
            )
            closed_list = all_closed2.scalars().all()
            total_closed = len(closed_list)
            if total_closed > 0:
                wins = sum(1 for p in closed_list if (p.realized_pnl or Decimal("0")) > 0)
                bot.win_rate = Decimal(str(round(wins / total_closed * 100, 2)))
            bot.total_trades = total_closed

            # Трекинг пиков
            if bot.total_pnl > bot.max_pnl:
                bot.max_pnl = bot.total_pnl
            current_dd = bot.max_pnl - bot.total_pnl
            if current_dd > bot.max_drawdown:
                bot.max_drawdown = current_dd

            await _log(db, bot.id, "info", "Позиция закрыта биржей (sync)", {
                "symbol": symbol, "realized_pnl": str(pos.realized_pnl),
            })

        elif exchange_size < db_qty * 0.95:
            # Частичное закрытие (TP1 сработал)
            pos.quantity = Decimal(str(exchange_size))
            pos.unrealized_pnl = Decimal(str(exchange_pnl))

            await _log(db, bot.id, "info", f"Частичное закрытие: {db_qty:.4f} -> {exchange_size:.4f}", {
                "symbol": symbol,
            })
        else:
            # Позиция без изменений -- обновить PnL
            pos.unrealized_pnl = Decimal(str(exchange_pnl))

    await db.commit()


# === Position Management (Multi-TP + Breakeven) ===

async def _manage_position(
    db: AsyncSession, bot: Bot, client: BybitClient,
    position: Position, config: dict, timeframe: str,
) -> None:
    """Управление открытой позицией: multi-TP переключение + breakeven.

    Breakeven/TP2 устанавливаются listener'ом мгновенно при TP1.
    Здесь -- подстраховка: если listener не успел или упал.
    """
    risk_cfg = config.get("risk", {})
    use_multi_tp = risk_cfg.get("use_multi_tp", False)
    use_breakeven = risk_cfg.get("use_breakeven", False)
    tp_levels = risk_cfg.get("tp_levels", [])

    if not use_multi_tp or not tp_levels:
        return  # Обычный режим -- биржа управляет TP/SL

    symbol = position.symbol
    entry_price = float(position.entry_price)

    # Определить: был ли TP1 (listener ставит original_quantity при partial close)
    if not position.original_quantity:
        return  # TP1 еще не сработал
    if float(position.quantity) >= float(position.original_quantity) * 0.95:
        return  # Нет реального уменьшения

    # TP1 сработал. Проверить, установлен ли уже breakeven (SL ~ entry_price)
    current_sl = float(position.stop_loss or 0)
    breakeven_set = abs(current_sl - entry_price) < entry_price * 0.005  # ~0.5% tolerance

    try:
        sym_info = client.get_symbol_info(symbol)
    except BybitAPIError:
        sym_info = None

    if use_breakeven and not breakeven_set:
        # Listener не успел -> установить breakeven
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
        # TP2 не выставлен -> установить
        try:
            atr_period = risk_cfg.get("atr_period", 14)
            candles = client.get_klines(symbol, timeframe, atr_period + 10)
            if candles and len(candles) >= atr_period:
                highs = np.array([float(c["high"]) for c in candles])
                lows = np.array([float(c["low"]) for c in candles])
                closes = np.array([float(c["close"]) for c in candles])
                atr_vals = calc_atr(highs, lows, closes, atr_period)
                current_atr = float(atr_vals[-1])
                if np.isnan(current_atr) or current_atr <= 0:
                    logger.warning("Bot %s: ATR is NaN/zero, skipping TP2", bot.id)
                else:
                    tp2_mult = tp_levels[1]["atr_mult"]
                    if position.side == PositionSide.LONG:
                        tp2_price = entry_price + current_atr * tp2_mult
                    else:
                        tp2_price = entry_price - current_atr * tp2_mult

                    tick = sym_info.tick_size if sym_info else 0.001
                    tp2_price = _round_price(tp2_price, tick)
                    client.set_trading_stop(symbol=symbol, take_profit=tp2_price)
                    position.take_profit = Decimal(str(round(tp2_price, 6)))
                    await _log(db, bot.id, "info", f"TP2 (backup): {tp2_price:.4f}", {
                        "symbol": symbol, "atr": current_atr,
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


# === Reverse Signal Handling ===


async def _close_position_market(
    db: AsyncSession, bot: Bot, client: BybitClient,
    position: Position, symbol: str,
) -> bool:
    """Закрыть позицию рыночным ордером.

    Возвращает True если ордер размещён успешно.
    """
    side_value = position.side.value if hasattr(position.side, "value") else str(position.side)
    close_side = "Sell" if side_value == "long" else "Buy"
    order_side = OrderSide.SELL if side_value == "long" else OrderSide.BUY
    qty = float(position.quantity)

    try:
        bybit_result = client.place_order(
            symbol=symbol, side=close_side, order_type="Market", qty=qty,
        )
        order = Order(
            bot_id=bot.id, symbol=symbol, side=order_side,
            type=OrderType.MARKET, quantity=qty, price=0,
            status=OrderStatus.FILLED,
            exchange_order_id=bybit_result.get("orderId"),
        )
        db.add(order)
        position.status = PositionStatus.CLOSED
        position.closed_at = datetime.now(timezone.utc)

        # Рассчитать realized_pnl через closed PnL API (с комиссиями)
        try:
            closed_records = client.get_closed_pnl(symbol, limit=3)
            entry_db = round(float(position.entry_price), 3)
            for rec in closed_records:
                entry_bybit = round(float(rec.get("avgEntryPrice", "0")), 3)
                if entry_db == entry_bybit:
                    prior_pnl = position.realized_pnl or Decimal("0")
                    position.realized_pnl = prior_pnl + Decimal(rec["closedPnl"])
                    break
            else:
                # Fallback: рассчитать по текущей цене
                try:
                    ticker = client.get_ticker(symbol)
                    last_price = float(ticker.last_price)
                    entry = float(position.entry_price)
                    prior_pnl = position.realized_pnl or Decimal("0")
                    if side_value == "long":
                        pnl = (last_price - entry) * qty
                    else:
                        pnl = (entry - last_price) * qty
                    position.realized_pnl = prior_pnl + Decimal(str(round(pnl, 4)))
                except Exception:
                    pass
        except Exception as e:
            logger.warning("Bot %s: closed PnL fetch failed on reverse: %s", bot.id, e)

        # Пересчитать bot stats из всех закрытых позиций
        all_closed = await db.execute(
            select(Position).where(
                Position.bot_id == bot.id,
                Position.status == PositionStatus.CLOSED,
            )
        )
        closed_list = all_closed.scalars().all()
        bot.total_pnl = sum((p.realized_pnl or Decimal("0")) for p in closed_list)
        total_closed = len(closed_list)
        if total_closed > 0:
            wins = sum(1 for p in closed_list if (p.realized_pnl or Decimal("0")) > 0)
            bot.win_rate = Decimal(str(round(wins / total_closed * 100, 2)))
        bot.total_trades = total_closed
        if bot.total_pnl > bot.max_pnl:
            bot.max_pnl = bot.total_pnl
        current_dd = bot.max_pnl - bot.total_pnl
        if current_dd > bot.max_drawdown:
            bot.max_drawdown = current_dd

        await db.commit()

        await _log(db, bot.id, "info", f"Закрытие позиции {side_value.upper()} {qty} {symbol} (reverse)", {
            "order_id": bybit_result.get("orderId"),
            "reason": "reverse_signal",
            "realized_pnl": str(position.realized_pnl),
        })
        return True
    except BybitAPIError as e:
        logger.error("Bot %s: reverse close failed: %s", bot.id, e.message)
        await _log(db, bot.id, "error", f"Ошибка закрытия для реверса: {e.message}")
        await db.commit()
        return False


async def _check_reverse_signal(
    db: AsyncSession, bot: Bot, client: BybitClient,
    position: Position, strategy_result, ohlcv: OHLCV,
    config: dict, symbol: str, timeframe: str,
) -> dict | None:
    """Проверить обратный сигнал и выполнить действие по конфигу on_reverse.

    Возвращает dict (результат цикла) если обработал реверс, или None если реверса нет.
    """
    if not strategy_result.signals:
        return None

    latest_signal = strategy_result.signals[-1]
    last_bar_idx = len(ohlcv) - 1

    # Сигнал должен быть свежим
    if latest_signal.bar_index < last_bar_idx - 1:
        return None

    # Определить направления
    pos_side = position.side.value if hasattr(position.side, "value") else str(position.side)
    signal_dir = latest_signal.direction  # "long" или "short"

    # Не реверс - одинаковое направление
    if pos_side == signal_dir:
        return None

    # Обратный сигнал обнаружен
    live_cfg = config.get("live", config.get("backtest", {}))
    on_reverse = live_cfg.get("on_reverse", "ignore")

    await _log(db, bot.id, "warn",
               f"Обратный сигнал {signal_dir.upper()} при открытой {pos_side.upper()}, on_reverse={on_reverse}", {
                   "signal_confluence": latest_signal.confluence_score,
                   "signal_type": latest_signal.signal_type,
                   "position_entry": float(position.entry_price),
               })

    if on_reverse == "ignore":
        await _manage_position(db, bot, client, position, config, timeframe)
        return {"status": "managing", "message": f"Reverse signal {signal_dir} ignored (on_reverse=ignore)"}

    if on_reverse == "close":
        closed = await _close_position_market(db, bot, client, position, symbol)
        if closed:
            return {"status": "closed", "message": f"Position closed by reverse signal {signal_dir}"}
        return {"status": "error", "message": "Failed to close position for reverse"}

    if on_reverse == "reverse":
        # Шаг 1: закрыть текущую позицию
        closed = await _close_position_market(db, bot, client, position, symbol)
        if not closed:
            return {"status": "error", "message": "Failed to close position for reverse"}

        # Шаг 2: sync - убедиться что позиция закрыта
        await _sync_positions(db, bot, client, symbol, config)

        # Шаг 3: открыть в новом направлении
        direction = SignalDirection.LONG if signal_dir == "long" else SignalDirection.SHORT
        knn_class = "BULL" if strategy_result.knn_classes[-1] == 1 else "BEAR" if strategy_result.knn_classes[-1] == -1 else "NEUTRAL"
        trade_signal = TradeSignal(
            bot_id=bot.id, strategy_config_id=bot.strategy_config.id,
            symbol=symbol, direction=direction,
            signal_strength=latest_signal.confluence_score,
            knn_class=knn_class,
            knn_confidence=float(strategy_result.knn_confidence[-1]) if len(strategy_result.knn_confidence) > 0 else 50.0,
            indicators_snapshot={
                "entry_price": latest_signal.entry_price,
                "stop_loss": latest_signal.stop_loss,
                "take_profit": latest_signal.take_profit,
                "signal_type": latest_signal.signal_type,
                "reverse_from": pos_side,
                **(latest_signal.indicators or {}),
            },
            was_executed=False,
        )
        db.add(trade_signal)

        return await _place_order(db, bot, client, latest_signal, config, trade_signal, symbol)

    # Неизвестное значение on_reverse - игнорируем
    await _manage_position(db, bot, client, position, config, timeframe)
    return {"status": "managing", "message": f"Unknown on_reverse={on_reverse}, managing"}


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

        await _log(db, bot.id, "info", f"Расчет позиции: avail={available:.2f} size={order_size_pct*100:.0f}% lev={leverage}x price={ticker.last_price} qty={qty}", {
            "wallet_balance": balance["wallet_balance"],
            "available": available,
            "equity": balance["equity"],
            "order_size_pct": order_size_pct,
            "leverage": leverage,
            "margin_value": margin_value,
            "position_value": position_value,
            "price": float(ticker.last_price),
        })

        if qty < symbol_info.min_qty:
            await _log(db, bot.id, "warn", f"Объем мал: {qty} < {symbol_info.min_qty}")
            await db.commit()
            return {"status": "error", "message": f"Qty too small: {qty}"}

        if qty > symbol_info.max_qty:
            qty = round(symbol_info.max_qty // symbol_info.qty_step * symbol_info.qty_step, 8)

        # Валидация SL -- позиция без SL запрещена
        if not signal.stop_loss or float(signal.stop_loss) <= 0:
            await _log(db, bot.id, "error", "Сигнал без SL -- ордер отклонен")
            await db.commit()
            return {"status": "error", "message": "Signal has no stop_loss"}

        tick = symbol_info.tick_size

        # Определить TP для ордера
        order_tp = None
        order_sl = _round_price(float(signal.stop_loss), tick)

        if use_multi_tp and tp_levels and signal.tp_levels:
            # Multi-TP: НЕ ставим SL/TP на ордер -- избегаем tpslMode Full->Partial конфликт.
            # Все устанавливается через set_trading_stop после fill.
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

                # Bybit не позволяет Partial TP + Full SL в одном вызове.
                # Два отдельных: сначала SL (Full), потом TP1 (Partial).
                client.set_trading_stop(
                    symbol=symbol,
                    stop_loss=float(order_sl),
                    tpsl_mode="Full",
                )
                client.set_trading_stop(
                    symbol=symbol,
                    take_profit=tp1_price,
                    tpsl_mode="Partial",
                    tp_size=tp1_qty,
                )
                # Обновить TP в позиции для корректного отображения
                position.take_profit = Decimal(str(round(tp1_price, 6)))

                await _log(db, bot.id, "info", f"Multi-TP1: {tp1_price:.4f} qty={tp1_qty} SL: {order_sl}", {
                    "tp1_pct": tp1_close_pct,
                })
            except BybitAPIError as e:
                # Fallback: установить хотя бы SL Full
                logger.warning("Bot %s: multi-TP setup failed: %s, fallback to Full SL", bot.id, e.message)
                try:
                    client.set_trading_stop(
                        symbol=symbol,
                        stop_loss=float(order_sl),
                        tpsl_mode="Full",
                    )
                except BybitAPIError as e2:
                    logger.error("Bot %s: CRITICAL - SL not set, emergency close: %s", bot.id, e2.message)
                    await _log(db, bot.id, "error", "SL не установлен - аварийное закрытие позиции", {
                        "error": e2.message,
                    })
                    # Аварийное закрытие - позиция без SL недопустима
                    opposite_side = "Sell" if side == "Buy" else "Buy"
                    try:
                        client.place_order(
                            symbol=symbol, side=opposite_side, qty=str(qty), order_type="Market",
                        )
                    except BybitAPIError as e3:
                        logger.error("Bot %s: EMERGENCY CLOSE ALSO FAILED: %s", bot.id, e3.message)
                        await _log(db, bot.id, "error", f"Аварийное закрытие не удалось: {e3.message}")

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
