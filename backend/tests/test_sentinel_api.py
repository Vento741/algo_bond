"""Тесты API управления AlgoBond Sentinel."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.modules.admin.sentinel_router import _get_service
from app.modules.admin.sentinel_service import SentinelService
from app.modules.auth.models import User
from app.main import app as fastapi_app

pytestmark = pytest.mark.asyncio

AGENT_SECRET = "test-agent-secret-key"


def _make_mock_redis(
    hgetall_return: dict | None = None,
    llen_return: int = 0,
    lrange_return: list | None = None,
) -> AsyncMock:
    """Создать мок Redis с заданными возвращаемыми значениями."""
    mock_redis = AsyncMock()
    mock_redis.hgetall = AsyncMock(return_value=hgetall_return or {})
    mock_redis.hset = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock(return_value=None)
    mock_redis.llen = AsyncMock(return_value=llen_return)
    mock_redis.lrange = AsyncMock(return_value=lrange_return or [])
    return mock_redis


def _service_override(mock_redis: AsyncMock):
    """Создать dependency override для _get_service."""
    def _override():
        return SentinelService(mock_redis)
    return _override


# === GET /api/admin/agent/status ===


async def test_get_status_stopped_when_redis_empty(
    client: AsyncClient,
    admin_headers: dict[str, str],
):
    """Возвращает status=stopped если Redis пустой."""
    mock_redis = _make_mock_redis(hgetall_return={})
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/status", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "stopped"
        assert data["monitors"] == []
        assert data["cron_jobs"] == []
        assert data["incidents_today"] == 0
        assert data["fixes_today"] == 0
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_status_running_with_data(
    client: AsyncClient,
    admin_headers: dict[str, str],
):
    """Возвращает статус running с данными из Redis."""
    mock_redis = _make_mock_redis(hgetall_return={
        "status": "running",
        "started_at": "2026-04-10T10:00:00",
        "monitors": "api,listener",
        "cron_jobs": "health,reconcile",
        "incidents_today": "3",
        "fixes_today": "1",
        "last_health_check": "2026-04-10T11:00:00",
        "last_health_result": "ok",
    })
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/status", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        assert data["monitors"] == ["api", "listener"]
        assert data["cron_jobs"] == ["health", "reconcile"]
        assert data["incidents_today"] == 3
        assert data["fixes_today"] == 1
        assert data["last_health_result"] == "ok"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_status_requires_admin(client: AsyncClient, auth_headers: dict[str, str]):
    """Обычный пользователь получает 403."""
    mock_redis = _make_mock_redis()
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/status", headers=auth_headers)
        assert resp.status_code == 403
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_status_requires_auth(client: AsyncClient):
    """Неавторизованный запрос получает 401."""
    resp = await client.get("/api/admin/agent/status")
    assert resp.status_code == 401


# === PUT /api/admin/agent/status ===


async def test_put_status_valid_token(client: AsyncClient):
    """Агент обновляет статус с валидным X-Agent-Token."""
    mock_redis = _make_mock_redis(hgetall_return={"status": "running"})
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        with patch("app.modules.admin.sentinel_router.settings") as mock_settings:
            mock_settings.agent_secret = AGENT_SECRET
            resp = await client.put(
                "/api/admin/agent/status",
                headers={"x-agent-token": AGENT_SECRET},
                json={"status": "running", "incidents_today": 2},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        mock_redis.hset.assert_awaited_once()
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_put_status_invalid_token(client: AsyncClient):
    """Неверный токен - 403."""
    with patch("app.modules.admin.sentinel_router.settings") as mock_settings:
        mock_settings.agent_secret = AGENT_SECRET
        resp = await client.put(
            "/api/admin/agent/status",
            headers={"x-agent-token": "wrong-token"},
            json={"status": "running"},
        )
    assert resp.status_code == 403
    assert "Invalid agent token" in resp.json()["detail"]


async def test_put_status_empty_secret_returns_503(client: AsyncClient):
    """Если agent_secret не настроен - 503."""
    with patch("app.modules.admin.sentinel_router.settings") as mock_settings:
        mock_settings.agent_secret = ""
        resp = await client.put(
            "/api/admin/agent/status",
            headers={"x-agent-token": "any-token"},
            json={"status": "running"},
        )
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"]


async def test_put_status_missing_token(client: AsyncClient):
    """Отсутствующий заголовок X-Agent-Token - 422."""
    resp = await client.put(
        "/api/admin/agent/status",
        json={"status": "running"},
    )
    assert resp.status_code == 422


# === POST /api/admin/agent/toggle ===


async def test_toggle_start(client: AsyncClient, admin_headers: dict[str, str]):
    """Команда start отправляется в Redis."""
    mock_redis = _make_mock_redis()
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.post(
            "/api/admin/agent/toggle?action=start",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["command"] == "start"
        mock_redis.set.assert_awaited_once()
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_toggle_stop(client: AsyncClient, admin_headers: dict[str, str]):
    """Команда stop отправляется в Redis."""
    mock_redis = _make_mock_redis()
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.post(
            "/api/admin/agent/toggle?action=stop",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["command"] == "stop"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_toggle_invalid_action(client: AsyncClient, admin_headers: dict[str, str]):
    """Неверное действие - 422."""
    resp = await client.post(
        "/api/admin/agent/toggle?action=restart",
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_toggle_requires_admin(client: AsyncClient, auth_headers: dict[str, str]):
    """Обычный пользователь получает 403."""
    resp = await client.post(
        "/api/admin/agent/toggle?action=start",
        headers=auth_headers,
    )
    assert resp.status_code == 403


# === GET /api/admin/agent/incidents ===


async def test_get_incidents_empty(client: AsyncClient, admin_headers: dict[str, str]):
    """Пустой список инцидентов."""
    mock_redis = _make_mock_redis(llen_return=0, lrange_return=[])
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/incidents", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_incidents_with_data(client: AsyncClient, admin_headers: dict[str, str]):
    """Список инцидентов с данными."""
    incidents = [
        json.dumps({"ts": "2026-04-10T10:00:00", "status": "error", "trace": "Traceback..."}),
        json.dumps({"ts": "2026-04-10T11:00:00", "status": "fixed", "fix_commit": "abc123"}),
    ]
    mock_redis = _make_mock_redis(llen_return=2, lrange_return=incidents)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/incidents", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        assert data["items"][0]["status"] == "error"
        assert data["items"][0]["trace"] == "Traceback..."
        assert data["items"][1]["fix_commit"] == "abc123"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_incidents_pagination(client: AsyncClient, admin_headers: dict[str, str]):
    """Пагинация: limit и offset передаются в Redis."""
    mock_redis = _make_mock_redis(llen_return=50, lrange_return=[])
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get(
            "/api/admin/agent/incidents?limit=10&offset=20",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 50
        # lrange вызван с правильными offset/limit
        mock_redis.lrange.assert_awaited_once_with(
            "algobond:agent:incidents", 20, 29
        )
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_incidents_requires_admin(client: AsyncClient, auth_headers: dict[str, str]):
    """Обычный пользователь получает 403."""
    resp = await client.get("/api/admin/agent/incidents", headers=auth_headers)
    assert resp.status_code == 403
