"""Pydantic v2 схемы для AlgoBond Sentinel."""

from datetime import datetime
from uuid import UUID

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


# === Chat ===


class ChatMessage(BaseModel):
    """Сообщение чата с Sentinel."""

    id: str
    type: str = Field(description="user_message | agent_message | agent_log | approval_request | approval_response")
    content: str
    timestamp: datetime
    metadata: dict | None = None


class ChatHistoryResponse(BaseModel):
    """Ответ с историей чата."""

    messages: list[ChatMessage]
    total: int


class ChatSendRequest(BaseModel):
    """Запрос отправки сообщения в чат."""

    content: str = Field(max_length=4000)


# === Approval ===


class ApprovalRequest(BaseModel):
    """Запрос на одобрение действия."""

    approval_id: str
    action: str
    description: str
    created_at: datetime
    timeout_at: datetime


class ApprovalAction(BaseModel):
    """Действие пользователя по approval."""

    approval_id: str
    decision: str = Field(pattern="^(approve|reject)$")


class PendingApprovalsResponse(BaseModel):
    """Список pending approvals."""

    items: list[ApprovalRequest]
    total: int


# === Commands ===


class AgentCommandRequest(BaseModel):
    """Запрос выполнения команды."""

    command: str = Field(
        description="restart | health_check | reconcile | deploy | reset_circuit"
    )
    params: dict | None = None


class AgentCommandResponse(BaseModel):
    """Ответ на выполнение команды."""

    command: str
    status: str
    message: str


# === Config ===


class AgentConfig(BaseModel):
    """Конфигурация Sentinel."""

    mode: str = Field(default="auto", description="auto | supervised")
    health_interval_minutes: int = Field(default=5, ge=1, le=60)
    reconcile_cron: str = Field(default="50 23 * * *")
    deps_audit_cron: str = Field(default="0 3 * * 0")
    auto_deploy: bool = True
    max_fix_attempts: int = Field(default=3, ge=1, le=10)


class AgentConfigUpdate(BaseModel):
    """Обновление конфигурации."""

    mode: str | None = Field(None, pattern="^(auto|supervised)$")
    health_interval_minutes: int | None = Field(None, ge=1, le=60)
    reconcile_cron: str | None = None
    deps_audit_cron: str | None = None
    auto_deploy: bool | None = None
    max_fix_attempts: int | None = Field(None, ge=1, le=10)


# === Health History ===


class HealthHistoryEntry(BaseModel):
    """Запись health check в таймлайне."""

    timestamp: datetime
    status: str = Field(description="ok | fail | timeout")
    response_ms: int | None = None
    details: str | None = None


class HealthHistoryResponse(BaseModel):
    """24ч таймлайн health checks."""

    entries: list[HealthHistoryEntry]


# === Commits ===


class CommitEntry(BaseModel):
    """Git коммит Sentinel."""

    sha: str
    message: str
    timestamp: datetime
    files_changed: int | None = None


class CommitsResponse(BaseModel):
    """Список коммитов."""

    commits: list[CommitEntry]
    total: int


# === Tokens ===


class TokenUsageResponse(BaseModel):
    """Использование токенов за сегодня."""

    tokens_today: int
    tokens_limit: int = 1_000_000
    last_updated: datetime | None = None
