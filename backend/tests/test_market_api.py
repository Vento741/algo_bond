"""Тесты API модуля market с мокированием BybitClient."""

import uuid
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_value
from app.modules.auth.models import ExchangeAccount, ExchangeType, User
from app.modules.market.bybit_client import SymbolInfo, Ticker


@pytest.fixture(autouse=True)
def mock_bybit_client():
    """Мокаем BybitClient для всех тестов market API."""
    with patch("app.modules.market.service.BybitClient") as MockClient:
        mock = MagicMock()
        MockClient.return_value = mock
        mock.get_klines.return_value = [
            {"timestamp": 1700001000000, "open": 100.0, "high": 101.0,
             "low": 99.0, "close": 100.5, "volume": 500.0, "turnover": 50000.0},
        ]
        mock.get_ticker.return_value = Ticker(
            symbol="BTCUSDT", last_price=65000.0, mark_price=65001.0,
            index_price=65000.5, volume_24h=12345.0, turnover_24h=800000000.0,
            high_24h=66000.0, low_24h=64000.0, funding_rate=0.0001,
            open_interest=5000.0, bid1_price=65000.0, ask1_price=65001.0,
        )
        mock.get_symbol_info.return_value = SymbolInfo(
            symbol="BTCUSDT", tick_size=0.1, qty_step=0.001,
            min_qty=0.001, max_qty=100.0, min_notional=5.0, max_leverage=100.0,
        )
        mock.get_wallet_balance.return_value = {
            "coin": "USDT", "wallet_balance": 1000.0,
            "available": 800.0, "equity": 1050.0, "unrealized_pnl": 50.0,
        }
        yield mock


@pytest.fixture(autouse=True)
def mock_redis():
    """Мокаем Redis для тестов."""
    with patch("app.modules.market.service.redis_pool") as mock:
        mock.get.return_value = None
        mock.set.return_value = True
        yield mock


@pytest_asyncio.fixture
async def test_exchange_account(
    db_session: AsyncSession, test_user: User,
) -> ExchangeAccount:
    """Создать тестовый аккаунт биржи для market-тестов."""
    account = ExchangeAccount(
        id=uuid.uuid4(),
        user_id=test_user.id,
        exchange=ExchangeType.BYBIT,
        label="Test Bybit Market",
        api_key_encrypted=encrypt_value("test_api_key"),
        api_secret_encrypted=encrypt_value("test_api_secret"),
        is_testnet=True,
        is_active=True,
    )
    db_session.add(account)
    await db_session.commit()
    await db_session.refresh(account)
    return account


@pytest.mark.asyncio
async def test_get_klines(client: AsyncClient) -> None:
    resp = await client.get("/api/market/klines/BTCUSDT?interval=5&limit=1")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["close"] == 100.5


@pytest.mark.asyncio
async def test_get_ticker(client: AsyncClient) -> None:
    resp = await client.get("/api/market/ticker/BTCUSDT")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "BTCUSDT"
    assert data["last_price"] == 65000.0


@pytest.mark.asyncio
async def test_get_symbol_info(client: AsyncClient) -> None:
    resp = await client.get("/api/market/symbol/BTCUSDT")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tick_size"] == 0.1
    assert data["max_leverage"] == 100.0


@pytest.mark.asyncio
async def test_get_balance_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/market/balance?exchange_account_id=" + str(uuid.uuid4()))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_balance_authenticated(
    client: AsyncClient,
    auth_headers: dict,
    test_exchange_account: ExchangeAccount,
    mock_bybit_client: MagicMock,
) -> None:
    with patch("app.modules.market.router.BybitClient") as MockRouterClient:
        MockRouterClient.return_value = mock_bybit_client
        resp = await client.get(
            f"/api/market/balance?exchange_account_id={test_exchange_account.id}",
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["wallet_balance"] == 1000.0
    assert data["available"] == 800.0
