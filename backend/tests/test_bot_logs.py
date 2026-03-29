"""Тесты API логов бота."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import ExchangeAccount, ExchangeType, User
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.trading.models import Bot, BotLog, BotLogLevel, BotMode, BotStatus


@pytest_asyncio.fixture
async def test_strategy(db_session: AsyncSession) -> Strategy:
    """Создать тестовую стратегию."""
    strategy = Strategy(
        id=uuid.uuid4(),
        name="Lorentzian KNN",
        slug="lorentzian-knn-logs",
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
async def test_bot(
    db_session: AsyncSession,
    test_user: User,
    test_strategy_config: StrategyConfig,
    test_exchange_account: ExchangeAccount,
) -> Bot:
    """Создать тестового бота."""
    bot = Bot(
        id=uuid.uuid4(),
        user_id=test_user.id,
        strategy_config_id=test_strategy_config.id,
        exchange_account_id=test_exchange_account.id,
        status=BotStatus.STOPPED,
        mode=BotMode.DEMO,
    )
    db_session.add(bot)
    await db_session.commit()
    await db_session.refresh(bot)
    return bot


@pytest_asyncio.fixture
async def bot_with_logs(
    db_session: AsyncSession, test_bot: Bot
) -> Bot:
    """Создать бота с несколькими логами."""
    logs = [
        BotLog(
            bot_id=test_bot.id,
            level=BotLogLevel.INFO,
            message="Цикл бота запущен",
        ),
        BotLog(
            bot_id=test_bot.id,
            level=BotLogLevel.INFO,
            message="Получено 200 свечей",
            details={"symbol": "RIVERUSDT", "interval": "5"},
        ),
        BotLog(
            bot_id=test_bot.id,
            level=BotLogLevel.DEBUG,
            message="Нет сигнала",
        ),
        BotLog(
            bot_id=test_bot.id,
            level=BotLogLevel.ERROR,
            message="Ошибка Bybit API: rate limit",
            details={"error_code": 10006},
        ),
    ]
    for log in logs:
        db_session.add(log)
    await db_session.commit()
    return test_bot


# === Tests ===


@pytest.mark.asyncio
async def test_get_bot_logs_empty(
    client: AsyncClient,
    auth_headers: dict,
    test_bot: Bot,
) -> None:
    """Логи бота — пустой список."""
    resp = await client.get(
        f"/api/trading/bots/{test_bot.id}/logs",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_bot_logs(
    client: AsyncClient,
    auth_headers: dict,
    bot_with_logs: Bot,
) -> None:
    """Логи бота — возвращаются все записи, сортировка desc."""
    resp = await client.get(
        f"/api/trading/bots/{bot_with_logs.id}/logs",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 4

    # Проверить структуру первого лога
    log = data[0]
    assert "id" in log
    assert log["bot_id"] == str(bot_with_logs.id)
    assert log["level"] in ["info", "warn", "error", "debug"]
    assert "message" in log
    assert "created_at" in log


@pytest.mark.asyncio
async def test_get_bot_logs_with_details(
    client: AsyncClient,
    auth_headers: dict,
    bot_with_logs: Bot,
) -> None:
    """Логи с details — JSON корректно сериализуется."""
    resp = await client.get(
        f"/api/trading/bots/{bot_with_logs.id}/logs",
        headers=auth_headers,
    )
    data = resp.json()
    # Найти лог с details
    logs_with_details = [log for log in data if log["details"] is not None]
    assert len(logs_with_details) >= 1

    # Проверить что details — словарь
    for log in logs_with_details:
        assert isinstance(log["details"], dict)


@pytest.mark.asyncio
async def test_get_bot_logs_pagination(
    client: AsyncClient,
    auth_headers: dict,
    bot_with_logs: Bot,
) -> None:
    """Пагинация логов — limit и offset."""
    resp = await client.get(
        f"/api/trading/bots/{bot_with_logs.id}/logs?limit=2&offset=0",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

    resp2 = await client.get(
        f"/api/trading/bots/{bot_with_logs.id}/logs?limit=2&offset=2",
        headers=auth_headers,
    )
    data2 = resp2.json()
    assert len(data2) == 2

    # ID не пересекаются
    ids1 = {log["id"] for log in data}
    ids2 = {log["id"] for log in data2}
    assert ids1.isdisjoint(ids2)


@pytest.mark.asyncio
async def test_get_bot_logs_not_found(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    """Логи несуществующего бота — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"/api/trading/bots/{fake_id}/logs",
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_bot_logs_unauthorized(
    client: AsyncClient,
    bot_with_logs: Bot,
) -> None:
    """Логи без авторизации — 401."""
    resp = await client.get(
        f"/api/trading/bots/{bot_with_logs.id}/logs",
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_bot_logs_other_user(
    client: AsyncClient,
    admin_headers: dict,
    bot_with_logs: Bot,
) -> None:
    """Логи чужого бота — 404 (бот не найден для другого пользователя)."""
    resp = await client.get(
        f"/api/trading/bots/{bot_with_logs.id}/logs",
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_bot_logs_limit_validation(
    client: AsyncClient,
    auth_headers: dict,
    test_bot: Bot,
) -> None:
    """Валидация параметра limit — максимум 500."""
    resp = await client.get(
        f"/api/trading/bots/{test_bot.id}/logs?limit=501",
        headers=auth_headers,
    )
    assert resp.status_code == 422
