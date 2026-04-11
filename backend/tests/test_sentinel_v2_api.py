"""Тесты новых API endpoints Sentinel v2."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.modules.admin.sentinel_router import _get_service
from app.modules.admin.sentinel_service import SentinelService
from app.main import app as fastapi_app

pytestmark = pytest.mark.asyncio


def _make_mock_redis(
    hgetall_return: dict | None = None,
    llen_return: int = 0,
    lrange_return: list | None = None,
    get_return: str | None = None,
) -> AsyncMock:
    """Создать мок Redis с заданными возвращаемыми значениями."""
    mock_redis = AsyncMock()
    mock_redis.hgetall = AsyncMock(return_value=hgetall_return or {})
    mock_redis.hset = AsyncMock(return_value=None)
    mock_redis.hdel = AsyncMock(return_value=None)
    mock_redis.hexists = AsyncMock(return_value=True)
    mock_redis.set = AsyncMock(return_value=None)
    mock_redis.get = AsyncMock(return_value=get_return)
    mock_redis.llen = AsyncMock(return_value=llen_return)
    mock_redis.lrange = AsyncMock(return_value=lrange_return or [])
    mock_redis.rpush = AsyncMock(return_value=None)
    mock_redis.ltrim = AsyncMock(return_value=None)
    mock_redis.publish = AsyncMock(return_value=None)
    return mock_redis


def _service_override(mock_redis: AsyncMock):
    """Создать dependency override для _get_service."""
    def _override():
        return SentinelService(mock_redis)
    return _override


# === GET /api/admin/agent/chat/history ===


async def test_get_chat_history_empty(client: AsyncClient, admin_headers: dict[str, str]):
    """Пустая история чата."""
    mock_redis = _make_mock_redis(llen_return=0, lrange_return=[])
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/chat/history", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["messages"] == []
        assert data["total"] == 0
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_chat_history_with_messages(client: AsyncClient, admin_headers: dict[str, str]):
    """История чата с сообщениями."""
    messages = [
        json.dumps({
            "id": "msg-1",
            "type": "user_message",
            "content": "Hello",
            "timestamp": "2026-04-11T10:00:00Z",
        }),
        json.dumps({
            "id": "msg-2",
            "type": "agent_message",
            "content": "Hi there",
            "timestamp": "2026-04-11T10:00:01Z",
        }),
    ]
    mock_redis = _make_mock_redis(llen_return=2, lrange_return=messages)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/chat/history", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["messages"]) == 2
        assert data["messages"][0]["type"] == "user_message"
        assert data["messages"][1]["content"] == "Hi there"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_chat_history_requires_admin(client: AsyncClient, auth_headers: dict[str, str]):
    """Обычный пользователь получает 403."""
    resp = await client.get("/api/admin/agent/chat/history", headers=auth_headers)
    assert resp.status_code == 403


# === POST /api/admin/agent/command ===


async def test_execute_command_valid(client: AsyncClient, admin_headers: dict[str, str]):
    """Валидная команда отправляется."""
    mock_redis = _make_mock_redis()
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.post(
            "/api/admin/agent/command",
            headers=admin_headers,
            json={"command": "health_check"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["command"] == "health_check"
        assert data["status"] == "sent"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_execute_command_invalid(client: AsyncClient, admin_headers: dict[str, str]):
    """Невалидная команда - 422."""
    mock_redis = _make_mock_redis()
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.post(
            "/api/admin/agent/command",
            headers=admin_headers,
            json={"command": "rm_rf"},
        )
        assert resp.status_code == 422
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_execute_command_requires_admin(client: AsyncClient, auth_headers: dict[str, str]):
    """Обычный пользователь получает 403."""
    resp = await client.post(
        "/api/admin/agent/command",
        headers=auth_headers,
        json={"command": "restart"},
    )
    assert resp.status_code == 403


# === POST /api/admin/agent/approval ===


async def test_resolve_approval_approve(client: AsyncClient, admin_headers: dict[str, str]):
    """Approve pending action."""
    mock_redis = _make_mock_redis()
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.post(
            "/api/admin/agent/approval",
            headers=admin_headers,
            json={"approval_id": "appr-123", "decision": "approve"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["decision"] == "approve"
        assert data["approval_id"] == "appr-123"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_resolve_approval_not_found(client: AsyncClient, admin_headers: dict[str, str]):
    """Approval not found - 404."""
    mock_redis = _make_mock_redis()
    mock_redis.hexists = AsyncMock(return_value=False)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.post(
            "/api/admin/agent/approval",
            headers=admin_headers,
            json={"approval_id": "nonexistent", "decision": "reject"},
        )
        assert resp.status_code == 404
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_resolve_approval_invalid_decision(client: AsyncClient, admin_headers: dict[str, str]):
    """Invalid decision - 422."""
    resp = await client.post(
        "/api/admin/agent/approval",
        headers=admin_headers,
        json={"approval_id": "appr-123", "decision": "maybe"},
    )
    assert resp.status_code == 422


# === GET /api/admin/agent/config ===


async def test_get_config_default(client: AsyncClient, admin_headers: dict[str, str]):
    """Default config когда Redis пустой."""
    mock_redis = _make_mock_redis(get_return=None)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/config", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "auto"
        assert data["health_interval_minutes"] == 5
        assert data["auto_deploy"] is True
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_config_from_redis(client: AsyncClient, admin_headers: dict[str, str]):
    """Config из Redis."""
    config_json = json.dumps({"mode": "supervised", "health_interval_minutes": 10, "auto_deploy": False, "max_fix_attempts": 5, "reconcile_cron": "50 23 * * *", "deps_audit_cron": "0 3 * * 0"})
    mock_redis = _make_mock_redis(get_return=config_json)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/config", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "supervised"
        assert data["health_interval_minutes"] == 10
        assert data["auto_deploy"] is False
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


# === PUT /api/admin/agent/config ===


async def test_update_config_mode(client: AsyncClient, admin_headers: dict[str, str]):
    """Обновить mode."""
    mock_redis = _make_mock_redis(get_return=None)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.put(
            "/api/admin/agent/config",
            headers=admin_headers,
            json={"mode": "supervised"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "supervised"
        # Проверяем что set вызван для конфига и mode key
        assert mock_redis.set.await_count == 2
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_update_config_invalid_mode(client: AsyncClient, admin_headers: dict[str, str]):
    """Невалидный mode - 422."""
    resp = await client.put(
        "/api/admin/agent/config",
        headers=admin_headers,
        json={"mode": "yolo"},
    )
    assert resp.status_code == 422


# === GET /api/admin/agent/health-history ===


async def test_get_health_history_empty(client: AsyncClient, admin_headers: dict[str, str]):
    """Пустой таймлайн."""
    mock_redis = _make_mock_redis(lrange_return=[])
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/health-history", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_health_history_with_data(client: AsyncClient, admin_headers: dict[str, str]):
    """Таймлайн с данными."""
    entries = [
        json.dumps({"timestamp": "2026-04-11T10:00:00Z", "status": "ok", "response_ms": 42}),
        json.dumps({"timestamp": "2026-04-11T10:05:00Z", "status": "fail", "details": "timeout"}),
    ]
    mock_redis = _make_mock_redis(lrange_return=entries)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/health-history", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["entries"]) == 2
        assert data["entries"][0]["status"] == "ok"
        assert data["entries"][1]["details"] == "timeout"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


# === GET /api/admin/agent/commits ===


async def test_get_commits_empty(client: AsyncClient, admin_headers: dict[str, str]):
    """Пустой список коммитов."""
    mock_redis = _make_mock_redis(llen_return=0, lrange_return=[])
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/commits", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["commits"] == []
        assert data["total"] == 0
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_commits_with_data(client: AsyncClient, admin_headers: dict[str, str]):
    """Коммиты с данными."""
    commits = [
        json.dumps({"sha": "abc1234", "message": "fix(sentinel): autofix error", "timestamp": "2026-04-11T10:00:00Z", "files_changed": 2}),
    ]
    mock_redis = _make_mock_redis(llen_return=1, lrange_return=commits)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/commits", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["commits"][0]["sha"] == "abc1234"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


# === GET /api/admin/agent/tokens ===


async def test_get_tokens_zero(client: AsyncClient, admin_headers: dict[str, str]):
    """Нулевое использование токенов."""
    mock_redis = _make_mock_redis(get_return=None)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/tokens", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["tokens_today"] == 0
        assert data["tokens_limit"] == 1_000_000
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_tokens_with_usage(client: AsyncClient, admin_headers: dict[str, str]):
    """Использование токенов с данными."""
    mock_redis = _make_mock_redis(get_return="125000")
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/tokens", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["tokens_today"] == 125000
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


# === GET /api/admin/agent/approvals ===


async def test_get_approvals_empty(client: AsyncClient, admin_headers: dict[str, str]):
    """Пустой список approvals."""
    mock_redis = _make_mock_redis(hgetall_return={})
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/approvals", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)


async def test_get_approvals_with_data(client: AsyncClient, admin_headers: dict[str, str]):
    """Pending approvals с данными."""
    approvals = {
        "appr-1": json.dumps({
            "approval_id": "appr-1",
            "action": "deploy",
            "description": "Deploy fix commit abc123",
            "created_at": "2026-04-11T10:00:00Z",
            "timeout_at": "2026-04-11T10:10:00Z",
        }),
    }
    mock_redis = _make_mock_redis(hgetall_return=approvals)
    fastapi_app.dependency_overrides[_get_service] = _service_override(mock_redis)
    try:
        resp = await client.get("/api/admin/agent/approvals", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["action"] == "deploy"
    finally:
        fastapi_app.dependency_overrides.pop(_get_service, None)
