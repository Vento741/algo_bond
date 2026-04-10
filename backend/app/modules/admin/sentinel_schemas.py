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
