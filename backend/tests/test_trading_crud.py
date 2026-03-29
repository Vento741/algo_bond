"""Тесты CRUD модуля trading."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import ExchangeAccount, ExchangeType, User
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.trading.models import Bot, BotMode, BotStatus


@pytest_asyncio.fixture
async def test_strategy(db_session: AsyncSession) -> Strategy:
    """Создать тестовую стратегию."""
    strategy = Strategy(
        id=uuid.uuid4(),
        name="Lorentzian KNN",
        slug="lorentzian-knn",
        engine_type="lorentzian_knn",
        description="ML-based trading strategy",
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
        name="Test Config",
        symbol="RIVERUSDT",
        timeframe="5",
        config={"knn": {"neighbors": 8}},
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


@pytest_asyncio.fixture
async def test_exchange_account(
    db_session: AsyncSession, test_user: User
) -> ExchangeAccount:
    """Создать тестовый аккаунт биржи."""
    account = ExchangeAccount(
        id=uuid.uuid4(),
        user_id=test_user.id,
        exchange=ExchangeType.BYBIT,
        label="Test Bybit",
        api_key_encrypted="encrypted_key",
        api_secret_encrypted="encrypted_secret",
        is_testnet=True,
        is_active=True,
    )
    db_session.add(account)
    await db_session.commit()
    await db_session.refresh(account)
    return account


@pytest_asyncio.fixture
async def bot_payload(
    test_strategy_config: StrategyConfig,
    test_exchange_account: ExchangeAccount,
) -> dict:
    """Payload для создания бота."""
    return {
        "strategy_config_id": str(test_strategy_config.id),
        "exchange_account_id": str(test_exchange_account.id),
        "mode": "demo",
    }


# === Bot CRUD ===


@pytest.mark.asyncio
async def test_create_bot(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Создание бота."""
    resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "stopped"
    assert data["mode"] == "demo"
    assert data["total_trades"] == 0
    assert data["strategy_config_id"] == bot_payload["strategy_config_id"]
    assert data["exchange_account_id"] == bot_payload["exchange_account_id"]


@pytest.mark.asyncio
async def test_list_bots_empty(
    client: AsyncClient, auth_headers: dict
) -> None:
    """Список ботов — пустой."""
    resp = await client.get("/api/trading/bots", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_bots(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Список ботов — один бот."""
    await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    resp = await client.get("/api/trading/bots", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["mode"] == "demo"


@pytest.mark.asyncio
async def test_get_bot(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Получить бота по ID."""
    create_resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    bot_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/trading/bots/{bot_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == bot_id


@pytest.mark.asyncio
async def test_get_bot_not_found(
    client: AsyncClient, auth_headers: dict
) -> None:
    """Бот не найден — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"/api/trading/bots/{fake_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_bot(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Запуск бота."""
    create_resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    bot_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/trading/bots/{bot_id}/start",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"
    assert data["started_at"] is not None


@pytest.mark.asyncio
async def test_stop_bot(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Остановка бота."""
    create_resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    bot_id = create_resp.json()["id"]

    # Сначала запустить
    await client.post(
        f"/api/trading/bots/{bot_id}/start",
        headers=auth_headers,
    )
    # Затем остановить
    resp = await client.post(
        f"/api/trading/bots/{bot_id}/stop",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "stopped"
    assert data["stopped_at"] is not None


@pytest.mark.asyncio
async def test_create_bot_unauthorized(
    client: AsyncClient,
    bot_payload: dict,
) -> None:
    """Создание бота без авторизации — 401."""
    resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
    )
    assert resp.status_code == 401


# === Orders / Positions / Signals — пустые списки ===


@pytest.mark.asyncio
async def test_get_bot_orders_empty(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Ордера бота — пустой список."""
    create_resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    bot_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/trading/bots/{bot_id}/orders",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_bot_positions_empty(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Позиции бота — пустой список."""
    create_resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    bot_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/trading/bots/{bot_id}/positions",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_bot_signals_empty(
    client: AsyncClient,
    auth_headers: dict,
    bot_payload: dict,
) -> None:
    """Сигналы бота — пустой список."""
    create_resp = await client.post(
        "/api/trading/bots",
        json=bot_payload,
        headers=auth_headers,
    )
    bot_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/trading/bots/{bot_id}/signals",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []
