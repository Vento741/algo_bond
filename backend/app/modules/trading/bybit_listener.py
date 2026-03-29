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

# Маппинг: (symbol, exchange_account_id) → list[bot_id]
_symbol_bot_map: dict[tuple[str, uuid.UUID], list[uuid.UUID]] = {}

# Маппинг: exchange_account_id → user_id (для broadcast)
_account_user_map: dict[uuid.UUID, uuid.UUID] = {}

# Интервал проверки новых ботов (секунды)
REFRESH_INTERVAL = 60

# Максимальный backoff при ошибках подключения (секунды)
MAX_BACKOFF = 300


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

    - Обновляет unrealized_pnl
    - Если size == 0: позиция закрыта → realized_pnl, обновить bot stats
    - Записывает BotLog
    - Публикует в Redis
    """
    from sqlalchemy import select

    from app.database import async_session
    from app.modules.trading.models import Bot, Position, PositionStatus

    symbol = pos_data.get("symbol", "")
    size = pos_data.get("size", "0")
    unrealized_pnl = pos_data.get("unrealized_pnl", "0")
    side = pos_data.get("side", "")

    bot_ids = _find_bots_for_event(symbol, exchange_account_id)
    if not bot_ids:
        logger.debug("Нет ботов для позиции %s account=%s", symbol, exchange_account_id)
        return

    logger.info(
        "Position event: %s side=%s size=%s pnl=%s bots=%d",
        symbol, side, size, unrealized_pnl, len(bot_ids),
    )

    position_closed = float(size) == 0

    try:
        async with async_session() as db:
            for bot_id in bot_ids:
                # Найти открытую позицию для этого бота
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
                    # Позиция закрыта на бирже
                    position.status = PositionStatus.CLOSED
                    position.closed_at = datetime.now(timezone.utc)
                    position.unrealized_pnl = Decimal("0")

                    # Рассчитать realized_pnl из данных позиции
                    # Bybit не отправляет realized_pnl в position stream напрямую,
                    # используем unrealized_pnl последнего обновления перед закрытием
                    if position.realized_pnl is None:
                        position.realized_pnl = Decimal(unrealized_pnl)

                    # Обновить статистику бота
                    bot_result = await db.execute(
                        select(Bot).where(Bot.id == bot_id)
                    )
                    bot = bot_result.scalar_one_or_none()
                    if bot:
                        pnl_value = position.realized_pnl or Decimal("0")
                        bot.total_pnl = (bot.total_pnl or Decimal("0")) + pnl_value

                        # Пересчитать win_rate
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
                else:
                    # Обновить unrealized PnL
                    position.unrealized_pnl = Decimal(unrealized_pnl)

                await db.commit()

            # Публикация в Redis
            user_id = _account_user_map.get(exchange_account_id)
            if user_id:
                await _publish_event(user_id, "position_update", {
                    "symbol": symbol,
                    "side": side,
                    "size": size,
                    "unrealized_pnl": unrealized_pnl,
                    "closed": position_closed,
                    "bot_ids": [str(b) for b in bot_ids],
                })

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

    total_bots = sum(len(bots) for bots in grouped_bots.values())
    logger.info(
        "Статус: %d аккаунтов, %d ботов, %d WS соединений",
        len(needed_accounts), total_bots, len(_active_connections),
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
    logger.info("Bybit Private WS Listener остановлен")


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
