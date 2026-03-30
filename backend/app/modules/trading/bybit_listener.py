"""Bybit Private WebSocket Listener — мониторинг ордеров и позиций в реальном времени.

Отдельный фоновый процесс (Docker-сервис), который:
1. При запуске получает все RUNNING боты, группирует по exchange_account_id
2. Для каждого уникального exchange account создаёт Bybit Private WS соединение
3. Слушает order, position, execution стримы
4. Обновляет записи в БД (Order, Position, Bot)
5. Публикует события в Redis pub/sub → API подхватывает и шлёт в браузер

Reconnect: экспоненциальный backoff (pybit встроенный + наш уровень).
Graceful shutdown: SIGTERM/SIGINT → закрытие всех WS + DB sessions.
"""

import asyncio
import json
import logging
import signal
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("bybit_listener")

# Флаг для graceful shutdown
_shutdown_event: asyncio.Event | None = None

# Активные WS соединения: exchange_account_id → BybitWebSocketPrivate
_active_connections: dict[uuid.UUID, Any] = {}

# Публичные WS для kline trigger: symbol → BybitWebSocketPublic
_kline_connections: dict[str, Any] = {}

# Маппинг: symbol → list[bot_id] (для kline trigger)
_symbol_bots: dict[str, list[uuid.UUID]] = {}

# Маппинг: symbol → timeframe (для kline trigger)
_symbol_timeframes: dict[str, str] = {}

# Маппинг: (symbol, exchange_account_id) → list[bot_id]
_symbol_bot_map: dict[tuple[str, uuid.UUID], list[uuid.UUID]] = {}

# Публичные WS для тикеров (real-time цены): symbol → BybitWebSocketPublic
_ticker_connections: dict[str, Any] = {}

# Throttle: symbol → last update timestamp (для ограничения частоты DB-записи)
_ticker_last_update: dict[str, float] = {}
TICKER_UPDATE_INTERVAL = 5.0  # секунды между DB-обновлениями

# Маппинг: exchange_account_id → user_id (для broadcast)
_account_user_map: dict[uuid.UUID, uuid.UUID] = {}

# Интервал проверки новых ботов (секунды)
REFRESH_INTERVAL = 60

# Максимальный backoff при ошибках подключения (секунды)
MAX_BACKOFF = 300

# TTL для дедупликации kline trigger (секунды)
KLINE_DEDUP_TTL = 60


async def _get_redis() -> Any:
    """Получить async Redis клиент для pub/sub."""
    from redis.asyncio import Redis

    from app.config import settings
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def _publish_event(user_id: uuid.UUID, event_type: str, data: dict) -> None:
    """Опубликовать событие в Redis pub/sub для трансляции в браузер.

    Канал: trading:{user_id}
    API-процесс подписан на этот канал и ретранслирует в WebSocket.
    """
    try:
        redis = await _get_redis()
        channel = f"trading:{user_id}"
        message = json.dumps({"type": event_type, "data": data}, default=str)
        await redis.publish(channel, message)
        await redis.aclose()
    except Exception:
        logger.exception("Ошибка публикации события в Redis: %s", event_type)


async def _write_bot_log(
    bot_id: uuid.UUID,
    level: str,
    message: str,
    details: dict | None = None,
) -> None:
    """Записать лог бота в БД."""
    from app.database import async_session
    from app.modules.trading.models import BotLog, BotLogLevel

    try:
        async with async_session() as db:
            log_entry = BotLog(
                bot_id=bot_id,
                level=BotLogLevel(level),
                message=message[:500],
                details=details,
            )
            db.add(log_entry)
            await db.commit()
    except Exception:
        logger.debug("Не удалось записать лог бота %s в БД", bot_id, exc_info=True)


def _find_bots_for_event(
    symbol: str, exchange_account_id: uuid.UUID,
) -> list[uuid.UUID]:
    """Найти bot_id по символу и exchange account."""
    return _symbol_bot_map.get((symbol, exchange_account_id), [])


async def _handle_order_event(
    exchange_account_id: uuid.UUID, order_data: dict,
) -> None:
    """Обработать обновление ордера от Bybit WS.

    - Ищет ордер по exchange_order_id или order_link_id
    - Обновляет статус, filled_price, filled_at
    - Записывает BotLog
    - Публикует в Redis
    """
    from sqlalchemy import select

    from app.database import async_session
    from app.modules.trading.models import Order, OrderStatus

    symbol = order_data.get("symbol", "")
    order_id = order_data.get("order_id", "")
    order_link_id = order_data.get("order_link_id", "")
    bybit_status = order_data.get("status", "")
    avg_price = order_data.get("avg_price", "0")
    cum_exec_qty = order_data.get("cum_exec_qty", "0")

    logger.info(
        "Order event: %s %s status=%s avg_price=%s qty=%s",
        symbol, order_id, bybit_status, avg_price, cum_exec_qty,
    )

    # Маппинг статусов Bybit → наши
    status_map = {
        "Filled": OrderStatus.FILLED,
        "Cancelled": OrderStatus.CANCELLED,
        "Rejected": OrderStatus.ERROR,
        "Deactivated": OrderStatus.CANCELLED,
    }
    new_status = status_map.get(bybit_status)
    if not new_status:
        # Промежуточные статусы (New, PartiallyFilled) — не обновляем до финального
        return

    try:
        async with async_session() as db:
            # Найти ордер по exchange_order_id
            stmt = select(Order).where(Order.exchange_order_id == order_id)
            result = await db.execute(stmt)
            order = result.scalar_one_or_none()

            # Если не нашли по exchange_order_id, ищем по order_link_id
            if not order and order_link_id and order_link_id.startswith("ab-"):
                stmt = select(Order).where(
                    Order.exchange_order_id == order_link_id
                )
                result = await db.execute(stmt)
                order = result.scalar_one_or_none()

            if not order:
                logger.debug(
                    "Ордер не найден в БД: exchange_order_id=%s link=%s",
                    order_id, order_link_id,
                )
                return

            # Обновить ордер
            order.status = new_status
            if new_status == OrderStatus.FILLED and avg_price != "0":
                order.filled_price = Decimal(avg_price)
                order.filled_at = datetime.now(timezone.utc)

            await db.commit()

            # Записать лог бота
            side = order_data.get("side", "?")
            qty = order_data.get("qty", "?")
            status_text = (
                "исполнен" if new_status == OrderStatus.FILLED
                else "отменён" if new_status == OrderStatus.CANCELLED
                else "ошибка"
            )
            await _write_bot_log(
                order.bot_id, "info",
                f"Ордер {status_text}: {side} {qty} {symbol} @ {avg_price}",
                {"exchange_order_id": order_id, "status": bybit_status},
            )

            # Публикация в Redis для браузера
            user_id = _account_user_map.get(exchange_account_id)
            if user_id:
                await _publish_event(user_id, "order_update", {
                    "bot_id": str(order.bot_id),
                    "order_id": str(order.id),
                    "exchange_order_id": order_id,
                    "symbol": symbol,
                    "side": side,
                    "status": new_status.value,
                    "avg_price": avg_price,
                    "filled_at": order.filled_at.isoformat() if order.filled_at else None,
                })

    except Exception:
        logger.exception("Ошибка обработки order event: %s", order_id)


async def _handle_position_event(
    exchange_account_id: uuid.UUID, pos_data: dict,
) -> None:
    """Обработать обновление позиции от Bybit WS.

    - Обновляет unrealized_pnl, current/max/min price, max/min pnl
    - Синхронизирует SL/TP/trailing с биржей
    - Если size == 0: позиция закрыта → realized_pnl, обновить bot stats
    - Публикует полное состояние в Redis для SSE
    """
    from sqlalchemy import select

    from app.database import async_session
    from app.modules.trading.models import Bot, Position, PositionStatus

    symbol = pos_data.get("symbol", "")
    size = pos_data.get("size", "0")
    unrealized_pnl = pos_data.get("unrealized_pnl", "0")
    side = pos_data.get("side", "")
    mark_price = pos_data.get("mark_price", "") or pos_data.get("markPrice", "")
    stop_loss_ex = pos_data.get("stop_loss", "") or pos_data.get("stopLoss", "")
    take_profit_ex = pos_data.get("take_profit", "") or pos_data.get("takeProfit", "")
    trailing_stop_ex = pos_data.get("trailing_stop", "") or pos_data.get("trailingStop", "")

    bot_ids = _find_bots_for_event(symbol, exchange_account_id)
    if not bot_ids:
        return

    logger.info(
        "Position event: %s side=%s size=%s pnl=%s mark=%s bots=%d",
        symbol, side, size, unrealized_pnl, mark_price, len(bot_ids),
    )

    position_closed = float(size) == 0
    now = datetime.now(timezone.utc)
    upnl = Decimal(unrealized_pnl)
    mp = Decimal(mark_price) if mark_price else None

    # Данные для Redis-события (обогащаем по ходу)
    event_data: dict[str, Any] = {
        "symbol": symbol,
        "side": side,
        "size": size,
        "unrealized_pnl": unrealized_pnl,
        "mark_price": mark_price,
        "closed": position_closed,
        "bot_ids": [str(b) for b in bot_ids],
    }

    try:
        async with async_session() as db:
            for bot_id in bot_ids:
                stmt = select(Position).where(
                    Position.bot_id == bot_id,
                    Position.symbol == symbol,
                    Position.status == PositionStatus.OPEN,
                )
                result = await db.execute(stmt)
                position = result.scalar_one_or_none()

                if not position:
                    continue

                if position_closed:
                    # === Позиция закрыта ===
                    position.status = PositionStatus.CLOSED
                    position.closed_at = now
                    position.updated_at = now
                    position.unrealized_pnl = Decimal("0")
                    if position.realized_pnl is None:
                        position.realized_pnl = upnl

                    # Обновить статистику бота
                    bot_result = await db.execute(select(Bot).where(Bot.id == bot_id))
                    bot = bot_result.scalar_one_or_none()
                    if bot:
                        pnl_value = position.realized_pnl or Decimal("0")
                        bot.total_pnl = (bot.total_pnl or Decimal("0")) + pnl_value
                        bot.updated_at = now

                        # Трекинг пиков бота
                        if bot.total_pnl > bot.max_pnl:
                            bot.max_pnl = bot.total_pnl
                        current_dd = bot.max_pnl - bot.total_pnl
                        if current_dd > bot.max_drawdown:
                            bot.max_drawdown = current_dd

                        # Win rate
                        total_positions_result = await db.execute(
                            select(Position).where(
                                Position.bot_id == bot_id,
                                Position.status == PositionStatus.CLOSED,
                            )
                        )
                        closed_positions = total_positions_result.scalars().all()
                        total_closed = len(closed_positions)
                        if total_closed > 0:
                            wins = sum(
                                1 for p in closed_positions
                                if (p.realized_pnl or Decimal("0")) > 0
                            )
                            bot.win_rate = Decimal(str(round(wins / total_closed * 100, 2)))

                    await _write_bot_log(
                        bot_id, "info",
                        f"Позиция закрыта: {position.side.value.upper()} {symbol} PnL: {position.realized_pnl}",
                        {"realized_pnl": str(position.realized_pnl), "side": position.side.value},
                    )

                    event_data["realized_pnl"] = str(position.realized_pnl)
                else:
                    # === Позиция обновляется ===
                    position.unrealized_pnl = upnl
                    position.updated_at = now

                    # Трекинг пиков PnL
                    if upnl > position.max_pnl:
                        position.max_pnl = upnl
                    if upnl < position.min_pnl:
                        position.min_pnl = upnl

                    # Трекинг цен
                    if mp:
                        position.current_price = mp
                        if position.max_price is None or mp > position.max_price:
                            position.max_price = mp
                        if position.min_price is None or mp < position.min_price:
                            position.min_price = mp

                    # Синхронизировать SL/TP/trailing с биржей
                    if stop_loss_ex and float(stop_loss_ex) > 0:
                        position.stop_loss = Decimal(stop_loss_ex)
                    if take_profit_ex and float(take_profit_ex) > 0:
                        position.take_profit = Decimal(take_profit_ex)
                    if trailing_stop_ex and float(trailing_stop_ex) > 0:
                        position.trailing_stop = Decimal(trailing_stop_ex)

                    # Обновить размер при частичном закрытии
                    exchange_size = Decimal(size)
                    if exchange_size < position.quantity * Decimal("0.95"):
                        if position.original_quantity is None:
                            position.original_quantity = position.quantity
                        position.quantity = exchange_size
                        await _write_bot_log(
                            bot_id, "info",
                            f"Частичное закрытие: {symbol} новый размер {size}",
                        )

                    # Обновить пики бота
                    bot_result = await db.execute(select(Bot).where(Bot.id == bot_id))
                    bot = bot_result.scalar_one_or_none()
                    if bot:
                        bot.updated_at = now

                    # Обогатить событие данными позиции
                    event_data.update({
                        "bot_id": str(bot_id),
                        "position_id": str(position.id),
                        "entry_price": str(position.entry_price),
                        "quantity": str(position.quantity),
                        "stop_loss": str(position.stop_loss),
                        "take_profit": str(position.take_profit),
                        "trailing_stop": str(position.trailing_stop) if position.trailing_stop else None,
                        "max_pnl": str(position.max_pnl),
                        "min_pnl": str(position.min_pnl),
                        "max_price": str(position.max_price) if position.max_price else None,
                        "min_price": str(position.min_price) if position.min_price else None,
                    })

                await db.commit()

            # Публикация в Redis для SSE
            user_id = _account_user_map.get(exchange_account_id)
            if user_id:
                await _publish_event(user_id, "position_update", event_data)

    except Exception:
        logger.exception("Ошибка обработки position event: %s", symbol)


async def _handle_execution_event(
    exchange_account_id: uuid.UUID, exec_data: dict,
) -> None:
    """Обработать исполнение сделки от Bybit WS.

    Записывает BotLog с деталями исполнения и публикует в Redis.
    """
    symbol = exec_data.get("symbol", "")
    exec_price = exec_data.get("exec_price", "0")
    exec_qty = exec_data.get("exec_qty", "0")
    exec_fee = exec_data.get("exec_fee", "0")
    exec_type = exec_data.get("exec_type", "")
    side = exec_data.get("side", "")

    bot_ids = _find_bots_for_event(symbol, exchange_account_id)

    logger.info(
        "Execution event: %s %s %s price=%s qty=%s fee=%s type=%s",
        symbol, side, exec_type, exec_price, exec_qty, exec_fee, exec_type,
    )

    for bot_id in bot_ids:
        await _write_bot_log(
            bot_id, "info",
            f"Исполнение: {side} {exec_qty} {symbol} @ {exec_price} (fee: {exec_fee})",
            {
                "exec_type": exec_type,
                "exec_price": exec_price,
                "exec_qty": exec_qty,
                "exec_fee": exec_fee,
            },
        )

    user_id = _account_user_map.get(exchange_account_id)
    if user_id:
        await _publish_event(user_id, "execution", {
            "symbol": symbol,
            "side": side,
            "exec_price": exec_price,
            "exec_qty": exec_qty,
            "exec_fee": exec_fee,
            "exec_type": exec_type,
            "bot_ids": [str(b) for b in bot_ids],
        })


async def _load_running_bots() -> dict[uuid.UUID, list[dict]]:
    """Загрузить все RUNNING боты, сгруппированные по exchange_account_id.

    Returns:
        dict: exchange_account_id → [{"bot_id", "symbol", "user_id", "account"}]
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.database import async_session
    from app.modules.strategy.models import StrategyConfig
    from app.modules.trading.models import Bot, BotStatus

    result: dict[uuid.UUID, list[dict]] = {}

    async with async_session() as db:
        stmt = (
            select(Bot)
            .options(
                selectinload(Bot.strategy_config),
                selectinload(Bot.exchange_account),
            )
            .where(Bot.status == BotStatus.RUNNING)
        )
        bots_result = await db.execute(stmt)
        bots = bots_result.scalars().all()

        for bot in bots:
            account = bot.exchange_account
            if not account or not account.is_active:
                continue

            account_id = account.id
            if account_id not in result:
                result[account_id] = []

            result[account_id].append({
                "bot_id": bot.id,
                "symbol": bot.strategy_config.symbol if bot.strategy_config else "",
                "timeframe": bot.strategy_config.timeframe if bot.strategy_config else "15",
                "user_id": bot.user_id,
                "account": account,
            })

    return result


def _build_maps(
    grouped_bots: dict[uuid.UUID, list[dict]],
) -> None:
    """Обновить глобальные маппинги symbol→bots и account→user."""
    global _symbol_bot_map, _account_user_map
    new_symbol_map: dict[tuple[str, uuid.UUID], list[uuid.UUID]] = {}
    new_account_user_map: dict[uuid.UUID, uuid.UUID] = {}

    for account_id, bots in grouped_bots.items():
        for bot_info in bots:
            symbol = bot_info["symbol"]
            bot_id = bot_info["bot_id"]
            user_id = bot_info["user_id"]

            key = (symbol, account_id)
            if key not in new_symbol_map:
                new_symbol_map[key] = []
            new_symbol_map[key].append(bot_id)

            new_account_user_map[account_id] = user_id

    _symbol_bot_map = new_symbol_map
    _account_user_map = new_account_user_map


def _connect_account(
    account_id: uuid.UUID,
    account: Any,
    loop: asyncio.AbstractEventLoop,
) -> bool:
    """Создать Bybit Private WS соединение для exchange account.

    Возвращает True при успешном подключении, False при ошибке.
    pybit WS работает в отдельном потоке, callbacks вызываются оттуда.
    """
    from app.core.security import decrypt_value
    from app.modules.market.bybit_ws import BybitWebSocketPrivate

    try:
        api_key = decrypt_value(account.api_key_encrypted)
        api_secret = decrypt_value(account.api_secret_encrypted)
    except Exception:
        logger.error(
            "Не удалось расшифровать ключи для account %s, пропуск",
            account_id,
        )
        return False

    try:
        # is_testnet в БД означает demo mode (api-demo.bybit.com)
        ws = BybitWebSocketPrivate(
            api_key=api_key,
            api_secret=api_secret,
            demo=account.is_testnet,
        )

        # Callbacks: pybit вызывает из своего потока → нам нужно передать в asyncio loop
        def on_order(data: dict) -> None:
            """Callback: обновление ордера."""
            asyncio.run_coroutine_threadsafe(
                _handle_order_event(account_id, data), loop,
            )

        def on_position(data: dict) -> None:
            """Callback: обновление позиции."""
            asyncio.run_coroutine_threadsafe(
                _handle_position_event(account_id, data), loop,
            )

        def on_execution(data: dict) -> None:
            """Callback: исполнение сделки."""
            asyncio.run_coroutine_threadsafe(
                _handle_execution_event(account_id, data), loop,
            )

        ws.subscribe_order(on_order)
        ws.subscribe_position(on_position)
        ws.subscribe_execution(on_execution)

        _active_connections[account_id] = ws
        logger.info(
            "Bybit Private WS подключен: account=%s demo=%s",
            account_id, account.is_testnet,
        )
        return True

    except Exception:
        logger.exception(
            "Ошибка подключения Bybit Private WS для account %s",
            account_id,
        )
        return False


def _disconnect_account(account_id: uuid.UUID) -> None:
    """Закрыть WS соединение для exchange account."""
    ws = _active_connections.pop(account_id, None)
    if ws is not None:
        try:
            ws.close()
        except Exception:
            logger.exception("Ошибка закрытия WS для account %s", account_id)
        logger.info("Bybit Private WS отключён: account=%s", account_id)


def _disconnect_all() -> None:
    """Закрыть все активные WS соединения."""
    account_ids = list(_active_connections.keys())
    for account_id in account_ids:
        _disconnect_account(account_id)
    logger.info("Все WS соединения закрыты (%d)", len(account_ids))


async def _trigger_bot_cycle(bot_id: uuid.UUID, symbol: str, timeframe: str) -> None:
    """Триггер цикла бота через Celery при закрытии свечи.

    Дедупликация: Redis ключ bot:{bot_id}:last_trigger с TTL предотвращает
    повторный запуск в течение KLINE_DEDUP_TTL секунд.
    """
    try:
        redis = await _get_redis()
        dedup_key = f"bot:{bot_id}:last_trigger"

        # Проверить дедупликацию
        if await redis.get(dedup_key):
            await redis.aclose()
            return  # Уже триггерили недавно

        # Установить ключ с TTL
        await redis.set(dedup_key, "1", ex=KLINE_DEDUP_TTL)
        await redis.aclose()

        # Диспатчить через Celery
        from app.modules.trading.celery_tasks import run_bot_cycle_task
        run_bot_cycle_task.delay(str(bot_id))

        logger.info(
            "Kline trigger: bot=%s symbol=%s tf=%s",
            str(bot_id)[:8], symbol, timeframe,
        )
    except Exception:
        logger.exception("Ошибка kline trigger для bot %s", bot_id)


def _setup_kline_triggers(
    grouped_bots: dict[uuid.UUID, list[dict]],
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Подписаться на публичные kline streams для символов активных ботов.

    При confirm=True (свеча закрылась) → trigger run_bot_cycle.
    """
    global _kline_connections, _symbol_bots, _symbol_timeframes

    from app.modules.market.bybit_ws import BybitWebSocketPublic

    # Собрать уникальные (symbol, timeframe) пары
    new_symbol_bots: dict[str, list[uuid.UUID]] = {}
    new_symbol_tfs: dict[str, str] = {}

    for _account_id, bots in grouped_bots.items():
        for bot_info in bots:
            symbol = bot_info["symbol"]
            bot_id = bot_info["bot_id"]
            # Timeframe из strategy_config
            tf = bot_info.get("timeframe", "15")
            if symbol not in new_symbol_bots:
                new_symbol_bots[symbol] = []
                new_symbol_tfs[symbol] = tf
            new_symbol_bots[symbol].append(bot_id)

    _symbol_bots = new_symbol_bots
    _symbol_timeframes = new_symbol_tfs

    needed_symbols = set(new_symbol_bots.keys())
    active_symbols = set(_kline_connections.keys())

    # Подключить новые символы
    for symbol in needed_symbols - active_symbols:
        tf = new_symbol_tfs.get(symbol, "15")
        try:
            ws = BybitWebSocketPublic()

            def _make_kline_handler(sym: str, timeframe: str):
                def handler(data: dict) -> None:
                    if data.get("confirm"):
                        # Свеча закрылась — триггерим все боты для этого символа
                        bot_ids = _symbol_bots.get(sym, [])
                        for bid in bot_ids:
                            asyncio.run_coroutine_threadsafe(
                                _trigger_bot_cycle(bid, sym, timeframe), loop,
                            )
                return handler

            ws.subscribe_kline(symbol, int(tf), _make_kline_handler(symbol, tf))
            _kline_connections[symbol] = ws
            logger.info("Kline trigger подключён: %s %sm", symbol, tf)
        except Exception:
            logger.exception("Ошибка подписки kline для %s", symbol)

    # Отключить ненужные
    for symbol in active_symbols - needed_symbols:
        ws = _kline_connections.pop(symbol, None)
        if ws:
            try:
                ws.close()
            except Exception:
                pass
            logger.info("Kline trigger отключён: %s", symbol)


async def _handle_ticker_event(symbol: str, ticker_data: dict) -> None:
    """Обработать тикер — обновить current_price, peaks и unrealized PnL для открытых позиций.

    Throttle: обновляет DB + Redis не чаще TICKER_UPDATE_INTERVAL секунд.
    """
    import time

    from sqlalchemy import select

    from app.database import async_session
    from app.modules.trading.models import Position, PositionSide, PositionStatus

    mark_price = ticker_data.get("mark_price", 0)
    if not mark_price or mark_price == 0:
        return

    # Throttle — не чаще раза в N секунд на символ
    now_ts = time.monotonic()
    last = _ticker_last_update.get(symbol, 0)
    if now_ts - last < TICKER_UPDATE_INTERVAL:
        return
    _ticker_last_update[symbol] = now_ts

    mp = Decimal(str(mark_price))
    now = datetime.now(timezone.utc)

    try:
        async with async_session() as db:
            stmt = select(Position).where(
                Position.symbol == symbol,
                Position.status == PositionStatus.OPEN,
            )
            result = await db.execute(stmt)
            positions = result.scalars().all()

            if not positions:
                return

            for position in positions:
                position.current_price = mp
                position.updated_at = now

                # Пики цены
                if position.max_price is None or mp > position.max_price:
                    position.max_price = mp
                if position.min_price is None or mp < position.min_price:
                    position.min_price = mp

                # Расчёт unrealized PnL
                qty = float(position.quantity)
                entry = float(position.entry_price)
                if position.side == PositionSide.LONG:
                    upnl = (float(mp) - entry) * qty
                else:
                    upnl = (entry - float(mp)) * qty
                upnl_d = Decimal(str(round(upnl, 6)))
                position.unrealized_pnl = upnl_d

                # Пики PnL
                if upnl_d > position.max_pnl:
                    position.max_pnl = upnl_d
                if upnl_d < position.min_pnl:
                    position.min_pnl = upnl_d

            await db.commit()

            # Публикация в Redis для каждого бота
            for position in positions:
                user_id = None
                # Найти user_id через bot → account маппинг
                for (sym, acc_id), bot_ids in _symbol_bot_map.items():
                    if sym == symbol and position.bot_id in bot_ids:
                        user_id = _account_user_map.get(acc_id)
                        break

                if user_id:
                    await _publish_event(user_id, "position_update", {
                        "symbol": symbol,
                        "side": position.side.value,
                        "size": str(position.quantity),
                        "unrealized_pnl": str(position.unrealized_pnl),
                        "mark_price": str(mp),
                        "closed": False,
                        "bot_id": str(position.bot_id),
                        "bot_ids": [str(position.bot_id)],
                        "position_id": str(position.id),
                        "entry_price": str(position.entry_price),
                        "quantity": str(position.quantity),
                        "stop_loss": str(position.stop_loss),
                        "take_profit": str(position.take_profit),
                        "trailing_stop": str(position.trailing_stop) if position.trailing_stop else None,
                        "max_pnl": str(position.max_pnl),
                        "min_pnl": str(position.min_pnl),
                        "max_price": str(position.max_price) if position.max_price else None,
                        "min_price": str(position.min_price) if position.min_price else None,
                    })

    except Exception:
        logger.debug("Ошибка обработки тикера %s", symbol, exc_info=True)


def _setup_ticker_streams(
    grouped_bots: dict[uuid.UUID, list[dict]],
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Подписаться на публичные тикеры для символов с открытыми позициями.

    Тикеры приходят ~каждую секунду → real-time цены + PnL.
    """
    global _ticker_connections

    from app.modules.market.bybit_ws import BybitWebSocketPublic

    # Собрать уникальные символы из всех ботов
    needed_symbols: set[str] = set()
    for _acc_id, bots in grouped_bots.items():
        for bot_info in bots:
            needed_symbols.add(bot_info["symbol"])

    active_symbols = set(_ticker_connections.keys())

    # Подключить новые
    for symbol in needed_symbols - active_symbols:
        try:
            ws = BybitWebSocketPublic()

            def _make_ticker_handler(sym: str):
                def handler(data: dict) -> None:
                    asyncio.run_coroutine_threadsafe(
                        _handle_ticker_event(sym, data), loop,
                    )
                return handler

            ws.subscribe_ticker(symbol, _make_ticker_handler(symbol))
            _ticker_connections[symbol] = ws
            logger.info("Ticker stream подключён: %s", symbol)
        except Exception:
            logger.exception("Ошибка подписки ticker для %s", symbol)

    # Отключить ненужные
    for symbol in active_symbols - needed_symbols:
        ws = _ticker_connections.pop(symbol, None)
        if ws:
            try:
                ws.close()
            except Exception:
                pass
            logger.info("Ticker stream отключён: %s", symbol)


async def _refresh_cycle(loop: asyncio.AbstractEventLoop) -> None:
    """Один цикл обновления: загрузить ботов, подключить/отключить WS."""
    # Импорт моделей для ORM resolution
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401

    grouped_bots = await _load_running_bots()
    _build_maps(grouped_bots)

    needed_accounts = set(grouped_bots.keys())
    active_accounts = set(_active_connections.keys())

    # Подключить новые аккаунты
    to_connect = needed_accounts - active_accounts
    for account_id in to_connect:
        bots = grouped_bots[account_id]
        if bots:
            account = bots[0]["account"]
            symbols = [b["symbol"] for b in bots]
            logger.info(
                "Подключение account %s: %d ботов, символы: %s",
                account_id, len(bots), ", ".join(symbols),
            )
            _connect_account(account_id, account, loop)

    # Отключить аккаунты без активных ботов
    to_disconnect = active_accounts - needed_accounts
    for account_id in to_disconnect:
        logger.info("Отключение account %s: нет активных ботов", account_id)
        _disconnect_account(account_id)

    # Настроить kline triggers (Public WS)
    _setup_kline_triggers(grouped_bots, loop)

    # Настроить ticker streams (real-time цены)
    _setup_ticker_streams(grouped_bots, loop)

    total_bots = sum(len(bots) for bots in grouped_bots.values())
    logger.info(
        "Статус: %d аккаунтов, %d ботов, %d private WS, %d kline, %d tickers",
        len(needed_accounts), total_bots, len(_active_connections),
        len(_kline_connections), len(_ticker_connections),
    )


async def run_listener() -> None:
    """Главный цикл Bybit Private WS Listener.

    1. Загрузить RUNNING ботов, подключить WS
    2. Каждые REFRESH_INTERVAL секунд — проверить изменения
    3. При SIGTERM — graceful shutdown
    """
    global _shutdown_event
    _shutdown_event = asyncio.Event()

    loop = asyncio.get_running_loop()

    # Установить обработчики сигналов
    def _signal_handler() -> None:
        logger.info("Получен сигнал завершения, останавливаемся...")
        if _shutdown_event:
            _shutdown_event.set()

    # На Windows сигналы работают иначе — используем add_signal_handler где возможно
    try:
        loop.add_signal_handler(signal.SIGTERM, _signal_handler)
        loop.add_signal_handler(signal.SIGINT, _signal_handler)
    except NotImplementedError:
        # Windows: add_signal_handler не поддерживается для asyncio
        # Используем signal.signal как fallback
        signal.signal(signal.SIGTERM, lambda s, f: _signal_handler())
        signal.signal(signal.SIGINT, lambda s, f: _signal_handler())

    logger.info("=" * 60)
    logger.info("Bybit Private WS Listener запущен")
    logger.info("Интервал обновления: %d сек", REFRESH_INTERVAL)
    logger.info("=" * 60)

    backoff = 1
    while not _shutdown_event.is_set():
        try:
            await _refresh_cycle(loop)
            backoff = 1  # Сбросить backoff при успехе
        except Exception:
            logger.exception("Ошибка в refresh_cycle, backoff=%d сек", backoff)
            backoff = min(backoff * 2, MAX_BACKOFF)

        # Ждём REFRESH_INTERVAL или shutdown
        try:
            await asyncio.wait_for(
                _shutdown_event.wait(),
                timeout=max(REFRESH_INTERVAL, backoff),
            )
            # Если дождались — shutdown
            break
        except asyncio.TimeoutError:
            # Таймаут — нормально, следующая итерация
            continue

    # Graceful shutdown
    logger.info("Завершение: закрытие всех WS соединений...")
    _disconnect_all()
    # Закрыть kline WS
    for sym, ws in list(_kline_connections.items()):
        try:
            ws.close()
        except Exception:
            pass
    _kline_connections.clear()
    # Закрыть ticker WS
    for sym, ws in list(_ticker_connections.items()):
        try:
            ws.close()
        except Exception:
            pass
    _ticker_connections.clear()
    logger.info("Bybit Listener остановлен (private + kline + tickers)")


def main() -> None:
    """Точка входа: запуск listener как standalone процесса."""
    # Импорт моделей для ORM resolution
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.backtest.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401

    asyncio.run(run_listener())


if __name__ == "__main__":
    main()
