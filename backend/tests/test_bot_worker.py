"""Тесты bot_worker — unit tests с мокированием."""

import uuid
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_value
from app.modules.auth.models import ExchangeAccount, ExchangeType, User
from app.modules.strategy.engines.base import OHLCV, Signal, StrategyResult
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.trading.bot_worker import MIN_CANDLES, run_bot_cycle
from app.modules.trading.models import Bot, BotMode, BotStatus

# Фабрика тестовых сессий (тот же test_engine что в conftest)
from tests.conftest import test_session


def _make_flat_candles(count: int = MIN_CANDLES) -> list[dict]:
    """Создать плоские свечи (без сигналов)."""
    return [
        {
            "timestamp": i * 60000,
            "open": 100.0,
            "high": 101.0,
            "low": 99.0,
            "close": 100.0,
            "volume": 1000.0,
            "turnover": 100000.0,
        }
        for i in range(count)
    ]


def _make_flat_arrays(count: int = MIN_CANDLES) -> dict:
    """Создать numpy-массивы для плоских свечей."""
    return {
        "open": np.full(count, 100.0),
        "high": np.full(count, 101.0),
        "low": np.full(count, 99.0),
        "close": np.full(count, 100.0),
        "volume": np.full(count, 1000.0),
        "timestamps": np.arange(count, dtype=np.float64) * 60000,
    }


@pytest_asyncio.fixture
async def bot_with_deps(db_session: AsyncSession, test_user: User) -> Bot:
    """Создать бота со всеми зависимостями."""
    # Strategy
    strategy = Strategy(
        name="Test KNN",
        slug=f"test-knn-{uuid.uuid4().hex[:6]}",
        engine_type="lorentzian_knn",
        default_config={"knn": {"neighbors": 8}},
    )
    db_session.add(strategy)
    await db_session.flush()

    # Strategy Config
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

    # Exchange Account (с реальным шифрованием)
    exchange = ExchangeAccount(
        user_id=test_user.id,
        exchange=ExchangeType.BYBIT,
        label="Test",
        api_key_encrypted=encrypt_value("test_key"),
        api_secret_encrypted=encrypt_value("test_secret"),
        is_testnet=True,
    )
    db_session.add(exchange)
    await db_session.flush()

    # Bot
    bot = Bot(
        user_id=test_user.id,
        strategy_config_id=config.id,
        exchange_account_id=exchange.id,
        status=BotStatus.RUNNING,
        mode=BotMode.DEMO,
    )
    db_session.add(bot)
    await db_session.commit()
    await db_session.refresh(bot)
    return bot


@pytest.mark.asyncio
async def test_bot_cycle_not_found() -> None:
    """Несуществующий бот — error."""
    result = await run_bot_cycle(uuid.uuid4(), session_factory=test_session)
    assert result["status"] == "error"
    assert "not found" in result["message"].lower()


@pytest.mark.asyncio
async def test_bot_cycle_stopped(
    bot_with_deps: Bot, db_session: AsyncSession
) -> None:
    """Остановленный бот — skip."""
    bot_with_deps.status = BotStatus.STOPPED
    await db_session.commit()

    result = await run_bot_cycle(bot_with_deps.id, session_factory=test_session)
    assert result["status"] == "skipped"


@pytest.mark.asyncio
async def test_bot_cycle_error_status(
    bot_with_deps: Bot, db_session: AsyncSession
) -> None:
    """Бот в статусе error — skip."""
    bot_with_deps.status = BotStatus.ERROR
    await db_session.commit()

    result = await run_bot_cycle(bot_with_deps.id, session_factory=test_session)
    assert result["status"] == "skipped"


@pytest.mark.asyncio
async def test_bot_cycle_not_enough_candles(bot_with_deps: Bot) -> None:
    """Недостаточно свечей — error."""
    with patch("app.modules.trading.bot_worker._create_client") as mock_create:
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        # Возвращаем только 50 свечей (нужно 200)
        mock_client.get_klines.return_value = _make_flat_candles(50)

        result = await run_bot_cycle(
            bot_with_deps.id, session_factory=test_session
        )

    assert result["status"] == "error"
    assert "not enough candles" in result["message"].lower()


@pytest.mark.asyncio
async def test_bot_cycle_no_signal(bot_with_deps: Bot) -> None:
    """Стратегия не генерирует сигнал — no_signal."""
    with (
        patch("app.modules.trading.bot_worker._create_client") as mock_create,
        patch("app.modules.trading.bot_worker.get_engine") as mock_engine,
    ):
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        mock_client.get_klines.return_value = _make_flat_candles()
        mock_client.klines_to_arrays.return_value = _make_flat_arrays()

        # Стратегия без сигналов
        engine_instance = MagicMock()
        engine_instance.generate_signals.return_value = StrategyResult(
            signals=[],
            confluence_scores_long=np.zeros(MIN_CANDLES),
            confluence_scores_short=np.zeros(MIN_CANDLES),
            knn_scores=np.zeros(MIN_CANDLES),
            knn_classes=np.zeros(MIN_CANDLES),
        )
        mock_engine.return_value = engine_instance

        result = await run_bot_cycle(
            bot_with_deps.id, session_factory=test_session
        )

    assert result["status"] == "no_signal"


@pytest.mark.asyncio
async def test_bot_cycle_old_signal(bot_with_deps: Bot) -> None:
    """Сигнал слишком старый — no_signal."""
    with (
        patch("app.modules.trading.bot_worker._create_client") as mock_create,
        patch("app.modules.trading.bot_worker.get_engine") as mock_engine,
    ):
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        mock_client.get_klines.return_value = _make_flat_candles()
        mock_client.klines_to_arrays.return_value = _make_flat_arrays()

        # Сигнал на баре 10 (далеко от последнего 199)
        old_signal = Signal(
            bar_index=10,
            direction="long",
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=110.0,
            confluence_score=0.8,
            signal_type="trend",
        )
        engine_instance = MagicMock()
        engine_instance.generate_signals.return_value = StrategyResult(
            signals=[old_signal],
            confluence_scores_long=np.zeros(MIN_CANDLES),
            confluence_scores_short=np.zeros(MIN_CANDLES),
            knn_scores=np.zeros(MIN_CANDLES),
            knn_classes=np.zeros(MIN_CANDLES),
        )
        mock_engine.return_value = engine_instance

        result = await run_bot_cycle(
            bot_with_deps.id, session_factory=test_session
        )

    assert result["status"] == "no_signal"
    assert "too old" in result.get("message", "").lower()


@pytest.mark.asyncio
async def test_bot_cycle_fresh_signal_places_order(bot_with_deps: Bot) -> None:
    """Свежий сигнал → ордер размещён на Bybit."""
    from app.modules.market.bybit_client import SymbolInfo, Ticker

    with (
        patch("app.modules.trading.bot_worker._create_client") as mock_create,
        patch("app.modules.trading.bot_worker.get_engine") as mock_engine,
    ):
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        mock_client.get_klines.return_value = _make_flat_candles()
        mock_client.klines_to_arrays.return_value = _make_flat_arrays()

        # Свежий сигнал на предпоследнем баре
        fresh_signal = Signal(
            bar_index=MIN_CANDLES - 1,
            direction="long",
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=110.0,
            trailing_atr=2.5,
            confluence_score=0.85,
            signal_type="trend",
        )
        engine_instance = MagicMock()
        engine_instance.generate_signals.return_value = StrategyResult(
            signals=[fresh_signal],
            confluence_scores_long=np.full(MIN_CANDLES, 0.85),
            confluence_scores_short=np.full(MIN_CANDLES, 0.15),
            knn_scores=np.full(MIN_CANDLES, 0.9),
            knn_classes=np.ones(MIN_CANDLES),
        )
        mock_engine.return_value = engine_instance

        # Мокируем Bybit API ответы
        mock_client.get_wallet_balance.return_value = {
            "coin": "USDT",
            "wallet_balance": 1000.0,
            "available": 1000.0,
            "equity": 1000.0,
            "unrealized_pnl": 0.0,
        }
        mock_client.get_symbol_info.return_value = SymbolInfo(
            symbol="BTCUSDT",
            tick_size=0.01,
            qty_step=0.001,
            min_qty=0.001,
            max_qty=100.0,
            min_notional=5.0,
            max_leverage=100.0,
        )
        mock_client.get_ticker.return_value = Ticker(
            symbol="BTCUSDT",
            last_price=100.0,
            mark_price=100.0,
            index_price=100.0,
            volume_24h=1000000.0,
            turnover_24h=100000000.0,
            high_24h=105.0,
            low_24h=95.0,
            funding_rate=0.0001,
            open_interest=50000.0,
            bid1_price=99.99,
            ask1_price=100.01,
        )
        mock_client.place_order.return_value = {
            "orderId": "test-order-123",
            "orderLinkId": "ab-test",
        }

        result = await run_bot_cycle(
            bot_with_deps.id, session_factory=test_session
        )

    assert result["status"] == "ok"
    assert result["signal"]["direction"] == "long"
    assert result["signal"]["confluence"] == 0.85
    assert result["order"]["order_id"] == "test-order-123"
    assert result["order"]["side"] == "Buy"
    assert result["order"]["symbol"] == "BTCUSDT"
    assert result["order"]["qty"] > 0

    # Проверяем что place_order был вызван
    mock_client.place_order.assert_called_once()
    call_kwargs = mock_client.place_order.call_args
    assert call_kwargs.kwargs["symbol"] == "BTCUSDT"
    assert call_kwargs.kwargs["side"] == "Buy"
    assert call_kwargs.kwargs["order_type"] == "Market"


@pytest.mark.asyncio
async def test_bot_cycle_short_signal(bot_with_deps: Bot) -> None:
    """Short-сигнал → Sell ордер."""
    from app.modules.market.bybit_client import SymbolInfo, Ticker

    with (
        patch("app.modules.trading.bot_worker._create_client") as mock_create,
        patch("app.modules.trading.bot_worker.get_engine") as mock_engine,
    ):
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        mock_client.get_klines.return_value = _make_flat_candles()
        mock_client.klines_to_arrays.return_value = _make_flat_arrays()

        short_signal = Signal(
            bar_index=MIN_CANDLES - 1,
            direction="short",
            entry_price=100.0,
            stop_loss=105.0,
            take_profit=90.0,
            confluence_score=0.75,
            signal_type="trend",
        )
        engine_instance = MagicMock()
        engine_instance.generate_signals.return_value = StrategyResult(
            signals=[short_signal],
            confluence_scores_long=np.full(MIN_CANDLES, 0.25),
            confluence_scores_short=np.full(MIN_CANDLES, 0.75),
            knn_scores=np.full(MIN_CANDLES, 0.8),
            knn_classes=np.full(MIN_CANDLES, -1),
        )
        mock_engine.return_value = engine_instance

        mock_client.get_wallet_balance.return_value = {
            "coin": "USDT", "available": 500.0,
            "wallet_balance": 500.0, "equity": 500.0,
            "unrealized_pnl": 0.0,
        }
        mock_client.get_symbol_info.return_value = SymbolInfo(
            symbol="BTCUSDT", tick_size=0.01, qty_step=0.001,
            min_qty=0.001, max_qty=100.0, min_notional=5.0,
            max_leverage=100.0,
        )
        mock_client.get_ticker.return_value = Ticker(
            symbol="BTCUSDT", last_price=100.0, mark_price=100.0,
            index_price=100.0, volume_24h=1000000.0,
            turnover_24h=100000000.0, high_24h=105.0,
            low_24h=95.0, funding_rate=0.0001,
            open_interest=50000.0, bid1_price=99.99,
            ask1_price=100.01,
        )
        mock_client.place_order.return_value = {
            "orderId": "short-order-456",
        }

        result = await run_bot_cycle(
            bot_with_deps.id, session_factory=test_session
        )

    assert result["status"] == "ok"
    assert result["signal"]["direction"] == "short"
    assert result["order"]["side"] == "Sell"


@pytest.mark.asyncio
async def test_bot_cycle_bybit_api_error(bot_with_deps: Bot) -> None:
    """Ошибка Bybit API при размещении ордера."""
    from app.modules.market.bybit_client import BybitAPIError, SymbolInfo, Ticker

    with (
        patch("app.modules.trading.bot_worker._create_client") as mock_create,
        patch("app.modules.trading.bot_worker.get_engine") as mock_engine,
    ):
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        mock_client.get_klines.return_value = _make_flat_candles()
        mock_client.klines_to_arrays.return_value = _make_flat_arrays()

        fresh_signal = Signal(
            bar_index=MIN_CANDLES - 1,
            direction="long",
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=110.0,
            confluence_score=0.8,
            signal_type="trend",
        )
        engine_instance = MagicMock()
        engine_instance.generate_signals.return_value = StrategyResult(
            signals=[fresh_signal],
            confluence_scores_long=np.full(MIN_CANDLES, 0.8),
            confluence_scores_short=np.full(MIN_CANDLES, 0.2),
            knn_scores=np.full(MIN_CANDLES, 0.85),
            knn_classes=np.ones(MIN_CANDLES),
        )
        mock_engine.return_value = engine_instance

        mock_client.get_wallet_balance.return_value = {
            "coin": "USDT", "available": 1000.0,
            "wallet_balance": 1000.0, "equity": 1000.0,
            "unrealized_pnl": 0.0,
        }
        mock_client.get_symbol_info.return_value = SymbolInfo(
            symbol="BTCUSDT", tick_size=0.01, qty_step=0.001,
            min_qty=0.001, max_qty=100.0, min_notional=5.0,
            max_leverage=100.0,
        )
        mock_client.get_ticker.return_value = Ticker(
            symbol="BTCUSDT", last_price=100.0, mark_price=100.0,
            index_price=100.0, volume_24h=1000000.0,
            turnover_24h=100000000.0, high_24h=105.0,
            low_24h=95.0, funding_rate=0.0001,
            open_interest=50000.0, bid1_price=99.99,
            ask1_price=100.01,
        )
        # place_order выбрасывает BybitAPIError
        mock_client.place_order.side_effect = BybitAPIError(
            110001, "Insufficient balance"
        )

        result = await run_bot_cycle(
            bot_with_deps.id, session_factory=test_session
        )

    assert result["status"] == "error"
    assert "bybit" in result["message"].lower()
    assert "insufficient balance" in result["message"].lower()


@pytest.mark.asyncio
async def test_bot_cycle_qty_too_small(bot_with_deps: Bot) -> None:
    """Размер позиции меньше минимума — error."""
    from app.modules.market.bybit_client import SymbolInfo, Ticker

    with (
        patch("app.modules.trading.bot_worker._create_client") as mock_create,
        patch("app.modules.trading.bot_worker.get_engine") as mock_engine,
    ):
        mock_client = MagicMock()
        mock_create.return_value = mock_client
        mock_client.get_klines.return_value = _make_flat_candles()
        mock_client.klines_to_arrays.return_value = _make_flat_arrays()

        fresh_signal = Signal(
            bar_index=MIN_CANDLES - 1,
            direction="long",
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=110.0,
            confluence_score=0.8,
            signal_type="trend",
        )
        engine_instance = MagicMock()
        engine_instance.generate_signals.return_value = StrategyResult(
            signals=[fresh_signal],
            confluence_scores_long=np.full(MIN_CANDLES, 0.8),
            confluence_scores_short=np.full(MIN_CANDLES, 0.2),
            knn_scores=np.full(MIN_CANDLES, 0.85),
            knn_classes=np.ones(MIN_CANDLES),
        )
        mock_engine.return_value = engine_instance

        # Очень маленький баланс → qty < min_qty
        mock_client.get_wallet_balance.return_value = {
            "coin": "USDT", "available": 0.01,
            "wallet_balance": 0.01, "equity": 0.01,
            "unrealized_pnl": 0.0,
        }
        mock_client.get_symbol_info.return_value = SymbolInfo(
            symbol="BTCUSDT", tick_size=0.01, qty_step=0.001,
            min_qty=0.001, max_qty=100.0, min_notional=5.0,
            max_leverage=100.0,
        )
        mock_client.get_ticker.return_value = Ticker(
            symbol="BTCUSDT", last_price=50000.0, mark_price=50000.0,
            index_price=50000.0, volume_24h=1000000.0,
            turnover_24h=100000000.0, high_24h=55000.0,
            low_24h=45000.0, funding_rate=0.0001,
            open_interest=50000.0, bid1_price=49999.0,
            ask1_price=50001.0,
        )

        result = await run_bot_cycle(
            bot_with_deps.id, session_factory=test_session
        )

    assert result["status"] == "error"
    assert "qty too small" in result["message"].lower()
