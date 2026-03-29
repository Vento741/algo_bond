"""Тесты модуля billing."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.billing.models import Plan

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def free_plan(db_session: AsyncSession) -> Plan:
    """Создать бесплатный план."""
    plan = Plan(
        name="Free",
        slug="free",
        price_monthly=0,
        max_bots=1,
        max_strategies=1,
        max_backtests_per_day=5,
        features={},
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest_asyncio.fixture
async def pro_plan(db_session: AsyncSession) -> Plan:
    """Создать Pro-план."""
    plan = Plan(
        name="Pro",
        slug="pro",
        price_monthly=49.99,
        max_bots=10,
        max_strategies=10,
        max_backtests_per_day=100,
        features={"priority_support": True},
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


class TestPlans:
    """Тесты тарифных планов."""

    async def test_list_plans_empty(self, client: AsyncClient):
        """Пустой список планов (публичный эндпоинт)."""
        response = await client.get("/api/billing/plans")
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_plans(self, client: AsyncClient, free_plan: Plan, pro_plan: Plan):
        """Список планов с данными."""
        response = await client.get("/api/billing/plans")
        assert response.status_code == 200
        plans = response.json()
        assert len(plans) == 2

    async def test_create_plan_admin(self, client: AsyncClient, admin_headers: dict):
        """Admin может создать план."""
        response = await client.post("/api/billing/plans", headers=admin_headers, json={
            "name": "Basic",
            "slug": "basic",
            "price_monthly": 19.99,
            "max_bots": 3,
            "max_strategies": 5,
            "max_backtests_per_day": 20,
            "features": {},
        })
        assert response.status_code == 201
        assert response.json()["slug"] == "basic"

    async def test_create_plan_user_forbidden(self, client: AsyncClient, auth_headers: dict):
        """Обычный пользователь не может создать план."""
        response = await client.post("/api/billing/plans", headers=auth_headers, json={
            "name": "Hack",
            "slug": "hack",
            "price_monthly": 0,
        })
        assert response.status_code == 403

    async def test_create_plan_duplicate_slug(self, client: AsyncClient, admin_headers: dict, free_plan: Plan):
        """Дублирование slug -> 409."""
        response = await client.post("/api/billing/plans", headers=admin_headers, json={
            "name": "Another Free",
            "slug": "free",
            "price_monthly": 0,
        })
        assert response.status_code == 409


class TestSubscriptions:
    """Тесты подписок."""

    async def test_subscribe(self, client: AsyncClient, auth_headers: dict, free_plan: Plan):
        """Подписаться на бесплатный план."""
        response = await client.post("/api/billing/subscribe/free", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"
        assert data["plan"]["slug"] == "free"

    async def test_get_subscription(self, client: AsyncClient, auth_headers: dict, free_plan: Plan):
        """Получить текущую подписку."""
        await client.post("/api/billing/subscribe/free", headers=auth_headers)
        response = await client.get("/api/billing/subscription", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["plan"]["slug"] == "free"

    async def test_change_plan(self, client: AsyncClient, auth_headers: dict, free_plan: Plan, pro_plan: Plan):
        """Сменить план подписки."""
        await client.post("/api/billing/subscribe/free", headers=auth_headers)
        response = await client.post("/api/billing/subscribe/pro", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["plan"]["slug"] == "pro"

    async def test_subscribe_unknown_plan(self, client: AsyncClient, auth_headers: dict):
        """Подписка на несуществующий план -> 404."""
        response = await client.post("/api/billing/subscribe/nonexistent", headers=auth_headers)
        assert response.status_code == 404

    async def test_get_subscription_none(self, client: AsyncClient, auth_headers: dict):
        """Получить подписку когда её нет -> 404."""
        response = await client.get("/api/billing/subscription", headers=auth_headers)
        assert response.status_code == 404
