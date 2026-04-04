"""Тесты админ-панели."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.auth.models import (
    AccessRequest,
    AccessRequestStatus,
    ExchangeAccount,
    ExchangeType,
    InviteCode,
    User,
    UserRole,
)
from app.modules.billing.models import Plan, Subscription
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.trading.models import (
    Bot,
    BotLog,
    BotLogLevel,
    BotMode,
    BotStatus,
)

pytestmark = pytest.mark.asyncio


# === Fixtures ===


@pytest_asyncio.fixture
async def sample_data(db_session: AsyncSession, admin_user: User, test_user: User) -> None:
    """Создать тестовые данные для admin stats."""
    plan = Plan(
        name="Free", slug="free", price_monthly=0,
        max_bots=1, max_strategies=1, max_backtests_per_day=5, features={},
    )
    db_session.add(plan)
    await db_session.flush()

    sub = Subscription(user_id=test_user.id, plan_id=plan.id)
    db_session.add(sub)
    await db_session.commit()


@pytest_asyncio.fixture
async def pending_request(db_session: AsyncSession) -> AccessRequest:
    """Создать заявку в статусе pending."""
    req = AccessRequest(telegram="@testuser123", status=AccessRequestStatus.PENDING)
    db_session.add(req)
    await db_session.commit()
    await db_session.refresh(req)
    return req


@pytest_asyncio.fixture
async def bot_with_logs(
    db_session: AsyncSession, test_user: User,
) -> Bot:
    """Создать бота с логами для тестов."""
    # Стратегия
    strategy = Strategy(
        name="Test Strategy",
        slug="test-strategy",
        engine_type="lorentzian_knn",
        is_public=True,
        version="1.0.0",
        default_config={},
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

    # Exchange account
    from app.core.security import encrypt_value
    ea = ExchangeAccount(
        user_id=test_user.id,
        exchange=ExchangeType.BYBIT,
        label="test",
        api_key_encrypted=encrypt_value("test_key"),
        api_secret_encrypted=encrypt_value("test_secret"),
        is_testnet=True,
    )
    db_session.add(ea)
    await db_session.flush()

    # Бот
    bot = Bot(
        user_id=test_user.id,
        strategy_config_id=config.id,
        exchange_account_id=ea.id,
        status=BotStatus.RUNNING,
        mode=BotMode.DEMO,
    )
    db_session.add(bot)
    await db_session.flush()

    # Логи
    for i in range(5):
        log = BotLog(
            bot_id=bot.id,
            level=BotLogLevel.INFO if i < 3 else BotLogLevel.ERROR,
            message=f"Test log message {i}",
            details={"iteration": i},
        )
        db_session.add(log)

    await db_session.commit()
    await db_session.refresh(bot)
    return bot


# === Test Classes ===


class TestAdminDependency:
    """Тесты get_admin_user зависимости."""

    async def test_admin_stats_requires_auth(self, client: AsyncClient) -> None:
        """Неавторизованный запрос -> 401."""
        response = await client.get("/api/admin/stats")
        assert response.status_code == 401

    async def test_admin_stats_requires_admin_role(
        self, client: AsyncClient, auth_headers: dict,
    ) -> None:
        """Обычный пользователь -> 403."""
        response = await client.get("/api/admin/stats", headers=auth_headers)
        assert response.status_code == 403

    async def test_admin_stats_accessible_by_admin(
        self, client: AsyncClient, admin_headers: dict,
    ) -> None:
        """Админ получает доступ -> 200."""
        response = await client.get("/api/admin/stats", headers=admin_headers)
        assert response.status_code == 200


class TestAdminStats:
    """Тесты GET /api/admin/stats."""

    async def test_stats_empty_db(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Stats с пустой БД (только admin user)."""
        response = await client.get("/api/admin/stats", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["users_count"] >= 1  # минимум admin user
        assert data["active_bots"] == 0
        assert data["pending_requests"] == 0
        assert data["total_trades"] == 0
        assert float(data["total_pnl"]) == 0.0
        assert data["active_invites"] == 0

    async def test_stats_forbidden_for_user(
        self, client: AsyncClient, auth_headers: dict,
    ) -> None:
        """Обычный пользователь -> 403."""
        response = await client.get("/api/admin/stats", headers=auth_headers)
        assert response.status_code == 403


class TestAdminUsers:
    """Тесты CRUD пользователей."""

    async def test_list_users(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, test_user: User,
    ) -> None:
        """Список пользователей с пагинацией."""
        response = await client.get("/api/admin/users", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 2  # admin + test_user
        assert len(data["items"]) >= 2

    async def test_list_users_pagination(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, test_user: User,
    ) -> None:
        """Пагинация: limit=1, offset=0."""
        response = await client.get(
            "/api/admin/users?limit=1&offset=0", headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["total"] >= 2
        assert data["limit"] == 1
        assert data["offset"] == 0

    async def test_list_users_search(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, test_user: User,
    ) -> None:
        """Поиск по email."""
        response = await client.get(
            "/api/admin/users?search=test@", headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert any(u["email"] == "test@example.com" for u in data["items"])

    async def test_get_user_detail(
        self, client: AsyncClient, admin_headers: dict, test_user: User,
    ) -> None:
        """Детали пользователя."""
        response = await client.get(
            f"/api/admin/users/{test_user.id}", headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert "bots_count" in data
        assert "exchange_accounts_count" in data

    async def test_get_user_not_found(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Несуществующий пользователь -> 404."""
        fake_id = uuid.uuid4()
        response = await client.get(
            f"/api/admin/users/{fake_id}", headers=admin_headers,
        )
        assert response.status_code == 404

    async def test_update_user_role(
        self, client: AsyncClient, admin_headers: dict, test_user: User,
    ) -> None:
        """Изменить роль пользователя."""
        response = await client.patch(
            f"/api/admin/users/{test_user.id}",
            headers=admin_headers,
            json={"role": "admin"},
        )
        assert response.status_code == 200
        assert response.json()["role"] == "admin"

    async def test_ban_user(
        self, client: AsyncClient, admin_headers: dict, test_user: User,
    ) -> None:
        """Забанить пользователя (is_active=False)."""
        response = await client.patch(
            f"/api/admin/users/{test_user.id}",
            headers=admin_headers,
            json={"is_active": False},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    async def test_delete_user(
        self, client: AsyncClient, admin_headers: dict,
        db_session: AsyncSession, admin_user: User,
    ) -> None:
        """Удалить пользователя."""
        victim = User(
            id=uuid.uuid4(),
            email="victim@example.com",
            username="victim",
            hashed_password=hash_password("VictimPass123"),
            is_active=True,
            role=UserRole.USER,
        )
        db_session.add(victim)
        await db_session.commit()

        response = await client.delete(
            f"/api/admin/users/{victim.id}", headers=admin_headers,
        )
        assert response.status_code == 204

    async def test_delete_self_forbidden(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Админ не может удалить сам себя."""
        response = await client.delete(
            f"/api/admin/users/{admin_user.id}", headers=admin_headers,
        )
        assert response.status_code == 400

    async def test_users_forbidden_for_regular_user(
        self, client: AsyncClient, auth_headers: dict,
    ) -> None:
        """Обычный пользователь -> 403."""
        response = await client.get("/api/admin/users", headers=auth_headers)
        assert response.status_code == 403


class TestAdminRequests:
    """Тесты управления заявками на доступ."""

    async def test_list_requests(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, pending_request: AccessRequest,
    ) -> None:
        """Список заявок с пагинацией."""
        response = await client.get("/api/admin/requests", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    async def test_list_requests_filter_pending(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, pending_request: AccessRequest,
    ) -> None:
        """Фильтр по status=pending."""
        response = await client.get(
            "/api/admin/requests?status=pending", headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert all(item["status"] == "pending" for item in data["items"])

    async def test_approve_request(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, pending_request: AccessRequest,
    ) -> None:
        """Одобрить заявку -> генерируется инвайт-код."""
        response = await client.post(
            f"/api/admin/requests/{pending_request.id}/approve",
            headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "invite_code" in data
        assert len(data["invite_code"]) == 8

    async def test_reject_request(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, pending_request: AccessRequest,
    ) -> None:
        """Отклонить заявку с причиной."""
        response = await client.post(
            f"/api/admin/requests/{pending_request.id}/reject",
            headers=admin_headers,
            json={"reason": "Недостаточно информации"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "rejected"

    async def test_approve_already_approved(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, pending_request: AccessRequest,
    ) -> None:
        """Повторное одобрение -> 400."""
        await client.post(
            f"/api/admin/requests/{pending_request.id}/approve",
            headers=admin_headers,
        )
        response = await client.post(
            f"/api/admin/requests/{pending_request.id}/approve",
            headers=admin_headers,
        )
        assert response.status_code == 400

    async def test_requests_forbidden_for_user(
        self, client: AsyncClient, auth_headers: dict,
    ) -> None:
        """Обычный пользователь -> 403."""
        response = await client.get("/api/admin/requests", headers=auth_headers)
        assert response.status_code == 403


class TestAdminInvites:
    """Тесты управления инвайт-кодами."""

    async def test_list_invites_empty(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Пустой список инвайтов."""
        response = await client.get("/api/admin/invites", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_generate_invites(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Генерация 3 инвайт-кодов."""
        response = await client.post(
            "/api/admin/invites/generate",
            headers=admin_headers,
            json={"count": 3, "expires_in_days": 30},
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data) == 3
        assert all(len(code["code"]) == 8 for code in data)

    async def test_generate_invites_no_expiry(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Генерация кодов без срока действия."""
        response = await client.post(
            "/api/admin/invites/generate",
            headers=admin_headers,
            json={"count": 1},
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data) == 1
        assert data[0]["expires_at"] is None

    async def test_deactivate_invite(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Деактивировать инвайт-код."""
        # Сначала генерируем
        gen_resp = await client.post(
            "/api/admin/invites/generate",
            headers=admin_headers,
            json={"count": 1},
        )
        invite_id = gen_resp.json()[0]["id"]

        # Деактивируем
        response = await client.patch(
            f"/api/admin/invites/{invite_id}",
            headers=admin_headers,
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    async def test_list_invites_after_generate(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Список после генерации."""
        await client.post(
            "/api/admin/invites/generate",
            headers=admin_headers,
            json={"count": 2},
        )
        response = await client.get("/api/admin/invites", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2

    async def test_invites_forbidden_for_user(
        self, client: AsyncClient, auth_headers: dict,
    ) -> None:
        """Обычный пользователь -> 403."""
        response = await client.get("/api/admin/invites", headers=auth_headers)
        assert response.status_code == 403


class TestAdminLogs:
    """Тесты GET /api/admin/logs."""

    async def test_list_logs(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, bot_with_logs: Bot,
    ) -> None:
        """Список логов с пагинацией."""
        response = await client.get("/api/admin/logs", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 5

    async def test_list_logs_filter_level(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, bot_with_logs: Bot,
    ) -> None:
        """Фильтр по уровню лога."""
        response = await client.get(
            "/api/admin/logs?level=error", headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert all(item["level"] == "error" for item in data["items"])

    async def test_list_logs_filter_bot_id(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, bot_with_logs: Bot,
    ) -> None:
        """Фильтр по bot_id."""
        response = await client.get(
            f"/api/admin/logs?bot_id={bot_with_logs.id}",
            headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5

    async def test_list_logs_pagination(
        self, client: AsyncClient, admin_headers: dict,
        admin_user: User, bot_with_logs: Bot,
    ) -> None:
        """Пагинация логов."""
        response = await client.get(
            "/api/admin/logs?limit=2&offset=0", headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5

    async def test_logs_forbidden_for_user(
        self, client: AsyncClient, auth_headers: dict,
    ) -> None:
        """Обычный пользователь -> 403."""
        response = await client.get("/api/admin/logs", headers=auth_headers)
        assert response.status_code == 403


class TestPlanManagement:
    """Тесты admin PATCH/DELETE для планов."""

    async def test_update_plan(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
        db_session: AsyncSession,
    ) -> None:
        """Admin обновляет план."""
        plan = Plan(
            name="Free", slug="free-upd", price_monthly=0,
            max_bots=1, max_strategies=1, max_backtests_per_day=5, features={},
        )
        db_session.add(plan)
        await db_session.commit()
        await db_session.refresh(plan)

        response = await client.patch(
            f"/api/billing/plans/{plan.id}",
            headers=admin_headers,
            json={"name": "Free Updated", "max_bots": 3},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Free Updated"
        assert data["max_bots"] == 3

    async def test_update_plan_user_forbidden(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, test_user: User,
    ) -> None:
        """Обычный пользователь не может обновить план."""
        plan = Plan(
            name="Free", slug="free-forb", price_monthly=0,
            max_bots=1, max_strategies=1, max_backtests_per_day=5, features={},
        )
        db_session.add(plan)
        await db_session.commit()
        await db_session.refresh(plan)

        response = await client.patch(
            f"/api/billing/plans/{plan.id}",
            headers=auth_headers,
            json={"name": "Hacked"},
        )
        assert response.status_code == 403

    async def test_delete_plan(
        self, client: AsyncClient, admin_headers: dict,
        db_session: AsyncSession, admin_user: User,
    ) -> None:
        """Admin удаляет план без активных подписок."""
        plan = Plan(
            name="Pro", slug="pro-del", price_monthly=49.99,
            max_bots=10, max_strategies=10, max_backtests_per_day=100,
            features={"priority_support": True},
        )
        db_session.add(plan)
        await db_session.commit()
        await db_session.refresh(plan)

        response = await client.delete(
            f"/api/billing/plans/{plan.id}",
            headers=admin_headers,
        )
        assert response.status_code == 204

    async def test_delete_plan_not_found(
        self, client: AsyncClient, admin_headers: dict, admin_user: User,
    ) -> None:
        """Удаление несуществующего плана -> 404."""
        fake_id = uuid.uuid4()
        response = await client.delete(
            f"/api/billing/plans/{fake_id}",
            headers=admin_headers,
        )
        assert response.status_code == 404
