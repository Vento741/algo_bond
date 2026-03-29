"""Тесты модуля backtest: движок симуляции + API."""

import uuid
from datetime import datetime, timezone

import numpy as np
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.backtest.backtest_engine import BacktestMetrics, run_backtest
from app.modules.strategy.engines.base import OHLCV, Signal
from app.modules.strategy.models import Strategy, StrategyConfig


# === Helpers ===


def _flat_ohlcv(n: int = 100, price: float = 100.0) -> OHLCV:
    """Создать плоские OHLCV данные (цена не меняется)."""
    return OHLCV(
        open=np.full(n, price),
        high=np.full(n, price),
        low=np.full(n, price),
        close=np.full(n, price),
        volume=np.full(n, 1000.0),
        timestamps=np.arange(n, dtype=np.float64),
    )


def _trending_ohlcv(n: int = 100, start: float = 100.0, step: float = 1.0) -> OHLCV:
    """Создать растущие OHLCV данные."""
    prices = np.array([start + i * step for i in range(n)])
    return OHLCV(
        open=prices,
        high=prices + 0.5,
        low=prices - 0.5,
        close=prices,
        volume=np.full(n, 1000.0),
        timestamps=np.arange(n, dtype=np.float64),
    )


# === Engine Tests ===


@pytest.mark.asyncio
async def test_backtest_engine_no_trades() -> None:
    """Плоские данные без сигналов → 0 сделок."""
    ohlcv = _flat_ohlcv()
    result = run_backtest(ohlcv, signals=[], initial_capital=100.0)

    assert isinstance(result, BacktestMetrics)
    assert result.total_trades == 0
    assert result.winning_trades == 0
    assert result.losing_trades == 0
    assert result.win_rate == 0.0
    assert result.total_pnl == 0.0
    assert result.max_drawdown == 0.0
    assert len(result.equity_curve) == 100
    assert len(result.trades_log) == 0


@pytest.mark.asyncio
async def test_backtest_engine_with_trades() -> None:
    """Растущий рынок + long сигнал → прибыльная сделка."""
    ohlcv = _trending_ohlcv(n=50, start=100.0, step=1.0)

    signals = [
        Signal(
            bar_index=5,
            direction="long",
            entry_price=105.0,
            stop_loss=90.0,
            take_profit=200.0,
            trailing_atr=None,
        ),
    ]

    result = run_backtest(ohlcv, signals, initial_capital=1000.0)

    assert result.total_trades >= 1
    assert result.total_pnl > 0
    assert result.winning_trades >= 1
    assert result.win_rate > 0
    assert len(result.trades_log) >= 1
    # Сделка должна закрыться по end_of_data (TP=200 не достигнута за 50 баров)
    assert result.trades_log[0]["exit_reason"] == "end_of_data"
    assert result.trades_log[0]["direction"] == "long"


@pytest.mark.asyncio
async def test_backtest_engine_stop_loss_hit() -> None:
    """Цена падает → SL срабатывает для long."""
    # Создаём данные: сначала рост, потом падение
    n = 30
    prices = np.array(
        [100.0] * 5  # flat
        + [100.0 + i for i in range(1, 6)]  # рост до 105
        + [105.0 - i * 2 for i in range(1, 21)]  # падение
    , dtype=np.float64)
    prices = prices[:n]

    ohlcv = OHLCV(
        open=prices,
        high=prices + 0.5,
        low=prices - 0.5,
        close=prices,
        volume=np.full(n, 1000.0),
        timestamps=np.arange(n, dtype=np.float64),
    )

    signals = [
        Signal(
            bar_index=5,
            direction="long",
            entry_price=100.0,
            stop_loss=98.0,  # SL на 98
            take_profit=150.0,
            trailing_atr=None,
        ),
    ]

    result = run_backtest(ohlcv, signals, initial_capital=1000.0)

    assert result.total_trades == 1
    assert result.trades_log[0]["exit_reason"] == "stop_loss"
    assert result.total_pnl < 0  # Убыточная сделка


@pytest.mark.asyncio
async def test_backtest_engine_take_profit_hit() -> None:
    """Цена растёт → TP срабатывает для long."""
    n = 30
    prices = np.array([100.0 + i * 2 for i in range(n)], dtype=np.float64)

    ohlcv = OHLCV(
        open=prices,
        high=prices + 1.0,
        low=prices - 1.0,
        close=prices,
        volume=np.full(n, 1000.0),
        timestamps=np.arange(n, dtype=np.float64),
    )

    signals = [
        Signal(
            bar_index=2,
            direction="long",
            entry_price=104.0,
            stop_loss=90.0,
            take_profit=115.0,  # TP на 115
            trailing_atr=None,
        ),
    ]

    result = run_backtest(ohlcv, signals, initial_capital=1000.0)

    assert result.total_trades == 1
    assert result.trades_log[0]["exit_reason"] == "take_profit"
    assert result.total_pnl > 0


@pytest.mark.asyncio
async def test_backtest_engine_trailing_stop() -> None:
    """Trailing stop: цена растёт, потом падает → trail срабатывает."""
    n = 30
    # Рост до бара 15, потом падение
    prices_up = [100.0 + i * 2 for i in range(15)]
    prices_down = [prices_up[-1] - i * 3 for i in range(1, 16)]
    prices = np.array(prices_up + prices_down, dtype=np.float64)[:n]

    ohlcv = OHLCV(
        open=prices,
        high=prices + 1.0,
        low=prices - 1.0,
        close=prices,
        volume=np.full(n, 1000.0),
        timestamps=np.arange(n, dtype=np.float64),
    )

    signals = [
        Signal(
            bar_index=2,
            direction="long",
            entry_price=104.0,
            stop_loss=90.0,
            take_profit=300.0,  # Очень далёкий TP
            trailing_atr=5.0,  # Trailing stop на 5 от high
        ),
    ]

    result = run_backtest(ohlcv, signals, initial_capital=1000.0)

    assert result.total_trades == 1
    assert result.trades_log[0]["exit_reason"] == "trailing_stop"
    assert result.total_pnl > 0  # Trailing зафиксировал прибыль


@pytest.mark.asyncio
async def test_backtest_engine_equity_curve_length() -> None:
    """Equity curve имеет правильную длину."""
    ohlcv = _flat_ohlcv(n=200)
    result = run_backtest(ohlcv, signals=[], initial_capital=100.0)

    assert len(result.equity_curve) == 200
    # Все точки equity должны быть равны initial_capital
    for point in result.equity_curve:
        assert point["equity"] == 100.0


@pytest.mark.asyncio
async def test_backtest_engine_equity_curve_downsampled() -> None:
    """Equity curve сэмплируется при > 500 точках."""
    ohlcv = _flat_ohlcv(n=1000)
    result = run_backtest(ohlcv, signals=[], initial_capital=100.0)

    # Должно быть <= 502 точек (500 + возможный последний)
    assert len(result.equity_curve) <= 502


@pytest.mark.asyncio
async def test_backtest_engine_short_trade() -> None:
    """Short сделка на падающем рынке → прибыль."""
    n = 30
    prices = np.array([100.0 - i for i in range(n)], dtype=np.float64)

    ohlcv = OHLCV(
        open=prices,
        high=prices + 0.5,
        low=prices - 0.5,
        close=prices,
        volume=np.full(n, 1000.0),
        timestamps=np.arange(n, dtype=np.float64),
    )

    signals = [
        Signal(
            bar_index=2,
            direction="short",
            entry_price=98.0,
            stop_loss=110.0,
            take_profit=80.0,
            trailing_atr=None,
        ),
    ]

    result = run_backtest(ohlcv, signals, initial_capital=1000.0)

    assert result.total_trades == 1
    assert result.trades_log[0]["direction"] == "short"
    assert result.trades_log[0]["exit_reason"] == "take_profit"
    assert result.total_pnl > 0


# === Fixtures for API tests ===


@pytest_asyncio.fixture
async def test_strategy(db_session: AsyncSession) -> Strategy:
    """Создать тестовую стратегию для бэктеста."""
    strategy = Strategy(
        id=uuid.uuid4(),
        name="Lorentzian KNN",
        slug="lorentzian-knn-bt",
        engine_type="lorentzian_knn",
        description="Test strategy for backtest",
        is_public=True,
        default_config={"knn": {"neighbors": 8}},
        version="1.0.0",
    )
    db_session.add(strategy)
    await db_session.commit()
    await db_session.refresh(strategy)
    return strategy


@pytest_asyncio.fixture
async def test_strategy_config(
    db_session: AsyncSession, test_user: User, test_strategy: Strategy
) -> StrategyConfig:
    """Создать тестовый конфиг стратегии."""
    config = StrategyConfig(
        id=uuid.uuid4(),
        user_id=test_user.id,
        strategy_id=test_strategy.id,
        name="Backtest Config",
        symbol="RIVERUSDT",
        timeframe="5",
        config={"knn": {"neighbors": 8}},
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


# === API Tests ===


@pytest.mark.asyncio
async def test_backtest_api_create_run(
    client: AsyncClient,
    auth_headers: dict,
    test_strategy_config: StrategyConfig,
) -> None:
    """Создание запуска бэктеста через API."""
    payload = {
        "strategy_config_id": str(test_strategy_config.id),
        "symbol": "RIVERUSDT",
        "timeframe": "5",
        "start_date": "2025-01-01T00:00:00Z",
        "end_date": "2025-03-01T00:00:00Z",
        "initial_capital": "1000",
    }
    resp = await client.post(
        "/api/backtest/runs",
        json=payload,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "pending"
    assert data["progress"] == 0
    assert data["symbol"] == "RIVERUSDT"
    assert data["strategy_config_id"] == str(test_strategy_config.id)


@pytest.mark.asyncio
async def test_backtest_api_list_runs(
    client: AsyncClient,
    auth_headers: dict,
    test_strategy_config: StrategyConfig,
) -> None:
    """Список запусков — пустой, потом один."""
    # Пустой
    resp = await client.get("/api/backtest/runs", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []

    # Создаём
    payload = {
        "strategy_config_id": str(test_strategy_config.id),
        "symbol": "BTCUSDT",
        "timeframe": "15",
        "start_date": "2025-01-01T00:00:00Z",
        "end_date": "2025-02-01T00:00:00Z",
        "initial_capital": "500",
    }
    await client.post(
        "/api/backtest/runs",
        json=payload,
        headers=auth_headers,
    )

    # Теперь один
    resp = await client.get("/api/backtest/runs", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["symbol"] == "BTCUSDT"


@pytest.mark.asyncio
async def test_backtest_api_get_run(
    client: AsyncClient,
    auth_headers: dict,
    test_strategy_config: StrategyConfig,
) -> None:
    """Получение запуска бэктеста по ID."""
    payload = {
        "strategy_config_id": str(test_strategy_config.id),
        "symbol": "ETHUSDT",
        "timeframe": "5",
        "start_date": "2025-01-01T00:00:00Z",
        "end_date": "2025-03-01T00:00:00Z",
        "initial_capital": "100",
    }
    create_resp = await client.post(
        "/api/backtest/runs",
        json=payload,
        headers=auth_headers,
    )
    run_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/backtest/runs/{run_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == run_id
    assert resp.json()["symbol"] == "ETHUSDT"


@pytest.mark.asyncio
async def test_backtest_api_get_run_not_found(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    """Запуск не найден — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"/api/backtest/runs/{fake_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_backtest_api_unauthorized(
    client: AsyncClient,
    test_strategy_config: StrategyConfig,
) -> None:
    """Запрос без авторизации — 401."""
    payload = {
        "strategy_config_id": str(test_strategy_config.id),
        "symbol": "RIVERUSDT",
        "timeframe": "5",
        "start_date": "2025-01-01T00:00:00Z",
        "end_date": "2025-03-01T00:00:00Z",
        "initial_capital": "100",
    }
    # POST без headers
    resp = await client.post("/api/backtest/runs", json=payload)
    assert resp.status_code == 401

    # GET без headers
    resp = await client.get("/api/backtest/runs")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_backtest_api_result_not_found(
    client: AsyncClient,
    auth_headers: dict,
    test_strategy_config: StrategyConfig,
) -> None:
    """Результат бэктеста не найден — 404 (run создан, но не запущен)."""
    payload = {
        "strategy_config_id": str(test_strategy_config.id),
        "symbol": "RIVERUSDT",
        "timeframe": "5",
        "start_date": "2025-01-01T00:00:00Z",
        "end_date": "2025-03-01T00:00:00Z",
        "initial_capital": "100",
    }
    create_resp = await client.post(
        "/api/backtest/runs",
        json=payload,
        headers=auth_headers,
    )
    run_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/backtest/runs/{run_id}/result",
        headers=auth_headers,
    )
    assert resp.status_code == 404
