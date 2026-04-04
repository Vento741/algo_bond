# Admin Panel - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Create admin panel with 6 sections: dashboard stats, user management, access requests, invite codes, billing plans, system logs

**Architecture:** Backend: new admin module (router, service, schemas) with centralized `get_admin_user` dependency. Frontend: 6 admin pages under `/admin/*`, `AdminRoute` guard, extended Sidebar with conditional admin section.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, React 18, TypeScript, Tailwind CSS, Lucide React, pytest

**Dependency:** SPEC 4 (invite_codes, access_requests tables) must be implemented first. This plan assumes `InviteCode` and `AccessRequest` models already exist in `backend/app/modules/auth/models.py`.

---

### Task 1: Create `get_admin_user` dependency in auth module

**Files:**
- Modify: `backend/app/modules/auth/dependencies.py`
- Test: `backend/tests/test_admin.py` (new file)

- [ ] **Step 1: Write failing test for admin dependency**

Create test file `backend/tests/test_admin.py`:

```python
"""Тесты админ-панели."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User

pytestmark = pytest.mark.asyncio


class TestAdminDependency:
    """Тесты get_admin_user зависимости."""

    async def test_admin_stats_requires_auth(self, client: AsyncClient) -> None:
        """Неавторизованный запрос -> 401."""
        response = await client.get("/api/admin/stats")
        assert response.status_code == 401

    async def test_admin_stats_requires_admin_role(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        """Обычный пользователь -> 403."""
        response = await client.get("/api/admin/stats", headers=auth_headers)
        assert response.status_code == 403

    async def test_admin_stats_accessible_by_admin(
        self, client: AsyncClient, admin_headers: dict
    ) -> None:
        """Админ получает доступ -> 200."""
        response = await client.get("/api/admin/stats", headers=admin_headers)
        assert response.status_code == 200
```

- [ ] **Step 2: Implement `get_admin_user` dependency**

Add to `backend/app/modules/auth/dependencies.py` after the existing `get_current_active_user` function:

```python
from fastapi import HTTPException


async def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency: пользователь с ролью admin."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Требуются права администратора",
        )
    return current_user
```

Also add the missing import at the top of the file:

```python
from app.modules.auth.models import User, UserRole
```

Note: `User` is already imported but `UserRole` needs to be added.

- [ ] **Step 3: Run tests, verify passing**

```bash
cd backend && pytest tests/test_admin.py -v
```

- [ ] **Step 4: Commit**

```
feat: add get_admin_user dependency for admin-only endpoints
```

---

### Task 2: Refactor existing inline admin checks

**Files:**
- Modify: `backend/app/modules/billing/router.py`
- Modify: `backend/app/modules/strategy/router.py`

Replace inline `if user.role != UserRole.ADMIN` checks with the new `get_admin_user` dependency.

- [ ] **Step 1: Refactor `billing/router.py`**

In `backend/app/modules/billing/router.py`, update the `create_plan` endpoint:

Replace:
```python
from app.core.exceptions import ForbiddenException
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User, UserRole
```

With:
```python
from app.modules.auth.dependencies import get_admin_user, get_current_user
from app.modules.auth.models import User
```

Replace the `create_plan` function:
```python
@router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_plan(
    data: PlanCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> PlanResponse:
    """Создать тарифный план (только admin)."""
    service = BillingService(db)
    return await service.create_plan(data)
```

- [ ] **Step 2: Refactor `strategy/router.py`**

In `backend/app/modules/strategy/router.py`, update imports:

Replace:
```python
from app.core.exceptions import ForbiddenException
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User, UserRole
```

With:
```python
from app.modules.auth.dependencies import get_admin_user, get_current_user
from app.modules.auth.models import User
```

Replace the `create_strategy` function:
```python
@router.post("", response_model=StrategyResponse, status_code=201)
async def create_strategy(
    data: StrategyCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyResponse:
    """Создать стратегию (только admin)."""
    service = StrategyService(db)
    return await service.create_strategy(data, author_id=admin.id)
```

- [ ] **Step 3: Run existing tests to verify refactor**

```bash
cd backend && pytest tests/test_billing.py tests/test_strategy_crud.py -v
```

- [ ] **Step 4: Commit**

```
refactor: replace inline admin checks with get_admin_user dependency
```

---

### Task 3: Create admin module structure + PaginatedResponse schema

**Files:**
- Create: `backend/app/modules/admin/__init__.py`
- Create: `backend/app/modules/admin/schemas.py`
- Create: `backend/app/modules/admin/service.py`
- Create: `backend/app/modules/admin/router.py`

- [ ] **Step 1: Create module directory and `__init__.py`**

Create `backend/app/modules/admin/__init__.py`:
```python
"""Модуль администрирования платформы."""
```

- [ ] **Step 2: Create schemas with PaginatedResponse**

Create `backend/app/modules/admin/schemas.py`:

```python
"""Pydantic v2 схемы модуля admin."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Стандартный формат пагинации для всех admin endpoints."""

    items: list[T]
    total: int
    limit: int
    offset: int


# === Dashboard Stats ===


class AdminStats(BaseModel):
    """Статистика платформы для admin dashboard."""

    users_count: int
    active_bots: int
    pending_requests: int
    total_trades: int
    total_pnl: Decimal
    active_invites: int


# === Users ===


class AdminUserListItem(BaseModel):
    """Пользователь в списке admin panel."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    role: str
    is_active: bool
    created_at: datetime
    bots_count: int = 0
    subscription_plan: str | None = None


class AdminUserDetail(BaseModel):
    """Детальная информация о пользователе для admin."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    bots_count: int = 0
    exchange_accounts_count: int = 0
    subscription_plan: str | None = None
    subscription_status: str | None = None
    subscription_expires_at: datetime | None = None
    total_pnl: Decimal = Decimal("0")
    total_trades: int = 0


class AdminUserUpdate(BaseModel):
    """Обновление пользователя админом."""

    role: str | None = None
    is_active: bool | None = None


# === Access Requests ===


class AdminAccessRequestItem(BaseModel):
    """Заявка на доступ в списке admin."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram: str
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None
    reject_reason: str | None = None


class AdminRequestReject(BaseModel):
    """Тело запроса для отклонения заявки."""

    reason: str | None = Field(None, max_length=500)


# === Invite Codes ===


class AdminInviteCodeItem(BaseModel):
    """Инвайт-код в списке admin."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    is_active: bool
    created_at: datetime
    expires_at: datetime | None = None
    used_at: datetime | None = None
    created_by_email: str | None = None
    used_by_email: str | None = None


class AdminInviteGenerate(BaseModel):
    """Генерация инвайт-кодов."""

    count: int = Field(ge=1, le=20, default=1)
    expires_in_days: int | None = Field(None, ge=1, le=365)


# === Billing Plans ===


class AdminPlanUpdate(BaseModel):
    """Обновление тарифного плана админом."""

    name: str | None = Field(None, min_length=1, max_length=50)
    price_monthly: Decimal | None = Field(None, ge=0)
    max_bots: int | None = Field(None, ge=0)
    max_strategies: int | None = Field(None, ge=0)
    max_backtests_per_day: int | None = Field(None, ge=0)
    features: dict | None = None


# === System Logs ===


class AdminLogItem(BaseModel):
    """Лог бота в admin panel."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bot_id: uuid.UUID
    level: str
    message: str
    details: dict | None = None
    created_at: datetime
    user_email: str | None = None
```

- [ ] **Step 3: Create empty service stub**

Create `backend/app/modules/admin/service.py`:

```python
"""Бизнес-логика модуля admin."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictException, NotFoundException
from app.modules.admin.schemas import (
    AdminAccessRequestItem,
    AdminInviteCodeItem,
    AdminInviteGenerate,
    AdminLogItem,
    AdminPlanUpdate,
    AdminStats,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserUpdate,
)
from app.modules.auth.models import User, UserRole
from app.modules.billing.models import Plan, Subscription, SubscriptionStatus
from app.modules.trading.models import Bot, BotLog, BotLogLevel, BotStatus


class AdminService:
    """Сервис администрирования платформы."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
```

- [ ] **Step 4: Create empty router stub**

Create `backend/app/modules/admin/router.py`:

```python
"""API-эндпоинты модуля admin."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/admin", tags=["admin"])
```

- [ ] **Step 5: Commit**

```
feat: create admin module structure with schemas and stubs
```

---

### Task 4: Register admin router in main.py + update conftest.py

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Register admin router in main.py**

In `backend/app/main.py`, add import after existing router imports (line ~18):

```python
from app.modules.admin.router import router as admin_router
```

Add include after existing includes (after line ~79):

```python
app.include_router(admin_router)
```

The full imports block becomes:
```python
from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router
from app.modules.market.router import router as market_router
from app.modules.strategy.router import router as strategy_router
from app.modules.backtest.router import router as backtest_router
from app.modules.trading.router import router as trading_router
from app.modules.market.ws_router import router as ws_router
from app.modules.market.ws_info_router import router as ws_info_router
from app.modules.admin.router import router as admin_router
```

And the includes block:
```python
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(strategy_router)
app.include_router(market_router)
app.include_router(trading_router)
app.include_router(backtest_router)
app.include_router(ws_router)
app.include_router(ws_info_router)
app.include_router(admin_router)
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```

- [ ] **Step 3: Commit**

```
feat: register admin router in main.py
```

---

### Task 5: GET /api/admin/stats endpoint (TDD)

**Files:**
- Modify: `backend/app/modules/admin/service.py`
- Modify: `backend/app/modules/admin/router.py`
- Modify: `backend/tests/test_admin.py`

- [ ] **Step 1: Write failing tests for admin stats**

Add to `backend/tests/test_admin.py`:

```python
import pytest_asyncio

from app.modules.billing.models import Plan
from app.modules.trading.models import Bot, BotStatus


@pytest_asyncio.fixture
async def sample_data(db_session: AsyncSession, admin_user: User, test_user: User) -> None:
    """Создать тестовые данные для admin stats."""
    # Создать план и подписку
    plan = Plan(
        name="Free", slug="free", price_monthly=0,
        max_bots=1, max_strategies=1, max_backtests_per_day=5, features={},
    )
    db_session.add(plan)
    await db_session.flush()

    from app.modules.billing.models import Subscription
    sub = Subscription(user_id=test_user.id, plan_id=plan.id)
    db_session.add(sub)
    await db_session.commit()


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
```

- [ ] **Step 2: Implement stats service method**

Add to `AdminService` in `backend/app/modules/admin/service.py`:

```python
    async def get_stats(self) -> AdminStats:
        """Агрегированная статистика платформы."""
        # Количество пользователей
        users_result = await self.db.execute(select(func.count(User.id)))
        users_count: int = users_result.scalar_one()

        # Активные боты
        bots_result = await self.db.execute(
            select(func.count(Bot.id)).where(Bot.status == BotStatus.RUNNING)
        )
        active_bots: int = bots_result.scalar_one()

        # Заявки на рассмотрении (pending)
        # Импорт InviteCode/AccessRequest - из auth модуля (SPEC 4)
        try:
            from app.modules.auth.models import AccessRequest, AccessRequestStatus
            requests_result = await self.db.execute(
                select(func.count(AccessRequest.id)).where(
                    AccessRequest.status == AccessRequestStatus.PENDING
                )
            )
            pending_requests: int = requests_result.scalar_one()
        except (ImportError, Exception):
            pending_requests = 0

        # Всего сделок и суммарный PnL
        trades_result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_trades), 0),
                func.coalesce(func.sum(Bot.total_pnl), Decimal("0")),
            )
        )
        row = trades_result.one()
        total_trades: int = int(row[0])
        total_pnl: Decimal = Decimal(str(row[1]))

        # Активные инвайт-коды
        try:
            from app.modules.auth.models import InviteCode
            invites_result = await self.db.execute(
                select(func.count(InviteCode.id)).where(
                    InviteCode.is_active == True,  # noqa: E712
                    InviteCode.used_by == None,  # noqa: E711
                )
            )
            active_invites: int = invites_result.scalar_one()
        except (ImportError, Exception):
            active_invites = 0

        return AdminStats(
            users_count=users_count,
            active_bots=active_bots,
            pending_requests=pending_requests,
            total_trades=total_trades,
            total_pnl=total_pnl,
            active_invites=active_invites,
        )
```

- [ ] **Step 3: Implement stats router endpoint**

Update `backend/app/modules/admin/router.py`:

```python
"""API-эндпоинты модуля admin."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.admin.schemas import AdminStats
from app.modules.admin.service import AdminService
from app.modules.auth.dependencies import get_admin_user
from app.modules.auth.models import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
    """Статистика платформы (только admin)."""
    service = AdminService(db)
    return await service.get_stats()
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_admin.py -v
```

- [ ] **Step 5: Commit**

```
feat: implement GET /api/admin/stats endpoint with tests
```

---

### Task 6: Admin Users CRUD endpoints (TDD)

**Files:**
- Modify: `backend/app/modules/admin/service.py`
- Modify: `backend/app/modules/admin/router.py`
- Modify: `backend/tests/test_admin.py`

- [ ] **Step 1: Write failing tests for user management**

Add to `backend/tests/test_admin.py`:

```python
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
        import uuid
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
        from app.core.security import hash_password
        import uuid

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
```

- [ ] **Step 2: Implement user management service methods**

Add to `AdminService` in `backend/app/modules/admin/service.py`:

```python
    async def list_users(
        self,
        limit: int = 20,
        offset: int = 0,
        search: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[AdminUserListItem], int]:
        """Список пользователей с пагинацией и фильтрами."""
        query = select(User)

        # Фильтры
        if search:
            query = query.where(
                (User.email.ilike(f"%{search}%")) | (User.username.ilike(f"%{search}%"))
            )
        if role:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)

        # Total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated results
        query = query.order_by(User.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        users = list(result.scalars().all())

        items: list[AdminUserListItem] = []
        for user in users:
            # Считаем ботов
            bots_result = await self.db.execute(
                select(func.count(Bot.id)).where(Bot.user_id == user.id)
            )
            bots_count: int = bots_result.scalar_one()

            # Получаем подписку
            sub_result = await self.db.execute(
                select(Subscription)
                .options(selectinload(Subscription.plan))
                .where(Subscription.user_id == user.id)
            )
            sub = sub_result.scalar_one_or_none()

            items.append(AdminUserListItem(
                id=user.id,
                email=user.email,
                username=user.username,
                role=user.role.value if hasattr(user.role, 'value') else str(user.role),
                is_active=user.is_active,
                created_at=user.created_at,
                bots_count=bots_count,
                subscription_plan=sub.plan.name if sub and sub.plan else None,
            ))

        return items, total

    async def get_user_detail(self, user_id: uuid.UUID) -> AdminUserDetail:
        """Детальная информация о пользователе."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")

        # Ботов
        bots_result = await self.db.execute(
            select(func.count(Bot.id)).where(Bot.user_id == user.id)
        )
        bots_count: int = bots_result.scalar_one()

        # Exchange accounts
        from app.modules.auth.models import ExchangeAccount
        ea_result = await self.db.execute(
            select(func.count(ExchangeAccount.id)).where(ExchangeAccount.user_id == user.id)
        )
        ea_count: int = ea_result.scalar_one()

        # Подписка
        sub_result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.user_id == user.id)
        )
        sub = sub_result.scalar_one_or_none()

        # Агрегированная статистика ботов
        pnl_result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_pnl), Decimal("0")),
                func.coalesce(func.sum(Bot.total_trades), 0),
            ).where(Bot.user_id == user.id)
        )
        pnl_row = pnl_result.one()

        return AdminUserDetail(
            id=user.id,
            email=user.email,
            username=user.username,
            role=user.role.value if hasattr(user.role, 'value') else str(user.role),
            is_active=user.is_active,
            created_at=user.created_at,
            updated_at=user.updated_at,
            bots_count=bots_count,
            exchange_accounts_count=ea_count,
            subscription_plan=sub.plan.name if sub and sub.plan else None,
            subscription_status=sub.status.value if sub else None,
            subscription_expires_at=sub.expires_at if sub else None,
            total_pnl=Decimal(str(pnl_row[0])),
            total_trades=int(pnl_row[1]),
        )

    async def update_user(
        self, user_id: uuid.UUID, data: AdminUserUpdate,
    ) -> AdminUserDetail:
        """Обновить пользователя (роль, статус)."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")

        if data.role is not None:
            user.role = UserRole(data.role)
        if data.is_active is not None:
            user.is_active = data.is_active

        await self.db.flush()
        await self.db.commit()

        return await self.get_user_detail(user_id)

    async def delete_user(
        self, user_id: uuid.UUID, admin_id: uuid.UUID,
    ) -> None:
        """Удалить пользователя (каскадное удаление)."""
        if user_id == admin_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")

        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")

        await self.db.delete(user)
        await self.db.commit()
```

- [ ] **Step 3: Add user endpoints to router**

Add to `backend/app/modules/admin/router.py`:

```python
import uuid

from fastapi import Query

from app.modules.admin.schemas import (
    AdminStats,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserUpdate,
    PaginatedResponse,
)


@router.get("/users", response_model=PaginatedResponse[AdminUserListItem])
async def list_users(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
    role: str | None = Query(None),
    is_active: bool | None = Query(None),
) -> PaginatedResponse[AdminUserListItem]:
    """Список пользователей с пагинацией (только admin)."""
    service = AdminService(db)
    items, total = await service.list_users(
        limit=limit, offset=offset, search=search, role=role, is_active=is_active,
    )
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    """Детали пользователя (только admin)."""
    service = AdminService(db)
    return await service.get_user_detail(user_id)


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
async def update_user(
    user_id: uuid.UUID,
    data: AdminUserUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    """Обновить пользователя (только admin)."""
    service = AdminService(db)
    return await service.update_user(user_id, data)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить пользователя (только admin)."""
    service = AdminService(db)
    await service.delete_user(user_id, admin.id)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_admin.py::TestAdminUsers -v
```

- [ ] **Step 5: Commit**

```
feat: implement admin users CRUD endpoints with tests
```

---

### Task 7: Access requests list/approve/reject endpoints (TDD)

**Files:**
- Modify: `backend/app/modules/admin/service.py`
- Modify: `backend/app/modules/admin/router.py`
- Modify: `backend/tests/test_admin.py`

**Note:** This task depends on SPEC 4 (InviteCode, AccessRequest models). If SPEC 4 is not yet implemented, skip this task and return to it after SPEC 4 is complete.

- [ ] **Step 1: Write failing tests for access requests management**

Add to `backend/tests/test_admin.py`:

```python
from app.modules.auth.models import AccessRequest, AccessRequestStatus, InviteCode


@pytest_asyncio.fixture
async def pending_request(db_session: AsyncSession) -> AccessRequest:
    """Создать заявку в статусе pending."""
    req = AccessRequest(telegram="@testuser123", status=AccessRequestStatus.PENDING)
    db_session.add(req)
    await db_session.commit()
    await db_session.refresh(req)
    return req


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
```

- [ ] **Step 2: Implement access requests service methods**

Add to `AdminService` in `backend/app/modules/admin/service.py`:

```python
    async def list_requests(
        self,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
    ) -> tuple[list[AdminAccessRequestItem], int]:
        """Список заявок на доступ с фильтрацией."""
        from app.modules.auth.models import AccessRequest, AccessRequestStatus

        query = select(AccessRequest)

        if status:
            query = query.where(AccessRequest.status == AccessRequestStatus(status))

        # Total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated
        query = query.order_by(AccessRequest.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        requests = list(result.scalars().all())

        items: list[AdminAccessRequestItem] = [
            AdminAccessRequestItem(
                id=req.id,
                telegram=req.telegram,
                status=req.status.value if hasattr(req.status, 'value') else str(req.status),
                created_at=req.created_at,
                reviewed_at=req.reviewed_at,
                reject_reason=req.reject_reason,
            )
            for req in requests
        ]

        return items, total

    async def approve_request(
        self, request_id: uuid.UUID, admin_id: uuid.UUID,
    ) -> dict:
        """Одобрить заявку и сгенерировать инвайт-код."""
        from app.modules.auth.models import (
            AccessRequest,
            AccessRequestStatus,
            InviteCode,
        )

        result = await self.db.execute(
            select(AccessRequest).where(AccessRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if not req:
            raise NotFoundException("Заявка не найдена")

        if req.status != AccessRequestStatus.PENDING:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="Заявка уже обработана",
            )

        # Генерация инвайт-кода
        import secrets
        SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
        code = "".join(secrets.choice(SAFE_CHARS) for _ in range(8))

        invite = InviteCode(
            code=code,
            created_by=admin_id,
            is_active=True,
        )
        self.db.add(invite)
        await self.db.flush()

        # Обновить заявку
        req.status = AccessRequestStatus.APPROVED
        req.generated_invite_code_id = invite.id
        req.reviewed_by = admin_id
        req.reviewed_at = datetime.now(timezone.utc)

        await self.db.commit()

        return {"invite_code": code, "request_id": str(request_id)}

    async def reject_request(
        self, request_id: uuid.UUID, admin_id: uuid.UUID, reason: str | None = None,
    ) -> AdminAccessRequestItem:
        """Отклонить заявку."""
        from app.modules.auth.models import AccessRequest, AccessRequestStatus

        result = await self.db.execute(
            select(AccessRequest).where(AccessRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if not req:
            raise NotFoundException("Заявка не найдена")

        if req.status != AccessRequestStatus.PENDING:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="Заявка уже обработана",
            )

        req.status = AccessRequestStatus.REJECTED
        req.reject_reason = reason
        req.reviewed_by = admin_id
        req.reviewed_at = datetime.now(timezone.utc)

        await self.db.commit()

        return AdminAccessRequestItem(
            id=req.id,
            telegram=req.telegram,
            status=req.status.value,
            created_at=req.created_at,
            reviewed_at=req.reviewed_at,
            reject_reason=req.reject_reason,
        )
```

- [ ] **Step 3: Add access requests endpoints to router**

Add to `backend/app/modules/admin/router.py`:

```python
from app.modules.admin.schemas import (
    AdminAccessRequestItem,
    AdminRequestReject,
)


@router.get("/requests", response_model=PaginatedResponse[AdminAccessRequestItem])
async def list_requests(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
) -> PaginatedResponse[AdminAccessRequestItem]:
    """Список заявок на доступ (только admin)."""
    service = AdminService(db)
    items, total = await service.list_requests(limit=limit, offset=offset, status=status)
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/requests/{request_id}/approve")
async def approve_request(
    request_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Одобрить заявку и сгенерировать инвайт-код (только admin)."""
    service = AdminService(db)
    return await service.approve_request(request_id, admin.id)


@router.post("/requests/{request_id}/reject", response_model=AdminAccessRequestItem)
async def reject_request(
    request_id: uuid.UUID,
    data: AdminRequestReject,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminAccessRequestItem:
    """Отклонить заявку (только admin)."""
    service = AdminService(db)
    return await service.reject_request(request_id, admin.id, data.reason)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_admin.py::TestAdminRequests -v
```

- [ ] **Step 5: Commit**

```
feat: implement admin access requests endpoints with tests
```

---

### Task 8: Invite codes list/generate/deactivate endpoints (TDD)

**Files:**
- Modify: `backend/app/modules/admin/service.py`
- Modify: `backend/app/modules/admin/router.py`
- Modify: `backend/tests/test_admin.py`

**Note:** This task depends on SPEC 4 (InviteCode model).

- [ ] **Step 1: Write failing tests for invite code management**

Add to `backend/tests/test_admin.py`:

```python
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
```

- [ ] **Step 2: Implement invite code service methods**

Add to `AdminService` in `backend/app/modules/admin/service.py`:

```python
    async def list_invites(
        self,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[AdminInviteCodeItem], int]:
        """Список инвайт-кодов."""
        from app.modules.auth.models import InviteCode

        query = select(InviteCode)

        # Total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated
        query = query.order_by(InviteCode.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        invites = list(result.scalars().all())

        items: list[AdminInviteCodeItem] = []
        for inv in invites:
            # Получить email создателя
            creator_result = await self.db.execute(
                select(User.email).where(User.id == inv.created_by)
            )
            creator_email = creator_result.scalar_one_or_none()

            # Получить email использовавшего
            used_by_email = None
            if inv.used_by:
                used_result = await self.db.execute(
                    select(User.email).where(User.id == inv.used_by)
                )
                used_by_email = used_result.scalar_one_or_none()

            items.append(AdminInviteCodeItem(
                id=inv.id,
                code=inv.code,
                is_active=inv.is_active,
                created_at=inv.created_at,
                expires_at=inv.expires_at,
                used_at=inv.used_at,
                created_by_email=creator_email,
                used_by_email=used_by_email,
            ))

        return items, total

    async def generate_invites(
        self,
        admin_id: uuid.UUID,
        data: AdminInviteGenerate,
    ) -> list[AdminInviteCodeItem]:
        """Генерация пакета инвайт-кодов."""
        import secrets

        from app.modules.auth.models import InviteCode

        SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

        expires_at = None
        if data.expires_in_days is not None:
            expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)

        # Получить email админа
        admin_result = await self.db.execute(
            select(User.email).where(User.id == admin_id)
        )
        admin_email: str | None = admin_result.scalar_one_or_none()

        codes: list[AdminInviteCodeItem] = []
        for _ in range(data.count):
            code = "".join(secrets.choice(SAFE_CHARS) for _ in range(8))
            invite = InviteCode(
                code=code,
                created_by=admin_id,
                expires_at=expires_at,
                is_active=True,
            )
            self.db.add(invite)
            await self.db.flush()

            codes.append(AdminInviteCodeItem(
                id=invite.id,
                code=invite.code,
                is_active=invite.is_active,
                created_at=invite.created_at,
                expires_at=invite.expires_at,
                used_at=None,
                created_by_email=admin_email,
                used_by_email=None,
            ))

        await self.db.commit()
        return codes

    async def deactivate_invite(self, invite_id: uuid.UUID) -> AdminInviteCodeItem:
        """Деактивировать инвайт-код."""
        from app.modules.auth.models import InviteCode

        result = await self.db.execute(
            select(InviteCode).where(InviteCode.id == invite_id)
        )
        invite = result.scalar_one_or_none()
        if not invite:
            raise NotFoundException("Инвайт-код не найден")

        invite.is_active = False
        await self.db.flush()
        await self.db.commit()

        # Email создателя
        creator_result = await self.db.execute(
            select(User.email).where(User.id == invite.created_by)
        )
        creator_email = creator_result.scalar_one_or_none()

        return AdminInviteCodeItem(
            id=invite.id,
            code=invite.code,
            is_active=invite.is_active,
            created_at=invite.created_at,
            expires_at=invite.expires_at,
            used_at=invite.used_at,
            created_by_email=creator_email,
            used_by_email=None,
        )
```

- [ ] **Step 3: Add invite code endpoints to router**

Add to `backend/app/modules/admin/router.py`:

```python
from app.modules.admin.schemas import (
    AdminInviteCodeItem,
    AdminInviteGenerate,
)


@router.get("/invites", response_model=PaginatedResponse[AdminInviteCodeItem])
async def list_invites(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> PaginatedResponse[AdminInviteCodeItem]:
    """Список инвайт-кодов (только admin)."""
    service = AdminService(db)
    items, total = await service.list_invites(limit=limit, offset=offset)
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/invites/generate",
    response_model=list[AdminInviteCodeItem],
    status_code=201,
)
async def generate_invites(
    data: AdminInviteGenerate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminInviteCodeItem]:
    """Сгенерировать инвайт-коды (только admin)."""
    service = AdminService(db)
    return await service.generate_invites(admin.id, data)


@router.patch("/invites/{invite_id}", response_model=AdminInviteCodeItem)
async def deactivate_invite(
    invite_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminInviteCodeItem:
    """Деактивировать инвайт-код (только admin)."""
    service = AdminService(db)
    return await service.deactivate_invite(invite_id)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_admin.py::TestAdminInvites -v
```

- [ ] **Step 5: Commit**

```
feat: implement admin invite codes endpoints with tests
```

---

### Task 9: Billing plans PATCH/DELETE endpoints (TDD)

**Files:**
- Modify: `backend/app/modules/billing/router.py`
- Modify: `backend/app/modules/billing/service.py`
- Modify: `backend/app/modules/billing/schemas.py`
- Modify: `backend/tests/test_billing.py`

- [ ] **Step 1: Write failing tests for plan update/delete**

Add to `backend/tests/test_billing.py`:

```python
class TestPlanManagement:
    """Тесты admin PATCH/DELETE для планов."""

    async def test_update_plan(
        self, client: AsyncClient, admin_headers: dict, free_plan: Plan,
    ) -> None:
        """Admin обновляет план."""
        response = await client.patch(
            f"/api/billing/plans/{free_plan.id}",
            headers=admin_headers,
            json={"name": "Free Updated", "max_bots": 3},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Free Updated"
        assert data["max_bots"] == 3
        assert data["slug"] == "free"  # slug не меняется

    async def test_update_plan_user_forbidden(
        self, client: AsyncClient, auth_headers: dict, free_plan: Plan,
    ) -> None:
        """Обычный пользователь не может обновить план."""
        response = await client.patch(
            f"/api/billing/plans/{free_plan.id}",
            headers=auth_headers,
            json={"name": "Hacked"},
        )
        assert response.status_code == 403

    async def test_delete_plan(
        self, client: AsyncClient, admin_headers: dict, pro_plan: Plan,
    ) -> None:
        """Admin удаляет план без активных подписок."""
        response = await client.delete(
            f"/api/billing/plans/{pro_plan.id}",
            headers=admin_headers,
        )
        assert response.status_code == 204

    async def test_delete_plan_with_subscriptions(
        self, client: AsyncClient, admin_headers: dict, auth_headers: dict,
        free_plan: Plan,
    ) -> None:
        """Нельзя удалить план с активными подписками."""
        # Подписать пользователя
        await client.post("/api/billing/subscribe/free", headers=auth_headers)

        response = await client.delete(
            f"/api/billing/plans/{free_plan.id}",
            headers=admin_headers,
        )
        assert response.status_code == 409

    async def test_delete_plan_not_found(
        self, client: AsyncClient, admin_headers: dict,
    ) -> None:
        """Удаление несуществующего плана -> 404."""
        import uuid
        fake_id = uuid.uuid4()
        response = await client.delete(
            f"/api/billing/plans/{fake_id}",
            headers=admin_headers,
        )
        assert response.status_code == 404
```

- [ ] **Step 2: Add PlanUpdate schema to billing schemas**

Add to `backend/app/modules/billing/schemas.py`:

```python
class PlanUpdate(BaseModel):
    """Обновление тарифного плана (admin only)."""
    name: str | None = Field(None, min_length=1, max_length=50)
    price_monthly: Decimal | None = Field(None, ge=0)
    max_bots: int | None = Field(None, ge=0)
    max_strategies: int | None = Field(None, ge=0)
    max_backtests_per_day: int | None = Field(None, ge=0)
    features: dict | None = None
```

- [ ] **Step 3: Add service methods for update/delete**

Add to `BillingService` in `backend/app/modules/billing/service.py`:

```python
from app.modules.billing.schemas import PlanCreate, PlanUpdate


    async def update_plan(self, plan_id: uuid.UUID, data: PlanUpdate) -> Plan:
        """Обновить тарифный план (admin)."""
        result = await self.db.execute(select(Plan).where(Plan.id == plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundException("Тарифный план не найден")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(plan, field, value)

        await self.db.flush()
        await self.db.commit()
        return plan

    async def delete_plan(self, plan_id: uuid.UUID) -> None:
        """Удалить тарифный план (admin, если нет активных подписок)."""
        result = await self.db.execute(select(Plan).where(Plan.id == plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundException("Тарифный план не найден")

        # Проверить активные подписки
        sub_result = await self.db.execute(
            select(func.count(Subscription.id)).where(
                Subscription.plan_id == plan_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
        )
        active_subs: int = sub_result.scalar_one()
        if active_subs > 0:
            raise ConflictException(
                f"Нельзя удалить план с {active_subs} активными подписками"
            )

        await self.db.delete(plan)
        await self.db.commit()
```

Also add `from sqlalchemy import func` to the imports if not already there.

- [ ] **Step 4: Add PATCH/DELETE endpoints to billing router**

Add to `backend/app/modules/billing/router.py`:

```python
import uuid

from app.modules.auth.dependencies import get_admin_user
from app.modules.billing.schemas import PlanCreate, PlanResponse, PlanUpdate, SubscriptionResponse


@router.patch("/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: uuid.UUID,
    data: PlanUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> PlanResponse:
    """Обновить тарифный план (только admin)."""
    service = BillingService(db)
    return await service.update_plan(plan_id, data)


@router.delete("/plans/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить тарифный план (только admin, если нет подписок)."""
    service = BillingService(db)
    await service.delete_plan(plan_id)
```

Update the imports at the top of `billing/router.py` to include `uuid`, `get_admin_user`, and `PlanUpdate`:

```python
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_admin_user, get_current_user
from app.modules.auth.models import User
from app.modules.billing.schemas import PlanCreate, PlanResponse, PlanUpdate, SubscriptionResponse
from app.modules.billing.service import BillingService
```

- [ ] **Step 5: Run tests**

```bash
cd backend && pytest tests/test_billing.py -v
```

- [ ] **Step 6: Commit**

```
feat: add PATCH/DELETE billing plans endpoints for admin
```

---

### Task 10: System logs endpoint (TDD)

**Files:**
- Modify: `backend/app/modules/admin/service.py`
- Modify: `backend/app/modules/admin/router.py`
- Modify: `backend/tests/test_admin.py`

- [ ] **Step 1: Write failing tests for system logs**

Add to `backend/tests/test_admin.py`:

```python
from app.modules.trading.models import (
    Bot, BotLog, BotLogLevel, BotMode, BotStatus,
)
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.auth.models import ExchangeAccount, ExchangeType


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
    from app.core.security import encrypt_api_key
    ea = ExchangeAccount(
        user_id=test_user.id,
        exchange=ExchangeType.BYBIT,
        label="test",
        api_key_encrypted=encrypt_api_key("test_key"),
        api_secret_encrypted=encrypt_api_key("test_secret"),
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
```

- [ ] **Step 2: Implement system logs service method**

Add to `AdminService` in `backend/app/modules/admin/service.py`:

```python
    async def list_logs(
        self,
        limit: int = 50,
        offset: int = 0,
        level: str | None = None,
        bot_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> tuple[list[AdminLogItem], int]:
        """Список логов ботов с фильтрацией."""
        query = select(BotLog)

        # Фильтры
        if level:
            query = query.where(BotLog.level == BotLogLevel(level))
        if bot_id:
            query = query.where(BotLog.bot_id == bot_id)
        if user_id:
            # JOIN через Bot для фильтрации по user_id
            query = query.join(Bot, BotLog.bot_id == Bot.id).where(Bot.user_id == user_id)
        if from_date:
            query = query.where(BotLog.created_at >= from_date)
        if to_date:
            query = query.where(BotLog.created_at <= to_date)

        # Total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated
        query = query.order_by(BotLog.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        logs = list(result.scalars().all())

        items: list[AdminLogItem] = []
        for log in logs:
            # Получить email пользователя через Bot
            user_result = await self.db.execute(
                select(User.email)
                .join(Bot, Bot.user_id == User.id)
                .where(Bot.id == log.bot_id)
            )
            user_email = user_result.scalar_one_or_none()

            items.append(AdminLogItem(
                id=log.id,
                bot_id=log.bot_id,
                level=log.level.value if hasattr(log.level, 'value') else str(log.level),
                message=log.message,
                details=log.details,
                created_at=log.created_at,
                user_email=user_email,
            ))

        return items, total
```

- [ ] **Step 3: Add logs endpoint to router**

Add to `backend/app/modules/admin/router.py`:

```python
from datetime import datetime

from app.modules.admin.schemas import AdminLogItem


@router.get("/logs", response_model=PaginatedResponse[AdminLogItem])
async def list_logs(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    level: str | None = Query(None),
    bot_id: uuid.UUID | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
) -> PaginatedResponse[AdminLogItem]:
    """Логи ботов всех пользователей (только admin)."""
    service = AdminService(db)
    items, total = await service.list_logs(
        limit=limit,
        offset=offset,
        level=level,
        bot_id=bot_id,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
    )
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_admin.py::TestAdminLogs -v
```

- [ ] **Step 5: Run all admin tests**

```bash
cd backend && pytest tests/test_admin.py -v
```

- [ ] **Step 6: Commit**

```
feat: implement admin system logs endpoint with filters and tests
```

---

### Task 11: Run /simplify on all backend code

- [ ] **Step 1: Run full test suite**

```bash
cd backend && pytest tests/ -v
```

- [ ] **Step 2: Run /simplify for review**

Review all changes in the admin module for code quality, duplication, and consistency.

- [ ] **Step 3: Fix any issues found, commit if changes made**

```
refactor: simplify admin module after review
```

---

### Task 12: Create AdminRoute.tsx guard component

**Files:**
- Create: `frontend/src/components/AdminRoute.tsx`

- [ ] **Step 1: Create AdminRoute component**

Create `frontend/src/components/AdminRoute.tsx`:

```tsx
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAuthenticated, isLoading, user, fetchUser } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchUser();
    }
  }, [isAuthenticated, user, fetchUser]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-bg">
        <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**

```
feat: create AdminRoute guard component for admin pages
```

---

### Task 13: Update Sidebar.tsx with conditional admin section

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar with admin navigation**

Replace the full content of `frontend/src/components/layout/Sidebar.tsx`:

```tsx
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Brain,
  Bot,
  FlaskConical,
  Settings,
  CandlestickChart,
  Menu,
  X,
  Users,
  MessageCircle,
  KeyRound,
  CreditCard,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'График', href: '/chart/BTCUSDT', icon: CandlestickChart, matchPrefix: '/chart' },
  { name: 'Стратегии', href: '/strategies', icon: Brain },
  { name: 'Боты', href: '/bots', icon: Bot },
  { name: 'Бэктест', href: '/backtest', icon: FlaskConical },
  { name: 'Настройки', href: '/settings', icon: Settings },
];

const adminNavigation = [
  { name: 'Обзор', href: '/admin', icon: LayoutDashboard },
  { name: 'Пользователи', href: '/admin/users', icon: Users },
  { name: 'Заявки', href: '/admin/requests', icon: MessageCircle },
  { name: 'Инвайт-коды', href: '/admin/invites', icon: KeyRound },
  { name: 'Тарифы', href: '/admin/billing', icon: CreditCard },
  { name: 'Логи', href: '/admin/logs', icon: Terminal },
];

function NavItem({
  item,
  location,
  onClick,
}: {
  item: { name: string; href: string; icon: React.ElementType; matchPrefix?: string };
  location: { pathname: string };
  onClick?: () => void;
}) {
  const prefix = item.matchPrefix ?? item.href;
  const isActive =
    location.pathname === item.href ||
    (prefix !== '/dashboard' && prefix !== '/admin' && location.pathname.startsWith(prefix));

  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-brand-premium/10 text-brand-premium'
          : 'text-gray-400 hover:text-white hover:bg-white/5',
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-brand-premium" />
      )}
      <item.icon className="h-5 w-5 flex-shrink-0" />
      {item.name}
    </Link>
  );
}

export function Sidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuthStore();

  const isAdmin = user?.role === 'admin';

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
        <img src="/logo.webp" alt="AlgoBond" className="w-9 h-9 rounded-lg" />
        <span className="text-xl font-bold text-white tracking-tight font-heading">
          AlgoBond
        </span>
        {/* Mobile close */}
        <button
          className="ml-auto md:hidden text-gray-400 hover:text-white"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            location={location}
            onClick={() => setMobileOpen(false)}
          />
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="my-3 border-t border-white/10" />
            <span className="block text-xs text-gray-500 px-3 pb-1 uppercase tracking-wider font-medium">
              Админ
            </span>
            {adminNavigation.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                location={location}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-border">
        <div className="text-xs text-gray-500/60 font-data tracking-wide">v0.8.0</div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-brand-card border border-white/10"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-gray-300" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 border-r border-border bg-brand-bg flex flex-col transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-brand-bg flex-col">
        {navContent}
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: add conditional admin section to sidebar navigation
```

---

### Task 14: Create AdminDashboard.tsx

**Files:**
- Create: `frontend/src/pages/admin/AdminDashboard.tsx`

- [ ] **Step 1: Create admin dashboard page**

Create `frontend/src/pages/admin/AdminDashboard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  Users,
  Bot,
  MessageCircle,
  Activity,
  TrendingUp,
  Key,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';

interface AdminStats {
  users_count: number;
  active_bots: number;
  pending_requests: number;
  total_trades: number;
  total_pnl: number;
  active_invites: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function StatCard({ title, value, icon: Icon, color, bgColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold font-data text-white">{value}</p>
        </div>
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${bgColor}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/admin/stats');
      setStats(data);
    } catch {
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Админ-панель</h1>
          <p className="text-sm text-gray-400 mt-1">Обзор состояния платформы</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Всего пользователей"
            value={stats.users_count}
            icon={Users}
            color="text-blue-400"
            bgColor="bg-blue-400/10"
          />
          <StatCard
            title="Активные боты"
            value={stats.active_bots}
            icon={Bot}
            color="text-emerald-400"
            bgColor="bg-emerald-400/10"
          />
          <StatCard
            title="Заявки на рассмотрении"
            value={stats.pending_requests}
            icon={MessageCircle}
            color="text-yellow-400"
            bgColor="bg-yellow-400/10"
          />
          <StatCard
            title="Всего сделок"
            value={stats.total_trades.toLocaleString()}
            icon={Activity}
            color="text-purple-400"
            bgColor="bg-purple-400/10"
          />
          <StatCard
            title="Суммарный P&L"
            value={`$${Number(stats.total_pnl).toFixed(2)}`}
            icon={TrendingUp}
            color={Number(stats.total_pnl) >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}
            bgColor={Number(stats.total_pnl) >= 0 ? 'bg-[#00E676]/10' : 'bg-[#FF1744]/10'}
          />
          <StatCard
            title="Активные инвайт-коды"
            value={stats.active_invites}
            icon={Key}
            color="text-[#FFD700]"
            bgColor="bg-[#FFD700]/10"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: create AdminDashboard page with stats cards
```

---

### Task 15: Create AdminUsers.tsx

**Files:**
- Create: `frontend/src/pages/admin/AdminUsers.tsx`

- [ ] **Step 1: Create admin users page with table, search, pagination**

Create `frontend/src/pages/admin/AdminUsers.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  ShieldOff,
  Ban,
  CheckCircle,
  Trash2,
  Eye,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  bots_count: number;
  subscription_plan: string | null;
}

interface UserDetail {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  bots_count: number;
  exchange_accounts_count: number;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  total_pnl: number;
  total_trades: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function AdminUsers() {
  const [users, setUsers] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteEmail, setDeleteEmail] = useState('');
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setUsers(data);
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchUsers();
  };

  const viewUserDetail = async (userId: string) => {
    try {
      setDetailLoading(true);
      const { data } = await api.get(`/admin/users/${userId}`);
      setSelectedUser(data);
    } catch {
      // Error
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await api.patch(`/admin/users/${userId}`, { role: newRole });
      fetchUsers();
      if (selectedUser?.id === userId) {
        viewUserDetail(userId);
      }
    } catch {
      // Error
    }
  };

  const toggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await api.patch(`/admin/users/${userId}`, { is_active: !currentActive });
      fetchUsers();
      if (selectedUser?.id === userId) {
        viewUserDetail(userId);
      }
    } catch {
      // Error
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (deleteEmail !== email) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setDeleteConfirm(null);
      setDeleteEmail('');
      setSelectedUser(null);
      fetchUsers();
    } catch {
      // Error
    }
  };

  const totalPages = users ? Math.ceil(users.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white font-heading">Пользователи</h1>
        <p className="text-sm text-gray-400 mt-1">
          Управление аккаунтами пользователей
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Поиск по email или username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#FFD700]/50"
          />
        </form>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          className="px-3 py-2.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50"
        >
          <option value="">Все роли</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Username</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Роль</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Боты</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Подписка</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создан</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading && !users ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : users && users.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                users?.items.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white font-data">{u.email}</td>
                    <td className="px-4 py-3 text-gray-300">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        u.role === 'admin'
                          ? 'bg-[#FFD700]/10 text-[#FFD700]'
                          : 'bg-white/5 text-gray-400',
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 text-xs',
                        u.is_active ? 'text-[#00E676]' : 'text-[#FF1744]',
                      )}>
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          u.is_active ? 'bg-[#00E676]' : 'bg-[#FF1744]',
                        )} />
                        {u.is_active ? 'Активен' : 'Заблокирован'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-data">{u.bots_count}</td>
                    <td className="px-4 py-3 text-gray-400">{u.subscription_plan || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-data">
                      {new Date(u.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => viewUserDetail(u.id)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                          title="Подробнее"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleRole(u.id, u.role)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-[#FFD700] transition-colors"
                          title={u.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                        >
                          {u.role === 'admin' ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => toggleActive(u.id, u.is_active)}
                          className={cn(
                            'p-1.5 rounded-lg hover:bg-white/5 transition-colors',
                            u.is_active
                              ? 'text-gray-400 hover:text-[#FF1744]'
                              : 'text-gray-400 hover:text-[#00E676]',
                          )}
                          title={u.is_active ? 'Заблокировать' : 'Разблокировать'}
                        >
                          {u.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-[#FF1744] transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {users && users.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {users.offset + 1}-{Math.min(users.offset + limit, users.total)} из {users.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 font-data">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedUser(null)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-lg mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white font-heading">Профиль пользователя</h2>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500">Email</span>
                    <p className="text-white font-data">{selectedUser.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Username</span>
                    <p className="text-white">{selectedUser.username}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Роль</span>
                    <p className={selectedUser.role === 'admin' ? 'text-[#FFD700]' : 'text-gray-300'}>
                      {selectedUser.role}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Статус</span>
                    <p className={selectedUser.is_active ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                      {selectedUser.is_active ? 'Активен' : 'Заблокирован'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Боты</span>
                    <p className="text-white font-data">{selectedUser.bots_count}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Биржевые аккаунты</span>
                    <p className="text-white font-data">{selectedUser.exchange_accounts_count}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Подписка</span>
                    <p className="text-white">{selectedUser.subscription_plan || 'Нет'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Статус подписки</span>
                    <p className="text-gray-300">{selectedUser.subscription_status || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Всего сделок</span>
                    <p className="text-white font-data">{selectedUser.total_trades}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Суммарный P&L</span>
                    <p className={cn(
                      'font-data',
                      Number(selectedUser.total_pnl) >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]',
                    )}>
                      ${Number(selectedUser.total_pnl).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/5 text-xs text-gray-500 font-data">
                  Создан: {new Date(selectedUser.created_at).toLocaleString('ru-RU')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setDeleteConfirm(null); setDeleteEmail(''); }}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#FF1744]">Удаление пользователя</h2>
            <p className="text-sm text-gray-400">
              Это действие необратимо. Будут удалены все данные пользователя: боты, ордера, позиции, настройки.
            </p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Введите email пользователя для подтверждения:
              </label>
              <input
                type="text"
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FF1744]/50"
                placeholder="email@example.com"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteEmail(''); }}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  const user = users?.items.find((u) => u.id === deleteConfirm);
                  if (user) deleteUser(deleteConfirm, user.email);
                }}
                disabled={!users?.items.find((u) => u.id === deleteConfirm && u.email === deleteEmail)}
                className="px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm hover:bg-[#FF1744]/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: create AdminUsers page with table, search, pagination and modals
```

---

### Task 16: Create AdminRequests.tsx

**Files:**
- Create: `frontend/src/pages/admin/AdminRequests.tsx`

- [ ] **Step 1: Create admin requests page with approve/reject**

Create `frontend/src/pages/admin/AdminRequests.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  X,
  Copy,
  CheckCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface AccessRequest {
  id: string;
  telegram: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ожидает', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  approved: { label: 'Одобрена', color: 'text-[#00E676]', bg: 'bg-[#00E676]/10' },
  rejected: { label: 'Отклонена', color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' },
};

export function AdminRequests() {
  const [requests, setRequests] = useState<PaginatedResponse<AccessRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Approve modal
  const [approveCode, setApproveCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reject modal
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/admin/requests?${params.toString()}`);
      setRequests(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    try {
      setActionLoading(requestId);
      const { data } = await api.post(`/admin/requests/${requestId}/approve`);
      setApproveCode(data.invite_code);
      fetchRequests();
    } catch {
      // Error
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    try {
      setActionLoading(rejectId);
      await api.post(`/admin/requests/${rejectId}/reject`, { reason: rejectReason || null });
      setRejectId(null);
      setRejectReason('');
      fetchRequests();
    } catch {
      // Error
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalPages = requests ? Math.ceil(requests.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white font-heading">Заявки на доступ</h1>
        <p className="text-sm text-gray-400 mt-1">Обработка заявок на регистрацию</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        {['pending', 'approved', 'rejected', ''].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(0); }}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-[#FFD700]/10 text-[#FFD700]'
                : 'text-gray-400 hover:text-white',
            )}
          >
            {s === '' ? 'Все' : statusLabels[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Telegram</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создана</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Рассмотрена</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading && !requests ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : requests && requests.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    {statusFilter === 'pending'
                      ? 'Нет заявок на рассмотрении'
                      : 'Заявки не найдены'}
                  </td>
                </tr>
              ) : (
                requests?.items.map((req) => {
                  const badge = statusLabels[req.status] || statusLabels.pending;
                  return (
                    <tr key={req.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-data">{req.telegram}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          badge.bg, badge.color,
                        )}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {new Date(req.created_at).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {req.reviewed_at
                          ? new Date(req.reviewed_at).toLocaleString('ru-RU')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {req.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(req.id)}
                                disabled={actionLoading === req.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00E676]/10 text-[#00E676] text-xs font-medium hover:bg-[#00E676]/20 transition-colors disabled:opacity-50"
                              >
                                {actionLoading === req.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Одобрить
                              </button>
                              <button
                                onClick={() => setRejectId(req.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FF1744]/10 text-[#FF1744] text-xs font-medium hover:bg-[#FF1744]/20 transition-colors"
                              >
                                <X className="h-3 w-3" />
                                Отклонить
                              </button>
                            </>
                          )}
                          {req.status === 'rejected' && req.reject_reason && (
                            <span className="text-xs text-gray-500 italic" title={req.reject_reason}>
                              {req.reject_reason.length > 30
                                ? req.reject_reason.slice(0, 30) + '...'
                                : req.reject_reason}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {requests && requests.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {requests.offset + 1}-{Math.min(requests.offset + limit, requests.total)} из {requests.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 font-data">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Approve Success Modal */}
      {approveCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setApproveCode(null)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#00E676]">Заявка одобрена</h2>
            <p className="text-sm text-gray-400">Инвайт-код сгенерирован. Отправьте его пользователю в Telegram.</p>
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-3">
              <code className="flex-1 text-lg font-mono tracking-widest text-[#FFD700]">
                {approveCode}
              </code>
              <button
                onClick={() => copyToClipboard(approveCode)}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                {copied ? <CheckCheck className="h-4 w-4 text-[#00E676]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => setApproveCode(null)}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 text-gray-300 hover:text-white text-sm transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setRejectId(null); setRejectReason(''); }}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#FF1744]">Отклонить заявку</h2>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Причина (необязательно):</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none focus:outline-none focus:border-[#FF1744]/50"
                placeholder="Укажите причину отказа..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectId}
                className="px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm hover:bg-[#FF1744]/80 transition-colors disabled:opacity-50"
              >
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: create AdminRequests page with approve/reject flow
```

---

### Task 17: Create AdminInvites.tsx

**Files:**
- Create: `frontend/src/pages/admin/AdminInvites.tsx`

- [ ] **Step 1: Create admin invites page with generation and table**

Create `frontend/src/pages/admin/AdminInvites.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Copy,
  CheckCheck,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface InviteCode {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  created_by_email: string | null;
  used_by_email: string | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

function getInviteStatus(invite: InviteCode): { label: string; color: string; bg: string } {
  if (invite.used_at) return { label: 'Использован', color: 'text-gray-400', bg: 'bg-white/5' };
  if (!invite.is_active) return { label: 'Деактивирован', color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { label: 'Истек', color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' };
  }
  return { label: 'Активен', color: 'text-[#00E676]', bg: 'bg-[#00E676]/10' };
}

export function AdminInvites() {
  const [invites, setInvites] = useState<PaginatedResponse<InviteCode> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genCount, setGenCount] = useState(1);
  const [genExpiry, setGenExpiry] = useState<string>('30');
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<InviteCode[]>([]);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const { data } = await api.get(`/admin/invites?${params.toString()}`);
      setInvites(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const expiresInDays = genExpiry === 'none' ? null : Number(genExpiry);
      const { data } = await api.post('/admin/invites/generate', {
        count: genCount,
        expires_in_days: expiresInDays,
      });
      setGeneratedCodes(data);
      fetchInvites();
    } catch {
      // Error
    } finally {
      setGenerating(false);
    }
  };

  const handleDeactivate = async (inviteId: string) => {
    try {
      await api.patch(`/admin/invites/${inviteId}`);
      fetchInvites();
    } catch {
      // Error
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAllCodes = async () => {
    const codes = generatedCodes.map((c) => c.code).join('\n');
    await navigator.clipboard.writeText(codes);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = invites ? Math.ceil(invites.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Инвайт-коды</h1>
          <p className="text-sm text-gray-400 mt-1">Генерация и управление кодами приглашения</p>
        </div>
        <button
          onClick={() => { setShowGenerate(true); setGeneratedCodes([]); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Сгенерировать
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Код</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создал</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Использовал</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создан</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Истекает</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading && !invites ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : invites && invites.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    Нет инвайт-кодов. Сгенерируйте первый!
                  </td>
                </tr>
              ) : (
                invites?.items.map((inv) => {
                  const status = getInviteStatus(inv);
                  return (
                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <code className="font-mono tracking-widest text-[#FFD700]">{inv.code}</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          status.bg, status.color,
                        )}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{inv.created_by_email || '-'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{inv.used_by_email || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {new Date(inv.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('ru-RU') : 'Бессрочно'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyToClipboard(inv.code, inv.id)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                            title="Копировать"
                          >
                            {copiedId === inv.id ? (
                              <CheckCheck className="h-4 w-4 text-[#00E676]" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          {inv.is_active && !inv.used_at && (
                            <button
                              onClick={() => handleDeactivate(inv.id)}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-[#FF1744] transition-colors"
                              title="Деактивировать"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {invites && invites.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {invites.offset + 1}-{Math.min(invites.offset + limit, invites.total)} из {invites.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 font-data">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowGenerate(false)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white font-heading">Сгенерировать инвайт-коды</h2>

            {generatedCodes.length === 0 ? (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Количество (1-20)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={genCount}
                    onChange={(e) => setGenCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50 font-data"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Срок действия</label>
                  <select
                    value={genExpiry}
                    onChange={(e) => setGenExpiry(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50"
                  >
                    <option value="7">7 дней</option>
                    <option value="30">30 дней</option>
                    <option value="90">90 дней</option>
                    <option value="none">Бессрочно</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors disabled:opacity-50"
                  >
                    {generating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Сгенерировать
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  Сгенерировано {generatedCodes.length} кодов:
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {generatedCodes.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                      <code className="flex-1 font-mono tracking-widest text-[#FFD700]">{c.code}</code>
                      <button
                        onClick={() => copyToClipboard(c.code, c.id)}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      >
                        {copiedId === c.id ? (
                          <CheckCheck className="h-3.5 w-3.5 text-[#00E676]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2">
                  <button
                    onClick={copyAllCodes}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-sm hover:text-white transition-colors"
                  >
                    {copiedId === 'all' ? (
                      <CheckCheck className="h-4 w-4 text-[#00E676]" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    Копировать все
                  </button>
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="px-4 py-2 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors"
                  >
                    Готово
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: create AdminInvites page with generation and management
```

---

### Task 18: Create AdminBilling.tsx

**Files:**
- Create: `frontend/src/pages/admin/AdminBilling.tsx`

- [ ] **Step 1: Create admin billing page with plan cards and create form**

Create `frontend/src/pages/admin/AdminBilling.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Bot,
  Brain,
  FlaskConical,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  max_bots: number;
  max_strategies: number;
  max_backtests_per_day: number;
  features: Record<string, unknown>;
}

export function AdminBilling() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    price_monthly: 0,
    max_bots: 1,
    max_strategies: 1,
    max_backtests_per_day: 5,
    features: {},
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/billing/plans');
      setPlans(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateForm = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      slug: '',
      price_monthly: 0,
      max_bots: 1,
      max_strategies: 1,
      max_backtests_per_day: 5,
      features: {},
    });
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      price_monthly: plan.price_monthly,
      max_bots: plan.max_bots,
      max_strategies: plan.max_strategies,
      max_backtests_per_day: plan.max_backtests_per_day,
      features: plan.features,
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormLoading(true);
      setFormError(null);

      if (editingPlan) {
        // PATCH - only changed fields (excluding slug)
        await api.patch(`/billing/plans/${editingPlan.id}`, {
          name: formData.name,
          price_monthly: formData.price_monthly,
          max_bots: formData.max_bots,
          max_strategies: formData.max_strategies,
          max_backtests_per_day: formData.max_backtests_per_day,
        });
      } else {
        // POST - create new
        await api.post('/billing/plans', formData);
      }

      setShowForm(false);
      fetchPlans();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        'Ошибка сохранения';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await api.delete(`/billing/plans/${deleteId}`);
      setDeleteId(null);
      fetchPlans();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        'Ошибка удаления';
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Тарифные планы</h1>
          <p className="text-sm text-gray-400 mt-1">Управление подписками и лимитами</p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Создать план
        </button>
      </div>

      {/* Plan Cards */}
      {plans.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-12 text-center">
          <p className="text-gray-500">Нет тарифных планов. Создайте первый!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5 space-y-4 relative group"
            >
              {/* Actions overlay */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEditForm(plan)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { setDeleteId(plan.id); setDeleteError(null); }}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-[#FF1744]/10 text-gray-400 hover:text-[#FF1744] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Plan info */}
              <div>
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="text-xs text-gray-500 font-data">{plan.slug}</p>
              </div>

              <div className="text-3xl font-bold text-[#FFD700] font-data">
                ${Number(plan.price_monthly).toFixed(2)}
                <span className="text-sm text-gray-500 font-normal">/мес</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Bot className="h-4 w-4 text-gray-500" />
                  <span>Ботов: <strong className="text-white font-data">{plan.max_bots}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Brain className="h-4 w-4 text-gray-500" />
                  <span>Стратегий: <strong className="text-white font-data">{plan.max_strategies}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <FlaskConical className="h-4 w-4 text-gray-500" />
                  <span>Бэктестов/день: <strong className="text-white font-data">{plan.max_backtests_per_day}</strong></span>
                </div>
              </div>

              {/* Features JSON (read-only) */}
              {Object.keys(plan.features).length > 0 && (
                <div className="pt-2 border-t border-white/5">
                  <p className="text-xs text-gray-500 mb-1">Features:</p>
                  <pre className="text-xs text-gray-400 font-data bg-white/5 rounded p-2 overflow-auto max-h-20">
                    {JSON.stringify(plan.features, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowForm(false)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white font-heading">
                {editingPlan ? 'Редактировать план' : 'Новый план'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Название</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  maxLength={50}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50"
                />
              </div>

              {!editingPlan && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Slug (уникальный идентификатор)</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                    required
                    maxLength={50}
                    pattern="^[a-z0-9_-]+$"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-1">Цена ($/мес)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price_monthly}
                  onChange={(e) => setFormData({ ...formData, price_monthly: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Боты</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.max_bots}
                    onChange={(e) => setFormData({ ...formData, max_bots: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Стратегии</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.max_strategies}
                    onChange={(e) => setFormData({ ...formData, max_strategies: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Бэктесты</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.max_backtests_per_day}
                    onChange={(e) => setFormData({ ...formData, max_backtests_per_day: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-sm text-[#FF1744]">{formError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors disabled:opacity-50"
                >
                  {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingPlan ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeleteId(null)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#FF1744]">Удалить план</h2>
            <p className="text-sm text-gray-400">
              Вы уверены? План не может быть удален, если у него есть активные подписки.
            </p>
            {deleteError && (
              <p className="text-sm text-[#FF1744]">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm hover:bg-[#FF1744]/80 transition-colors disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: create AdminBilling page with plan cards and CRUD
```

---

### Task 19: Create AdminLogs.tsx

**Files:**
- Create: `frontend/src/pages/admin/AdminLogs.tsx`

- [ ] **Step 1: Create admin logs page with table, filters, auto-refresh**

Create `frontend/src/pages/admin/AdminLogs.tsx`:

```tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  bot_id: string;
  level: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
  user_email: string | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const levelStyles: Record<string, { color: string; bg: string }> = {
  info: { color: 'text-gray-400', bg: 'bg-gray-400/10' },
  warn: { color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  error: { color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' },
  debug: { color: 'text-blue-400', bg: 'bg-blue-400/10' },
};

const levelOptions = ['info', 'warn', 'error', 'debug'];

export function AdminLogs() {
  const [logs, setLogs] = useState<PaginatedResponse<LogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 50;

  // Filters
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [botFilter, setBotFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  // Expanded rows
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (selectedLevels.length === 1) {
        params.set('level', selectedLevels[0]);
      }
      if (botFilter) params.set('bot_id', botFilter);
      const { data } = await api.get(`/admin/logs?${params.toString()}`);
      setLogs(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [page, selectedLevels, botFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh toggle
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  const toggleLevel = (level: string) => {
    setSelectedLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
    setPage(0);
  };

  const totalPages = logs ? Math.ceil(logs.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Системные логи</h1>
          <p className="text-sm text-gray-400 mt-1">Логи всех ботов платформы</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              autoRefresh
                ? 'bg-[#00E676]/10 text-[#00E676]'
                : 'bg-white/5 text-gray-400 hover:text-white',
            )}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {autoRefresh ? 'Авто: ON' : 'Авто: OFF'}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Обновить
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Level toggles */}
        <div className="flex gap-1">
          {levelOptions.map((level) => {
            const style = levelStyles[level];
            const isSelected = selectedLevels.includes(level);
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition-colors border',
                  isSelected
                    ? `${style.bg} ${style.color} border-current`
                    : 'bg-white/5 text-gray-500 border-transparent hover:text-gray-300',
                )}
              >
                {level}
              </button>
            );
          })}
        </div>

        {/* Bot ID filter */}
        <input
          type="text"
          placeholder="Bot ID..."
          value={botFilter}
          onChange={(e) => { setBotFilter(e.target.value); setPage(0); }}
          className="px-3 py-1.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#FFD700]/50 w-full sm:w-72 font-data"
        />

        {/* User filter */}
        <input
          type="text"
          placeholder="User email..."
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#FFD700]/50 w-full sm:w-56"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium w-10"></th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Время</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Уровень</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Bot ID</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Пользователь</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {loading && !logs ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : logs && logs.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    Нет записей в логах
                  </td>
                </tr>
              ) : (
                logs?.items
                  .filter((log) => {
                    // Client-side filter for multi-level and user email
                    if (selectedLevels.length > 1 && !selectedLevels.includes(log.level)) return false;
                    if (userFilter && !(log.user_email || '').toLowerCase().includes(userFilter.toLowerCase())) return false;
                    return true;
                  })
                  .map((log) => {
                    const style = levelStyles[log.level] || levelStyles.info;
                    const isExpanded = expandedRow === log.id;
                    return (
                      <>
                        <tr
                          key={log.id}
                          className={cn(
                            'border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer',
                            isExpanded && 'bg-white/[0.02]',
                          )}
                          onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                        >
                          <td className="px-4 py-2.5 text-gray-500">
                            {log.details ? (
                              isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs font-data whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase',
                              style.bg, style.color,
                            )}>
                              {log.level}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs font-data">
                            {log.bot_id.slice(0, 8)}...
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">
                            {log.user_email || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-300 text-xs max-w-md truncate">
                            {log.message}
                          </td>
                        </tr>
                        {isExpanded && log.details && (
                          <tr key={`${log.id}-details`}>
                            <td colSpan={6} className="px-4 py-3 bg-white/[0.01]">
                              <pre className="text-xs text-gray-400 font-data bg-white/5 rounded-lg p-3 overflow-auto max-h-48">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logs && logs.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {logs.offset + 1}-{Math.min(logs.offset + limit, logs.total)} из {logs.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 font-data">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: create AdminLogs page with filters, expandable rows, auto-refresh
```

---

### Task 20: Add admin routes to App.tsx + add types

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Add admin types to api.ts**

Add to the bottom of `frontend/src/types/api.ts`:

```typescript
/* ---- Admin ---- */

export interface AdminStats {
  users_count: number;
  active_bots: number;
  pending_requests: number;
  total_trades: number;
  total_pnl: number;
  active_invites: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  bots_count: number;
  subscription_plan: string | null;
}

export interface AdminUserDetail extends AdminUser {
  updated_at: string;
  exchange_accounts_count: number;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  total_pnl: number;
  total_trades: number;
}

export interface AccessRequestItem {
  id: string;
  telegram: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
}

export interface InviteCodeItem {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  created_by_email: string | null;
  used_by_email: string | null;
}

export interface AdminLogEntry {
  id: string;
  bot_id: string;
  level: BotLogLevel;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
  user_email: string | null;
}
```

- [ ] **Step 2: Update App.tsx with admin routes**

Replace the full content of `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { Dashboard } from '@/pages/Dashboard';
import { Strategies } from '@/pages/Strategies';
import { StrategyDetail } from '@/pages/StrategyDetail';
import { Chart } from '@/pages/Chart';
import { Bots } from '@/pages/Bots';
import { BotDetail } from '@/pages/BotDetail';
import { Backtest } from '@/pages/Backtest';
import { Settings } from '@/pages/Settings';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminRoute } from '@/components/AdminRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ToastProvider } from '@/components/ui/toast';

// Admin pages
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminUsers } from '@/pages/admin/AdminUsers';
import { AdminRequests } from '@/pages/admin/AdminRequests';
import { AdminInvites } from '@/pages/admin/AdminInvites';
import { AdminBilling } from '@/pages/admin/AdminBilling';
import { AdminLogs } from '@/pages/admin/AdminLogs';

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes with dashboard layout */}
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/strategies/:slug" element={<StrategyDetail />} />
            <Route path="/chart/:symbol" element={<Chart />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/bots" element={<Bots />} />
            <Route path="/bots/:id" element={<BotDetail />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Admin routes with dashboard layout */}
          <Route
            element={
              <AdminRoute>
                <DashboardLayout />
              </AdminRoute>
            }
          >
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/requests" element={<AdminRequests />} />
            <Route path="/admin/invites" element={<AdminInvites />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/logs" element={<AdminLogs />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
feat: add admin routes to App.tsx and admin types to api.ts
```

---

### Task 21: Final verification and cleanup

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && pytest tests/ -v
```

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Verify backend import**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```

- [ ] **Step 4: Run /simplify for final review**

Review all admin module code for consistency, duplications, missing edge cases.

- [ ] **Step 5: Final commit if any cleanup changes**

```
refactor: final cleanup and polish for admin panel
```
