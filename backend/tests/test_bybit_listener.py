"""Тесты Bybit Private WS Listener — unit tests с мокированием."""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_value
from app.modules.auth.models import ExchangeAccount, ExchangeType, User
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.trading.models import (
    Bot,
    BotLog,
    BotMode,
    BotStatus,
    Order,
    OrderSide,
    OrderStatus,
    OrderType,
    Position,
    PositionSide,
    PositionStatus,
)

from tests.conftest import test_session


# === Fixtures ===


@pytest_asyncio.fixture
async def listener_bot(db_session: AsyncSession, test_user: User) -> Bot:
    """Создать RUNNING бота для тестов listener."""
    strategy = Strategy(
        name="Test KNN",
        slug=f"test-knn-{uuid.uuid4().hex[:6]}",
        engine_type="lorentzian_knn",
        default_config={"knn": {"neighbors": 8}},
    )
    db_session.add(strategy)
    await db_session.flush()

    config = StrategyConfig(
        user_id=test_user.id,
        strategy_id=strategy.id,
        name="Test Config",
        symbol="BTCUSDT",
        timeframe="5",
        config={},
    )
    db_session.add(config)
    await db_session.flush()

    exchange = ExchangeAccount(
        user_id=test_user.id,
        exchange=ExchangeType.BYBIT,
        label="Test",
        api_key_encrypted=encrypt_value("test_api_key"),
        api_secret_encrypted=encrypt_value("test_api_secret"),
        is_testnet=True,
        is_active=True,
    )
    db_session.add(exchange)
    await db_session.flush()

    bot = Bot(
        user_id=test_user.id,
        strategy_config_id=config.id,
        exchange_account_id=exchange.id,
        status=BotStatus.RUNNING,
        mode=BotMode.DEMO,
        total_pnl=Decimal("0"),
        total_trades=0,
    )
    db_session.add(bot)
    await db_session.commit()
    await db_session.refresh(bot)
    return bot


@pytest_asyncio.fixture
async def listener_order(
    db_session: AsyncSession, listener_bot: Bot,
) -> Order:
    """Создать тестовый ордер."""
    order = Order(
        bot_id=listener_bot.id,
        exchange_order_id="bybit-order-123",
        symbol="BTCUSDT",
        side=OrderSide.BUY,
        type=OrderType.MARKET,
        quantity=Decimal("0.001"),
        price=Decimal("50000"),
        status=OrderStatus.OPEN,
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)
    return order


@pytest_asyncio.fixture
async def listener_position(
    db_session: AsyncSession, listener_bot: Bot,
) -> Position:
    """Создать тестовую позицию."""
    position = Position(
        bot_id=listener_bot.id,
        symbol="BTCUSDT",
        side=PositionSide.LONG,
        entry_price=Decimal("50000"),
        quantity=Decimal("0.001"),
        stop_loss=Decimal("49000"),
        take_profit=Decimal("52000"),
        unrealized_pnl=Decimal("0"),
        status=PositionStatus.OPEN,
    )
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)
    return position


# === Tests: _load_running_bots ===


@pytest.mark.asyncio
async def test_load_running_bots_returns_grouped(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """_load_running_bots возвращает ботов, сгруппированных по account_id."""
    from app.modules.trading.bybit_listener import _load_running_bots

    with patch("app.database.async_session", test_session):
        grouped = await _load_running_bots()

    assert len(grouped) == 1
    account_id = listener_bot.exchange_account_id
    assert account_id in grouped
    assert len(grouped[account_id]) == 1
    assert grouped[account_id][0]["bot_id"] == listener_bot.id
    assert grouped[account_id][0]["symbol"] == "BTCUSDT"


@pytest.mark.asyncio
async def test_load_running_bots_ignores_stopped(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """_load_running_bots не возвращает остановленных ботов."""
    listener_bot.status = BotStatus.STOPPED
    db_session.add(listener_bot)
    await db_session.commit()

    from app.modules.trading.bybit_listener import _load_running_bots

    with patch("app.database.async_session", test_session):
        grouped = await _load_running_bots()

    assert len(grouped) == 0


# === Tests: _build_maps ===


def test_build_maps_creates_correct_mappings() -> None:
    """_build_maps корректно заполняет symbol_bot_map и account_user_map."""
    from app.modules.trading.bybit_listener import (
        _account_user_map,
        _build_maps,
        _symbol_bot_map,
    )

    account_id = uuid.uuid4()
    bot_id = uuid.uuid4()
    user_id = uuid.uuid4()

    grouped = {
        account_id: [
            {
                "bot_id": bot_id,
                "symbol": "ETHUSDT",
                "user_id": user_id,
                "account": MagicMock(),
            },
        ],
    }

    _build_maps(grouped)

    from app.modules.trading import bybit_listener

    assert (("ETHUSDT", account_id)) in bybit_listener._symbol_bot_map
    assert bot_id in bybit_listener._symbol_bot_map[("ETHUSDT", account_id)]
    assert bybit_listener._account_user_map[account_id] == user_id


# === Tests: _find_bots_for_event ===


def test_find_bots_for_event_returns_correct_bots() -> None:
    """_find_bots_for_event возвращает ботов для символа и аккаунта."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _find_bots_for_event

    account_id = uuid.uuid4()
    bot_id = uuid.uuid4()

    bybit_listener._symbol_bot_map = {
        ("BTCUSDT", account_id): [bot_id],
    }

    result = _find_bots_for_event("BTCUSDT", account_id)
    assert result == [bot_id]


def test_find_bots_for_event_returns_empty_for_unknown() -> None:
    """_find_bots_for_event возвращает пустой список для неизвестного символа."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _find_bots_for_event

    bybit_listener._symbol_bot_map = {}
    result = _find_bots_for_event("UNKNOWN", uuid.uuid4())
    assert result == []


# === Tests: _handle_order_event ===


@pytest.mark.asyncio
async def test_handle_order_filled_updates_db(
    db_session: AsyncSession, listener_bot: Bot, listener_order: Order,
) -> None:
    """_handle_order_event обновляет статус ордера на FILLED."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_order_event

    account_id = listener_bot.exchange_account_id
    bybit_listener._account_user_map = {account_id: listener_bot.user_id}

    order_data = {
        "order_id": "bybit-order-123",
        "order_link_id": "",
        "symbol": "BTCUSDT",
        "side": "Buy",
        "order_type": "Market",
        "price": "50000",
        "qty": "0.001",
        "status": "Filled",
        "avg_price": "50050",
        "cum_exec_qty": "0.001",
        "take_profit": "52000",
        "stop_loss": "49000",
    }

    with (
        patch("app.database.async_session", test_session),
        patch(
            "app.modules.trading.bybit_listener._publish_event",
            new_callable=AsyncMock,
        ) as mock_publish,
        patch(
            "app.modules.trading.bybit_listener._write_bot_log",
            new_callable=AsyncMock,
        ),
    ):
        await _handle_order_event(account_id, order_data)

    # Проверить обновление в БД
    await db_session.refresh(listener_order)
    assert listener_order.status == OrderStatus.FILLED
    assert listener_order.filled_price == Decimal("50050")
    assert listener_order.filled_at is not None

    # Проверить публикацию в Redis
    mock_publish.assert_called_once()
    call_args = mock_publish.call_args
    assert call_args[0][0] == listener_bot.user_id
    assert call_args[0][1] == "order_update"


@pytest.mark.asyncio
async def test_handle_order_cancelled_updates_db(
    db_session: AsyncSession, listener_bot: Bot, listener_order: Order,
) -> None:
    """_handle_order_event обновляет статус ордера на CANCELLED."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_order_event

    account_id = listener_bot.exchange_account_id
    bybit_listener._account_user_map = {account_id: listener_bot.user_id}

    order_data = {
        "order_id": "bybit-order-123",
        "order_link_id": "",
        "symbol": "BTCUSDT",
        "side": "Buy",
        "status": "Cancelled",
        "avg_price": "0",
        "qty": "0.001",
        "cum_exec_qty": "0",
    }

    with (
        patch("app.database.async_session", test_session),
        patch(
            "app.modules.trading.bybit_listener._publish_event",
            new_callable=AsyncMock,
        ),
        patch(
            "app.modules.trading.bybit_listener._write_bot_log",
            new_callable=AsyncMock,
        ),
    ):
        await _handle_order_event(account_id, order_data)

    await db_session.refresh(listener_order)
    assert listener_order.status == OrderStatus.CANCELLED


@pytest.mark.asyncio
async def test_handle_order_partial_fill_skipped(
    db_session: AsyncSession, listener_bot: Bot, listener_order: Order,
) -> None:
    """_handle_order_event пропускает промежуточные статусы (PartiallyFilled)."""
    from app.modules.trading.bybit_listener import _handle_order_event

    account_id = listener_bot.exchange_account_id
    order_data = {
        "order_id": "bybit-order-123",
        "order_link_id": "",
        "symbol": "BTCUSDT",
        "side": "Buy",
        "status": "PartiallyFilled",
        "avg_price": "50025",
        "qty": "0.001",
        "cum_exec_qty": "0.0005",
    }

    with patch("app.database.async_session", test_session):
        await _handle_order_event(account_id, order_data)

    # Статус не должен измениться
    await db_session.refresh(listener_order)
    assert listener_order.status == OrderStatus.OPEN


@pytest.mark.asyncio
async def test_handle_order_unknown_order_id_is_noop(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """_handle_order_event не падает, если ордер не найден в БД."""
    from app.modules.trading.bybit_listener import _handle_order_event

    account_id = listener_bot.exchange_account_id
    order_data = {
        "order_id": "nonexistent-order-id",
        "order_link_id": "",
        "symbol": "BTCUSDT",
        "side": "Buy",
        "status": "Filled",
        "avg_price": "50000",
        "qty": "0.001",
        "cum_exec_qty": "0.001",
    }

    with patch("app.database.async_session", test_session):
        # Не должно быть исключений
        await _handle_order_event(account_id, order_data)


# === Tests: _handle_position_event ===


@pytest.mark.asyncio
async def test_handle_position_closed_updates_db(
    db_session: AsyncSession,
    listener_bot: Bot,
    listener_position: Position,
) -> None:
    """_handle_position_event закрывает позицию при size=0."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_position_event

    account_id = listener_bot.exchange_account_id
    bybit_listener._symbol_bot_map = {
        ("BTCUSDT", account_id): [listener_bot.id],
    }
    bybit_listener._account_user_map = {account_id: listener_bot.user_id}

    pos_data = {
        "symbol": "BTCUSDT",
        "side": "Buy",
        "size": "0",
        "avg_price": "50000",
        "mark_price": "50500",
        "unrealized_pnl": "0.5",
        "leverage": "1",
        "take_profit": "52000",
        "stop_loss": "49000",
        "trailing_stop": "0",
        "liq_price": "0",
    }

    with (
        patch("app.database.async_session", test_session),
        patch(
            "app.modules.trading.bybit_listener._publish_event",
            new_callable=AsyncMock,
        ) as mock_publish,
        patch(
            "app.modules.trading.bybit_listener._write_bot_log",
            new_callable=AsyncMock,
        ),
    ):
        await _handle_position_event(account_id, pos_data)

    await db_session.refresh(listener_position)
    assert listener_position.status == PositionStatus.CLOSED
    assert listener_position.closed_at is not None
    assert listener_position.realized_pnl == Decimal("0.5")

    # Проверить broadcast
    mock_publish.assert_called_once()
    call_args = mock_publish.call_args
    assert call_args[0][1] == "position_update"
    assert call_args[0][2]["closed"] is True


@pytest.mark.asyncio
async def test_handle_position_updates_unrealized_pnl(
    db_session: AsyncSession,
    listener_bot: Bot,
    listener_position: Position,
) -> None:
    """_handle_position_event обновляет unrealized_pnl при открытой позиции."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_position_event

    account_id = listener_bot.exchange_account_id
    bybit_listener._symbol_bot_map = {
        ("BTCUSDT", account_id): [listener_bot.id],
    }
    bybit_listener._account_user_map = {account_id: listener_bot.user_id}

    pos_data = {
        "symbol": "BTCUSDT",
        "side": "Buy",
        "size": "0.001",
        "unrealized_pnl": "1.25",
    }

    with (
        patch("app.database.async_session", test_session),
        patch(
            "app.modules.trading.bybit_listener._publish_event",
            new_callable=AsyncMock,
        ),
        patch(
            "app.modules.trading.bybit_listener._write_bot_log",
            new_callable=AsyncMock,
        ),
    ):
        await _handle_position_event(account_id, pos_data)

    await db_session.refresh(listener_position)
    assert listener_position.status == PositionStatus.OPEN
    assert listener_position.unrealized_pnl == Decimal("1.25")


@pytest.mark.asyncio
async def test_handle_position_no_bots_is_noop(
    db_session: AsyncSession,
) -> None:
    """_handle_position_event — noop если нет ботов для символа."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_position_event

    bybit_listener._symbol_bot_map = {}

    pos_data = {
        "symbol": "XYZUSDT",
        "side": "Buy",
        "size": "1",
        "unrealized_pnl": "0",
    }

    # Не должно быть исключений
    await _handle_position_event(uuid.uuid4(), pos_data)


# === Tests: _handle_execution_event ===


@pytest.mark.asyncio
async def test_handle_execution_writes_log(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """_handle_execution_event записывает BotLog."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _handle_execution_event

    account_id = listener_bot.exchange_account_id
    bybit_listener._symbol_bot_map = {
        ("BTCUSDT", account_id): [listener_bot.id],
    }
    bybit_listener._account_user_map = {account_id: listener_bot.user_id}

    exec_data = {
        "order_id": "bybit-order-123",
        "symbol": "BTCUSDT",
        "side": "Buy",
        "exec_price": "50000",
        "exec_qty": "0.001",
        "exec_fee": "0.025",
        "exec_type": "Trade",
    }

    with (
        patch(
            "app.modules.trading.bybit_listener._write_bot_log",
            new_callable=AsyncMock,
        ) as mock_log,
        patch(
            "app.modules.trading.bybit_listener._publish_event",
            new_callable=AsyncMock,
        ) as mock_publish,
    ):
        await _handle_execution_event(account_id, exec_data)

    mock_log.assert_called_once()
    call_args = mock_log.call_args
    assert call_args[0][0] == listener_bot.id
    assert "Исполнение" in call_args[0][2]

    mock_publish.assert_called_once()
    assert mock_publish.call_args[0][1] == "execution"


# === Tests: _connect_account / _disconnect_account ===


def test_connect_account_success() -> None:
    """_connect_account подключается к Bybit WS."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _connect_account

    # Очистить перед тестом
    bybit_listener._active_connections.clear()

    account_id = uuid.uuid4()
    mock_account = MagicMock()
    mock_account.api_key_encrypted = encrypt_value("key")
    mock_account.api_secret_encrypted = encrypt_value("secret")
    mock_account.is_testnet = True

    loop = asyncio.new_event_loop()

    with patch(
        "app.modules.market.bybit_ws.BybitWebSocketPrivate",
    ) as mock_ws_cls:
        mock_ws = MagicMock()
        mock_ws_cls.return_value = mock_ws

        result = _connect_account(account_id, mock_account, loop)

    loop.close()

    assert result is True
    assert account_id in bybit_listener._active_connections
    mock_ws.subscribe_order.assert_called_once()
    mock_ws.subscribe_position.assert_called_once()
    mock_ws.subscribe_execution.assert_called_once()

    # Cleanup
    bybit_listener._active_connections.clear()


def test_connect_account_invalid_keys_returns_false() -> None:
    """_connect_account возвращает False при невалидных ключах."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _connect_account

    bybit_listener._active_connections.clear()

    account_id = uuid.uuid4()
    mock_account = MagicMock()
    mock_account.api_key_encrypted = "invalid_encrypted_data"
    mock_account.api_secret_encrypted = "invalid_encrypted_data"
    mock_account.is_testnet = True

    loop = asyncio.new_event_loop()
    result = _connect_account(account_id, mock_account, loop)
    loop.close()

    assert result is False
    assert account_id not in bybit_listener._active_connections


def test_disconnect_account_closes_ws() -> None:
    """_disconnect_account закрывает WS и удаляет из _active_connections."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _disconnect_account

    account_id = uuid.uuid4()
    mock_ws = MagicMock()
    bybit_listener._active_connections[account_id] = mock_ws

    _disconnect_account(account_id)

    mock_ws.close.assert_called_once()
    assert account_id not in bybit_listener._active_connections


def test_disconnect_all_closes_everything() -> None:
    """_disconnect_all закрывает все WS соединения."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _disconnect_all

    ws1 = MagicMock()
    ws2 = MagicMock()
    id1 = uuid.uuid4()
    id2 = uuid.uuid4()
    bybit_listener._active_connections = {id1: ws1, id2: ws2}

    _disconnect_all()

    ws1.close.assert_called_once()
    ws2.close.assert_called_once()
    assert len(bybit_listener._active_connections) == 0


# === Tests: _write_bot_log ===


@pytest.mark.asyncio
async def test_write_bot_log_creates_record(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """_write_bot_log записывает лог в БД."""
    from sqlalchemy import select

    from app.modules.trading.bybit_listener import _write_bot_log

    with patch("app.database.async_session", test_session):
        await _write_bot_log(
            listener_bot.id, "info", "Тестовый лог", {"key": "value"},
        )

    result = await db_session.execute(
        select(BotLog).where(BotLog.bot_id == listener_bot.id)
    )
    logs = result.scalars().all()
    assert len(logs) >= 1
    assert any("Тестовый лог" in log.message for log in logs)


# === Tests: ws_bridge ===


@pytest.mark.asyncio
async def test_ws_bridge_start_stop() -> None:
    """start_ws_bridge и stop_ws_bridge создают и отменяют task."""
    from app.modules.trading.ws_bridge import (
        _subscriber_task,
        start_ws_bridge,
        stop_ws_bridge,
    )

    with patch(
        "app.modules.trading.ws_bridge._redis_subscriber",
        new_callable=AsyncMock,
    ):
        start_ws_bridge()

        from app.modules.trading import ws_bridge

        assert ws_bridge._subscriber_task is not None
        assert not ws_bridge._subscriber_task.done()

        await stop_ws_bridge()
        assert ws_bridge._subscriber_task is None


# === Tests: _refresh_cycle ===


@pytest.mark.asyncio
async def test_refresh_cycle_connects_new_and_disconnects_old(
    db_session: AsyncSession, listener_bot: Bot,
) -> None:
    """_refresh_cycle подключает новые аккаунты и отключает старые."""
    from app.modules.trading import bybit_listener
    from app.modules.trading.bybit_listener import _refresh_cycle

    # Установить «старое» соединение, которого больше нет в БД
    old_account_id = uuid.uuid4()
    old_ws = MagicMock()
    bybit_listener._active_connections[old_account_id] = old_ws

    loop = asyncio.get_running_loop()

    with (
        patch("app.database.async_session", test_session),
        patch(
            "app.modules.trading.bybit_listener._connect_account",
            return_value=True,
        ) as mock_connect,
    ):
        await _refresh_cycle(loop)

    # Старое соединение должно быть отключено
    old_ws.close.assert_called_once()
    assert old_account_id not in bybit_listener._active_connections

    # Новое соединение должно быть создано
    mock_connect.assert_called_once()
    call_args = mock_connect.call_args
    assert call_args[0][0] == listener_bot.exchange_account_id

    # Cleanup
    bybit_listener._active_connections.clear()
