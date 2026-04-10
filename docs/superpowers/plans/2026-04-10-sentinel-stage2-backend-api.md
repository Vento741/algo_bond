# AlgoBond Sentinel - Stage 2: Backend API + Redis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 API endpoints for Sentinel agent status, toggle, and incidents. Redis keys for agent state. Works without agent running (status: stopped).

**Architecture:** New `sentinel_router.py` and `sentinel_service.py` in admin module. Service reads/writes Redis directly. Agent authenticates via `X-Agent-Token` header (shared secret). Admin authenticates via JWT. No new DB tables - all state in Redis.

**Tech Stack:** FastAPI, Redis (async), Pydantic v2, pytest

**Spec:** `docs/superpowers/specs/2026-04-10-autonomous-agent-monitor-design.md` (Section 6)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/app/modules/admin/sentinel_schemas.py` | Pydantic schemas for agent status, incidents |
| Create | `backend/app/modules/admin/sentinel_service.py` | Redis read/write for agent state |
| Create | `backend/app/modules/admin/sentinel_router.py` | 4 API endpoints |
| Modify | `backend/app/config.py` | Add `agent_secret` setting |
| Modify | `backend/app/main.py` | Register sentinel_router |
| Create | `backend/tests/test_sentinel_api.py` | Tests for all 4 endpoints |

---

### Task 1: Sentinel Schemas

**Files:**
- Create: `backend/app/modules/admin/sentinel_schemas.py`

- [ ] **Step 1: Create sentinel_schemas.py**

```python
"""Pydantic v2 схемы для AlgoBond Sentinel."""

from datetime import datetime

from pydantic import BaseModel, Field


class SentinelStatus(BaseModel):
    """Статус агента из Redis."""

    status: str = Field(description="running / stopped / error")
    started_at: datetime | None = None
    monitors: list[str] = Field(default_factory=list)
    cron_jobs: list[str] = Field(default_factory=list)
    incidents_today: int = 0
    fixes_today: int = 0
    last_health_check: datetime | None = None
    last_health_result: str | None = None


class SentinelStatusUpdate(BaseModel):
    """Обновление статуса агентом (PUT)."""

    status: str | None = None
    started_at: datetime | None = None
    monitors: str | None = Field(None, description="Comma-separated: api,listener")
    cron_jobs: str | None = Field(None, description="Comma-separated: health,reconcile,deps_audit")
    incidents_today: int | None = None
    fixes_today: int | None = None
    last_health_check: datetime | None = None
    last_health_result: str | None = None


class SentinelIncident(BaseModel):
    """Инцидент из Redis list."""

    ts: str
    status: str
    trace: str | None = None
    hash: str | None = None
    fix_commit: str | None = None


class SentinelIncidentsResponse(BaseModel):
    """Список инцидентов с пагинацией."""

    items: list[SentinelIncident]
    total: int
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/modules/admin/sentinel_schemas.py
git commit -m "feat(sentinel): Pydantic schemas for agent status and incidents"
```

---

### Task 2: Add agent_secret to Settings

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add agent_secret field**

In `backend/app/config.py`, add after the `telegram_webapp_url` field:

```python
    # Sentinel agent
    agent_secret: str = ""
```

- [ ] **Step 2: Run import check**

Run: `cd backend && python -c "from app.config import settings; print('agent_secret:', repr(settings.agent_secret))"`
Expected: `agent_secret: ''`

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(sentinel): add agent_secret to config"
```

---

### Task 3: Sentinel Service (Redis operations)

**Files:**
- Create: `backend/app/modules/admin/sentinel_service.py`

- [ ] **Step 1: Create sentinel_service.py**

```python
"""Сервис для управления состоянием AlgoBond Sentinel через Redis."""

import json
import logging
from datetime import datetime

from redis.asyncio import Redis

from app.modules.admin.sentinel_schemas import (
    SentinelIncident,
    SentinelIncidentsResponse,
    SentinelStatus,
    SentinelStatusUpdate,
)

logger = logging.getLogger(__name__)

# Redis keys
AGENT_STATUS_KEY = "algobond:agent:status"
AGENT_COMMAND_KEY = "algobond:agent:command"
AGENT_INCIDENTS_KEY = "algobond:agent:incidents"
AGENT_FIX_QUEUE_KEY = "algobond:agent:fix_queue"


class SentinelService:
    """Управление Sentinel через Redis."""

    def __init__(self, redis: Redis) -> None:
        self.redis = redis

    async def get_status(self) -> SentinelStatus:
        """Получить текущий статус агента из Redis hash."""
        data = await self.redis.hgetall(AGENT_STATUS_KEY)
        if not data:
            return SentinelStatus(status="stopped")

        monitors = data.get("monitors", "")
        cron_jobs = data.get("cron_jobs", "")

        started_at = None
        if data.get("started_at"):
            try:
                started_at = datetime.fromisoformat(data["started_at"])
            except ValueError:
                pass

        last_health_check = None
        if data.get("last_health_check"):
            try:
                last_health_check = datetime.fromisoformat(data["last_health_check"])
            except ValueError:
                pass

        return SentinelStatus(
            status=data.get("status", "stopped"),
            started_at=started_at,
            monitors=[m for m in monitors.split(",") if m],
            cron_jobs=[c for c in cron_jobs.split(",") if c],
            incidents_today=int(data.get("incidents_today", 0)),
            fixes_today=int(data.get("fixes_today", 0)),
            last_health_check=last_health_check,
            last_health_result=data.get("last_health_result"),
        )

    async def update_status(self, update: SentinelStatusUpdate) -> SentinelStatus:
        """Обновить статус агента (вызывается агентом через X-Agent-Token)."""
        fields: dict[str, str] = {}
        if update.status is not None:
            fields["status"] = update.status
        if update.started_at is not None:
            fields["started_at"] = update.started_at.isoformat()
        if update.monitors is not None:
            fields["monitors"] = update.monitors
        if update.cron_jobs is not None:
            fields["cron_jobs"] = update.cron_jobs
        if update.incidents_today is not None:
            fields["incidents_today"] = str(update.incidents_today)
        if update.fixes_today is not None:
            fields["fixes_today"] = str(update.fixes_today)
        if update.last_health_check is not None:
            fields["last_health_check"] = update.last_health_check.isoformat()
        if update.last_health_result is not None:
            fields["last_health_result"] = update.last_health_result

        if fields:
            await self.redis.hset(AGENT_STATUS_KEY, mapping=fields)
            logger.info("Sentinel status updated: %s", list(fields.keys()))

        return await self.get_status()

    async def toggle(self, action: str) -> dict[str, str]:
        """Отправить команду start/stop агенту через Redis."""
        if action not in ("start", "stop"):
            raise ValueError(f"Invalid action: {action}. Must be 'start' or 'stop'")

        await self.redis.set(AGENT_COMMAND_KEY, action)
        logger.info("Sentinel command sent: %s", action)
        return {"command": action, "message": f"Command '{action}' sent to agent"}

    async def get_incidents(self, limit: int = 20, offset: int = 0) -> SentinelIncidentsResponse:
        """Получить список инцидентов из Redis list."""
        total = await self.redis.llen(AGENT_INCIDENTS_KEY)
        raw_items = await self.redis.lrange(AGENT_INCIDENTS_KEY, offset, offset + limit - 1)

        items: list[SentinelIncident] = []
        for raw in raw_items:
            try:
                data = json.loads(raw)
                items.append(SentinelIncident(**data))
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse incident: %s - %s", raw, e)

        return SentinelIncidentsResponse(items=items, total=total)
```

- [ ] **Step 2: Run import check**

Run: `cd backend && python -c "from app.modules.admin.sentinel_service import SentinelService; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/admin/sentinel_service.py
git commit -m "feat(sentinel): Redis service for agent state management"
```

---

### Task 4: Sentinel Router (4 API endpoints)

**Files:**
- Create: `backend/app/modules/admin/sentinel_router.py`

Endpoints:
1. `GET /api/admin/agent/status` - JWT admin
2. `PUT /api/admin/agent/status` - X-Agent-Token
3. `POST /api/admin/agent/toggle` - JWT admin
4. `GET /api/admin/agent/incidents` - JWT admin

- [ ] **Step 1: Create sentinel_router.py**

```python
"""API-эндпоинты управления AlgoBond Sentinel."""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from redis.asyncio import Redis

from app.config import settings
from app.modules.admin.sentinel_schemas import (
    SentinelIncidentsResponse,
    SentinelStatus,
    SentinelStatusUpdate,
)
from app.modules.admin.sentinel_service import SentinelService
from app.modules.auth.dependencies import get_admin_user
from app.modules.auth.models import User
from app.redis import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/agent", tags=["admin-sentinel"])


def _get_service(redis: Redis = Depends(get_redis)) -> SentinelService:
    """Dependency: создать SentinelService."""
    return SentinelService(redis)


def _verify_agent_token(x_agent_token: str = Header(...)) -> str:
    """Dependency: проверить X-Agent-Token для internal API."""
    if not settings.agent_secret:
        raise HTTPException(status_code=503, detail="Agent secret not configured")
    if x_agent_token != settings.agent_secret:
        raise HTTPException(status_code=403, detail="Invalid agent token")
    return x_agent_token


@router.get("/status", response_model=SentinelStatus)
async def get_agent_status(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> SentinelStatus:
    """Статус Sentinel агента из Redis (только admin)."""
    return await service.get_status()


@router.put("/status", response_model=SentinelStatus)
async def update_agent_status(
    update: SentinelStatusUpdate,
    _token: str = Depends(_verify_agent_token),
    service: SentinelService = Depends(_get_service),
) -> SentinelStatus:
    """Обновление статуса Sentinel (internal, X-Agent-Token)."""
    return await service.update_status(update)


@router.post("/toggle")
async def toggle_agent(
    action: str = Query(..., regex="^(start|stop)$"),
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> dict:
    """Отправить команду start/stop Sentinel (только admin)."""
    return await service.toggle(action)


@router.get("/incidents", response_model=SentinelIncidentsResponse)
async def get_agent_incidents(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> SentinelIncidentsResponse:
    """Последние инциденты Sentinel из Redis (только admin)."""
    return await service.get_incidents(limit=limit, offset=offset)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/modules/admin/sentinel_router.py
git commit -m "feat(sentinel): 4 API endpoints for agent management"
```

---

### Task 5: Register Router in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add import**

In `backend/app/main.py`, after `from app.modules.admin.system_router import router as system_router`, add:

```python
from app.modules.admin.sentinel_router import router as sentinel_router
```

- [ ] **Step 2: Include router**

After `app.include_router(system_router)`, add:

```python
app.include_router(sentinel_router)
```

- [ ] **Step 3: Run import check**

Run: `cd backend && python -c "from app.main import app; print('Routes:', len(app.routes))"`
Expected: Prints route count, no errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(sentinel): register sentinel router in main.py"
```

---

### Task 6: Tests for Sentinel API

**Files:**
- Create: `backend/tests/test_sentinel_api.py`

Tests all 4 endpoints with Redis mocking.

- [ ] **Step 1: Write tests**

```python
"""Тесты для Sentinel API endpoints."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def mock_redis():
    """Мок Redis для Sentinel тестов."""
    redis = AsyncMock()
    redis.hgetall = AsyncMock(return_value={})
    redis.hset = AsyncMock()
    redis.set = AsyncMock()
    redis.llen = AsyncMock(return_value=0)
    redis.lrange = AsyncMock(return_value=[])
    return redis


@pytest.fixture
def admin_headers(admin_token: str) -> dict:
    """Заголовки авторизации admin."""
    return {"Authorization": f"Bearer {admin_token}"}


class TestGetAgentStatus:
    """GET /api/admin/agent/status."""

    @pytest.mark.asyncio
    async def test_returns_stopped_when_empty(
        self, admin_headers: dict, mock_redis: AsyncMock,
    ) -> None:
        """Без данных в Redis возвращает status=stopped."""
        with patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.get("/api/admin/agent/status", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "stopped"

    @pytest.mark.asyncio
    async def test_returns_running_status(
        self, admin_headers: dict, mock_redis: AsyncMock,
    ) -> None:
        """С данными в Redis возвращает полный статус."""
        mock_redis.hgetall = AsyncMock(return_value={
            "status": "running",
            "started_at": "2026-04-10T12:00:00+00:00",
            "monitors": "api,listener",
            "cron_jobs": "health,reconcile,deps_audit",
            "incidents_today": "2",
            "fixes_today": "1",
        })
        with patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.get("/api/admin/agent/status", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        assert data["monitors"] == ["api", "listener"]
        assert data["incidents_today"] == 2

    @pytest.mark.asyncio
    async def test_requires_admin(self) -> None:
        """Без JWT возвращает 401."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test",
        ) as client:
            resp = await client.get("/api/admin/agent/status")
        assert resp.status_code in (401, 403)


class TestUpdateAgentStatus:
    """PUT /api/admin/agent/status."""

    @pytest.mark.asyncio
    async def test_update_with_valid_token(self, mock_redis: AsyncMock) -> None:
        """Агент обновляет статус с валидным X-Agent-Token."""
        mock_redis.hgetall = AsyncMock(return_value={"status": "running"})
        with (
            patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis),
            patch("app.modules.admin.sentinel_router.settings") as mock_settings,
        ):
            mock_settings.agent_secret = "test-secret-123"
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.put(
                    "/api/admin/agent/status",
                    json={"status": "running"},
                    headers={"X-Agent-Token": "test-secret-123"},
                )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_reject_invalid_token(self, mock_redis: AsyncMock) -> None:
        """Невалидный токен - 403."""
        with (
            patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis),
            patch("app.modules.admin.sentinel_router.settings") as mock_settings,
        ):
            mock_settings.agent_secret = "real-secret"
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.put(
                    "/api/admin/agent/status",
                    json={"status": "running"},
                    headers={"X-Agent-Token": "wrong-token"},
                )
        assert resp.status_code == 403


class TestToggleAgent:
    """POST /api/admin/agent/toggle."""

    @pytest.mark.asyncio
    async def test_start_command(
        self, admin_headers: dict, mock_redis: AsyncMock,
    ) -> None:
        """Toggle start отправляет команду в Redis."""
        with patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.post(
                    "/api/admin/agent/toggle?action=start", headers=admin_headers,
                )
        assert resp.status_code == 200
        mock_redis.set.assert_called_once_with("algobond:agent:command", "start")

    @pytest.mark.asyncio
    async def test_invalid_action_rejected(
        self, admin_headers: dict, mock_redis: AsyncMock,
    ) -> None:
        """Невалидный action отклонен."""
        with patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.post(
                    "/api/admin/agent/toggle?action=restart", headers=admin_headers,
                )
        assert resp.status_code == 422


class TestGetIncidents:
    """GET /api/admin/agent/incidents."""

    @pytest.mark.asyncio
    async def test_empty_incidents(
        self, admin_headers: dict, mock_redis: AsyncMock,
    ) -> None:
        """Пустой список инцидентов."""
        with patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.get("/api/admin/agent/incidents", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_incidents_with_data(
        self, admin_headers: dict, mock_redis: AsyncMock,
    ) -> None:
        """Список инцидентов с данными."""
        incidents = [
            json.dumps({"ts": "2026-04-10T12:00:00Z", "status": "fixed", "trace": "Error in main.py:42"}),
            json.dumps({"ts": "2026-04-10T11:30:00Z", "status": "failed", "trace": "Timeout"}),
        ]
        mock_redis.llen = AsyncMock(return_value=2)
        mock_redis.lrange = AsyncMock(return_value=incidents)
        with patch("app.modules.admin.sentinel_router.get_redis", return_value=mock_redis):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            ) as client:
                resp = await client.get("/api/admin/agent/incidents", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["items"][0]["status"] == "fixed"
```

- [ ] **Step 2: Run tests**

Run: `cd backend && python -m pytest tests/test_sentinel_api.py -v`
Expected: All tests PASS

Note: Tests may need adjustment depending on the existing test fixtures for `admin_token`. Check `backend/tests/conftest.py` for available fixtures. If `admin_token` fixture doesn't exist, create it or use the existing pattern for creating admin JWT tokens.

- [ ] **Step 3: Fix any failures**

Common issues:
- Missing `admin_token` fixture: check conftest.py, create admin user + generate JWT
- Redis mock dependency injection: may need to override FastAPI dependency instead of patching import
- Adjust test patterns to match existing conftest fixtures

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_sentinel_api.py
git commit -m "test(sentinel): API tests for agent status, toggle, incidents"
```

---

### Task 7: Full Test Suite Verification

- [ ] **Step 1: Run all tests**

Run: `cd backend && python -m pytest tests/ -v --timeout=120 --ignore=tests/test_backtest.py --ignore=tests/test_bybit_listener.py`
Expected: All existing tests + sentinel tests PASS

- [ ] **Step 2: Import check**

Run: `cd backend && python -c "from app.main import app; routes = [r.path for r in app.routes if hasattr(r, 'path')]; sentinel = [r for r in routes if 'agent' in r]; print('Sentinel routes:', sentinel)"`
Expected: 4 sentinel routes listed

- [ ] **Step 3: Commit if needed**

```bash
git add -A && git status
git commit -m "feat(sentinel): Stage 2 complete - API endpoints and Redis"
```
