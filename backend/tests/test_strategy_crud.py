"""Тесты CRUD модуля strategy."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.strategy.models import Strategy


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


# === Strategy endpoints ===

@pytest.mark.asyncio
async def test_list_strategies_empty(client: AsyncClient) -> None:
    """Список стратегий — пустой."""
    resp = await client.get("/api/strategies")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_strategies(client: AsyncClient, test_strategy: Strategy) -> None:
    """Список стратегий — одна стратегия."""
    resp = await client.get("/api/strategies")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == "lorentzian-knn"
    assert data[0]["engine_type"] == "lorentzian_knn"


@pytest.mark.asyncio
async def test_get_strategy_by_slug(
    client: AsyncClient, test_strategy: Strategy
) -> None:
    """Получить стратегию по slug."""
    resp = await client.get("/api/strategies/lorentzian-knn")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Lorentzian KNN"
    assert data["default_config"]["knn"]["neighbors"] == 8


@pytest.mark.asyncio
async def test_get_strategy_not_found(client: AsyncClient) -> None:
    """Стратегия не найдена — 404."""
    resp = await client.get("/api/strategies/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_strategy_admin(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Создание стратегии администратором."""
    resp = await client.post(
        "/api/strategies",
        json={
            "name": "Test Strategy",
            "slug": "test-strategy",
            "engine_type": "custom",
            "description": "Test",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == "test-strategy"


@pytest.mark.asyncio
async def test_create_strategy_forbidden(
    client: AsyncClient, auth_headers: dict
) -> None:
    """Обычный пользователь не может создать стратегию."""
    resp = await client.post(
        "/api/strategies",
        json={
            "name": "Test",
            "slug": "test",
            "engine_type": "custom",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_strategy_duplicate_slug(
    client: AsyncClient, admin_headers: dict, test_strategy: Strategy
) -> None:
    """Дубликат slug — 409."""
    resp = await client.post(
        "/api/strategies",
        json={
            "name": "Another",
            "slug": "lorentzian-knn",
            "engine_type": "custom",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 409


# === StrategyConfig endpoints ===

@pytest.mark.asyncio
async def test_create_config(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Создание конфига стратегии."""
    resp = await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "My RIVER config",
            "symbol": "RIVERUSDT",
            "timeframe": "5",
            "config": {"knn": {"neighbors": 10}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My RIVER config"
    assert data["config"]["knn"]["neighbors"] == 10


@pytest.mark.asyncio
async def test_list_my_configs(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Список моих конфигов."""
    await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "Config 1",
        },
        headers=auth_headers,
    )
    resp = await client.get("/api/strategies/configs/my", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_update_config(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Обновление конфига."""
    create_resp = await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "Old Name",
        },
        headers=auth_headers,
    )
    config_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/strategies/configs/{config_id}",
        json={"name": "New Name", "symbol": "BTCUSDT"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["symbol"] == "BTCUSDT"


@pytest.mark.asyncio
async def test_delete_config(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Удаление конфига."""
    create_resp = await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "To Delete",
        },
        headers=auth_headers,
    )
    config_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/strategies/configs/{config_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    resp = await client.get(
        f"/api/strategies/configs/{config_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404
