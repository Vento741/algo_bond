"""Pydantic v2 схемы для системного мониторинга."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# === Version Update ===


class VersionUpdate(BaseModel):
    """Обновление версии."""
    version: str = Field(min_length=1, max_length=20, pattern=r"^\d+\.\d+\.\d+.*$")


class VersionResponse(BaseModel):
    """Ответ обновления версии."""
    version: str


# === Health Check ===


class ServiceHealth(BaseModel):
    """Статус одного сервиса."""

    name: str
    status: str  # "healthy", "degraded", "down", "unknown"
    latency_ms: float | None = None
    details: dict | None = None


class SystemHealthResponse(BaseModel):
    """Ответ комплексной проверки здоровья."""

    services: list[ServiceHealth]
    uptime_seconds: float
    checked_at: datetime


# === Server Metrics ===


class ServerMetrics(BaseModel):
    """Серверные метрики (CPU, RAM, Disk)."""

    cpu_percent: float
    memory_used_gb: float
    memory_total_gb: float
    memory_percent: float
    disk_used_gb: float
    disk_total_gb: float
    disk_percent: float
    load_average: list[float]


# === Redis ===


class RedisInfo(BaseModel):
    """Метрики Redis."""

    used_memory_mb: float
    peak_memory_mb: float
    max_memory_mb: float | None = None
    total_keys: int
    keys_by_db: dict[str, int]
    hit_rate_percent: float
    hits: int
    misses: int
    connected_clients: int
    ops_per_sec: int


class FlushResponse(BaseModel):
    """Ответ очистки кеша Redis."""

    flushed_keys: int
    message: str


# === PostgreSQL ===


class TableStats(BaseModel):
    """Статистика таблицы."""

    name: str
    row_count: int
    size_mb: float


class DatabaseInfo(BaseModel):
    """Метрики PostgreSQL."""

    active_connections: int
    max_connections: int
    database_size_mb: float
    tables: list[TableStats]


# === Celery ===


class CeleryWorkerInfo(BaseModel):
    """Статус Celery worker."""

    name: str
    status: str
    active_tasks: int
    processed: int


class CeleryInfo(BaseModel):
    """Метрики Celery."""

    workers: list[CeleryWorkerInfo]
    queue_length: int
    active_tasks: int
    beat_last_run: datetime | None = None
    active_bots_count: int


# === Error Log ===


class ErrorLogItem(BaseModel):
    """Ошибка из лога."""

    id: uuid.UUID
    timestamp: datetime
    module: str
    message: str
    traceback: str | None = None
    bot_id: uuid.UUID | None = None
    user_email: str | None = None


class ErrorLogResponse(BaseModel):
    """Ответ со списком ошибок."""

    items: list[ErrorLogItem]
    total: int


# === Config ===


class ContainerStatus(BaseModel):
    """Статус Docker контейнера."""

    name: str
    status: str
    uptime: str | None = None


class SystemConfig(BaseModel):
    """Конфигурация системы."""

    env_vars: dict[str, str]
    app_version: str
    python_version: str
    git_commit: str
    docker_containers: list[ContainerStatus] | None = None


# === Platform P&L ===


class PlatformPnL(BaseModel):
    """Суммарный P&L платформы."""

    total_pnl: Decimal
    total_bots: int
    active_bots: int
    demo_bots_excluded: int
    live_pnl: Decimal
    demo_pnl: Decimal


# === Reconcile All ===


class ReconcileAllResponse(BaseModel):
    """Ответ массовой сверки P&L."""

    bots_checked: int
    corrections: int
    results: list[dict]
