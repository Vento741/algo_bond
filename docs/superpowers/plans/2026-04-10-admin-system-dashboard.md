# Admin System Dashboard - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить раздел "Система" в админ-панель AlgoBond для мониторинга здоровья платформы

**Architecture:** Backend: отдельные system_schemas.py, system_service.py, system_router.py в модуле admin. Frontend: единая страница AdminSystem.tsx с summary bar + 6 табов. Polling с разными интервалами (5s/30s/60s).

**Tech Stack:** FastAPI, psutil, redis.asyncio, Celery inspect, httpx, React 18, TypeScript, shadcn/ui, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-10-admin-system-dashboard-design.md`

---

## File Structure

### Create
- `backend/app/modules/admin/system_schemas.py` - все Pydantic v2 схемы для system endpoints
- `backend/app/modules/admin/system_service.py` - сервис: health checks, metrics, redis/db/celery info
- `backend/app/modules/admin/system_router.py` - роутер с 10 endpoints
- `frontend/src/pages/admin/AdminSystem.tsx` - страница системного мониторинга

### Modify
- `backend/requirements.txt` - добавить `psutil`
- `backend/app/main.py` - подключить system_router
- `backend/app/modules/trading/bybit_listener.py` - добавить heartbeat в Redis
- `backend/app/celery_app.py` - добавить beat tick heartbeat
- `frontend/src/App.tsx` - добавить роут /admin/system
- `frontend/src/components/layout/Sidebar.tsx` - добавить "Система" в навигацию

---

### Task 1: Backend schemas (system_schemas.py)

**Files:**
- Create: `backend/app/modules/admin/system_schemas.py`

- [ ] **Step 1: Create system_schemas.py with all Pydantic models**

```python
"""Pydantic v2 схемы для системного мониторинга."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


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
```

- [ ] **Step 2: Verify import works**

Run: `cd backend && python -c "from app.modules.admin.system_schemas import SystemHealthResponse, ServerMetrics, RedisInfo, DatabaseInfo, CeleryInfo, ErrorLogResponse, SystemConfig, PlatformPnL, ReconcileAllResponse; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/admin/system_schemas.py
git commit -m "feat(admin): add system dashboard Pydantic schemas"
```

---

### Task 2: Add psutil + heartbeat infrastructure

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/modules/trading/bybit_listener.py`
- Modify: `backend/app/celery_app.py`

- [ ] **Step 1: Add psutil to requirements.txt**

Add after `pybit==5.14.0`:

```
# Мониторинг
psutil==6.1.1
```

- [ ] **Step 2: Add ws_bridge heartbeat to bybit_listener.py**

In `run_listener()` function, after `await _refresh_cycle(loop)` (line ~1183), add Redis heartbeat write:

```python
            await _refresh_cycle(loop)
            backoff = 1  # Сбросить backoff при успехе

            # Heartbeat для системного мониторинга
            try:
                from app.redis import pool as redis_pool
                await redis_pool.set("ws_bridge:heartbeat", str(time.time()), ex=60)
            except Exception:
                logger.warning("Не удалось записать ws_bridge:heartbeat в Redis")
```

- [ ] **Step 3: Add celery-beat heartbeat to celery_app.py**

Add after `celery.autodiscover_tasks(...)`:

```python
from celery.signals import beat_init

@beat_init.connect
def on_beat_init(sender, **kwargs):
    """Записать heartbeat при старте Beat."""
    import redis as sync_redis
    from app.config import settings
    try:
        r = sync_redis.from_url(settings.redis_url)
        r.set("celery-beat:last_run", str(__import__("time").time()), ex=300)
        r.close()
    except Exception:
        pass
```

Note: beat_init fires once at start. For periodic heartbeats, add a dedicated beat task:

```python
# Добавить в beat_schedule
celery.conf.beat_schedule["beat-heartbeat"] = {
    "task": "system.beat_heartbeat",
    "schedule": 60.0,
}
```

And register the task in celery_app.py:

```python
@celery.task(name="system.beat_heartbeat")
def beat_heartbeat_task():
    """Heartbeat задача для мониторинга Celery Beat."""
    import redis as sync_redis
    from app.config import settings
    try:
        r = sync_redis.from_url(settings.redis_url)
        r.set("celery-beat:last_run", str(__import__("time").time()), ex=300)
        r.close()
    except Exception:
        pass
```

- [ ] **Step 4: Verify imports work**

Run: `cd backend && python -c "from app.celery_app import celery; print('Beat schedule:', list(celery.conf.beat_schedule.keys()))"`
Expected: should include `beat-heartbeat`

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app/modules/trading/bybit_listener.py backend/app/celery_app.py
git commit -m "feat(admin): add psutil dep, ws_bridge + celery-beat heartbeats"
```

---

### Task 3: Backend system_service.py

**Files:**
- Create: `backend/app/modules/admin/system_service.py`

- [ ] **Step 1: Create system_service.py**

```python
"""Сервис системного мониторинга."""

import asyncio
import os
import platform
import subprocess
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import httpx
import psutil
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.config import settings
from app.modules.admin.system_schemas import (
    CeleryInfo,
    CeleryWorkerInfo,
    ContainerStatus,
    DatabaseInfo,
    ErrorLogItem,
    ErrorLogResponse,
    FlushResponse,
    PlatformPnL,
    ReconcileAllResponse,
    RedisInfo,
    ServerMetrics,
    ServiceHealth,
    SystemConfig,
    SystemHealthResponse,
    TableStats,
)
from app.modules.trading.models import Bot, BotLog, BotLogLevel, BotMode, BotStatus

# Время старта для uptime
_start_time = time.time()

# Паттерны кеш-ключей для SCAN+DEL (flush)
CACHE_KEY_PATTERNS = ["cache:*", "market:*", "strategy:*"]

# Маппинг модулей по ключевым словам в сообщении
MODULE_KEYWORDS: dict[str, list[str]] = {
    "trading": ["bybit", "order", "position", "leverage", "balance", "margin"],
    "backtest": ["backtest", "backtest_run"],
    "market": ["kline", "candle", "market", "trading_pair", "sync_trading"],
    "strategy": ["strategy", "signal", "indicator", "knn", "lorentzian"],
    "auth": ["auth", "login", "token", "jwt", "password"],
}


def _detect_module(message: str) -> str:
    """Определить модуль по тексту сообщения."""
    lower = message.lower()
    for module, keywords in MODULE_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return module
    return "other"


class SystemService:
    """Сервис системных метрик и проверок."""

    def __init__(self, db: AsyncSession, redis: Redis) -> None:
        self.db = db
        self.redis = redis

    # === Health Check ===

    async def check_health(self) -> SystemHealthResponse:
        """Комплексная проверка всех сервисов."""
        checks = await asyncio.gather(
            self._check_api(),
            self._check_postgresql(),
            self._check_redis(),
            self._check_celery_worker(),
            self._check_celery_beat(),
            self._check_nginx(),
            self._check_bybit(),
            self._check_ws_bridge(),
            return_exceptions=True,
        )
        services = []
        for result in checks:
            if isinstance(result, Exception):
                services.append(ServiceHealth(
                    name="unknown", status="down",
                    details={"error": str(result)},
                ))
            else:
                services.append(result)
        return SystemHealthResponse(
            services=services,
            uptime_seconds=time.time() - _start_time,
            checked_at=datetime.now(timezone.utc),
        )

    async def _check_api(self) -> ServiceHealth:
        """Self-check API."""
        return ServiceHealth(name="api", status="healthy", latency_ms=0)

    async def _check_postgresql(self) -> ServiceHealth:
        """Проверка PostgreSQL через SELECT 1."""
        start = time.monotonic()
        try:
            await self.db.execute(text("SELECT 1"))
            latency = (time.monotonic() - start) * 1000
            return ServiceHealth(name="postgresql", status="healthy", latency_ms=round(latency, 1))
        except Exception as e:
            return ServiceHealth(name="postgresql", status="down", details={"error": str(e)})

    async def _check_redis(self) -> ServiceHealth:
        """Проверка Redis через PING."""
        start = time.monotonic()
        try:
            await self.redis.ping()
            latency = (time.monotonic() - start) * 1000
            return ServiceHealth(name="redis", status="healthy", latency_ms=round(latency, 1))
        except Exception as e:
            return ServiceHealth(name="redis", status="down", details={"error": str(e)})

    async def _check_celery_worker(self) -> ServiceHealth:
        """Проверка Celery worker через inspect.ping()."""
        try:
            from app.celery_app import celery
            result = await asyncio.to_thread(
                lambda: celery.control.inspect(timeout=2.0).ping()
            )
            if result:
                return ServiceHealth(
                    name="celery_worker", status="healthy",
                    details={"workers": len(result)},
                )
            return ServiceHealth(name="celery_worker", status="down")
        except Exception as e:
            return ServiceHealth(name="celery_worker", status="down", details={"error": str(e)})

    async def _check_celery_beat(self) -> ServiceHealth:
        """Проверка Celery Beat через heartbeat ключ."""
        try:
            last_run = await self.redis.get("celery-beat:last_run")
            if last_run:
                ts = float(last_run)
                age = time.time() - ts
                if age < 120:
                    return ServiceHealth(name="celery_beat", status="healthy", latency_ms=round(age * 1000))
                return ServiceHealth(name="celery_beat", status="degraded", details={"last_run_ago_sec": round(age)})
            return ServiceHealth(name="celery_beat", status="unknown", details={"reason": "no heartbeat key"})
        except Exception as e:
            return ServiceHealth(name="celery_beat", status="down", details={"error": str(e)})

    async def _check_nginx(self) -> ServiceHealth:
        """Проверка Nginx через HTTP GET."""
        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get("http://nginx:80/")
                latency = (time.monotonic() - start) * 1000
                status = "healthy" if resp.status_code < 500 else "degraded"
                return ServiceHealth(name="nginx", status=status, latency_ms=round(latency, 1))
        except Exception:
            return ServiceHealth(name="nginx", status="unknown", details={"reason": "unreachable"})

    async def _check_bybit(self) -> ServiceHealth:
        """Проверка Bybit API через /v5/market/time."""
        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get("https://api.bybit.com/v5/market/time")
                latency = (time.monotonic() - start) * 1000
                if resp.status_code == 200:
                    status = "degraded" if latency > 500 else "healthy"
                    return ServiceHealth(name="bybit_api", status=status, latency_ms=round(latency, 1))
                return ServiceHealth(name="bybit_api", status="degraded", latency_ms=round(latency, 1))
        except Exception as e:
            return ServiceHealth(name="bybit_api", status="down", details={"error": str(e)})

    async def _check_ws_bridge(self) -> ServiceHealth:
        """Проверка WebSocket Bridge через heartbeat ключ."""
        try:
            heartbeat = await self.redis.get("ws_bridge:heartbeat")
            if heartbeat:
                age = time.time() - float(heartbeat)
                if age < 60:
                    return ServiceHealth(name="ws_bridge", status="healthy", latency_ms=round(age * 1000))
                return ServiceHealth(name="ws_bridge", status="degraded", details={"last_heartbeat_ago_sec": round(age)})
            return ServiceHealth(name="ws_bridge", status="down", details={"reason": "no heartbeat"})
        except Exception as e:
            return ServiceHealth(name="ws_bridge", status="down", details={"error": str(e)})

    # === Server Metrics ===

    async def get_metrics(self) -> ServerMetrics:
        """Серверные метрики через psutil."""
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        try:
            load_avg = list(psutil.getloadavg())
        except (AttributeError, OSError):
            load_avg = []
        return ServerMetrics(
            cpu_percent=psutil.cpu_percent(interval=0.1),
            memory_used_gb=round(mem.used / (1024 ** 3), 2),
            memory_total_gb=round(mem.total / (1024 ** 3), 2),
            memory_percent=mem.percent,
            disk_used_gb=round(disk.used / (1024 ** 3), 2),
            disk_total_gb=round(disk.total / (1024 ** 3), 2),
            disk_percent=round(disk.percent, 1),
            load_average=load_avg,
        )

    # === Redis Info ===

    async def get_redis_info(self) -> RedisInfo:
        """Метрики Redis через INFO."""
        info = await self.redis.info()
        # Подсчёт ключей по DB
        keys_by_db: dict[str, int] = {}
        total_keys = 0
        for key, value in info.items():
            if key.startswith("db") and isinstance(value, dict):
                count = value.get("keys", 0)
                keys_by_db[key] = count
                total_keys += count
        hits = info.get("keyspace_hits", 0)
        misses = info.get("keyspace_misses", 0)
        hit_rate = (hits / (hits + misses) * 100) if (hits + misses) > 0 else 0
        max_mem = info.get("maxmemory", 0)
        return RedisInfo(
            used_memory_mb=round(info.get("used_memory", 0) / (1024 * 1024), 2),
            peak_memory_mb=round(info.get("used_memory_peak", 0) / (1024 * 1024), 2),
            max_memory_mb=round(max_mem / (1024 * 1024), 2) if max_mem else None,
            total_keys=total_keys,
            keys_by_db=keys_by_db,
            hit_rate_percent=round(hit_rate, 1),
            hits=hits,
            misses=misses,
            connected_clients=info.get("connected_clients", 0),
            ops_per_sec=info.get("instantaneous_ops_per_sec", 0),
        )

    # === Redis Flush ===

    async def flush_cache(self) -> FlushResponse:
        """Очистка кеш-ключей по паттернам (не flushdb)."""
        total_deleted = 0
        for pattern in CACHE_KEY_PATTERNS:
            cursor = 0
            while True:
                cursor, keys = await self.redis.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    await self.redis.delete(*keys)
                    total_deleted += len(keys)
                if cursor == 0:
                    break
        return FlushResponse(
            flushed_keys=total_deleted,
            message=f"Удалено {total_deleted} кеш-ключей",
        )

    # === PostgreSQL Info ===

    async def get_db_info(self) -> DatabaseInfo:
        """Метрики PostgreSQL через системные каталоги."""
        # Активные соединения
        result = await self.db.execute(
            text("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")
        )
        active_connections = result.scalar() or 0

        # Max connections
        result = await self.db.execute(text("SHOW max_connections"))
        max_connections = int(result.scalar() or 100)

        # Размер БД
        result = await self.db.execute(text("SELECT pg_database_size(current_database())"))
        db_size_bytes = result.scalar() or 0

        # Статистика таблиц
        result = await self.db.execute(text(
            "SELECT relname, n_live_tup, pg_total_relation_size(relid) "
            "FROM pg_stat_user_tables "
            "ORDER BY pg_total_relation_size(relid) DESC"
        ))
        tables = [
            TableStats(
                name=row[0],
                row_count=row[1],
                size_mb=round(row[2] / (1024 * 1024), 2),
            )
            for row in result.fetchall()
        ]

        return DatabaseInfo(
            active_connections=active_connections,
            max_connections=max_connections,
            database_size_mb=round(db_size_bytes / (1024 * 1024), 2),
            tables=tables,
        )

    # === Celery Info ===

    async def get_celery_info(self) -> CeleryInfo:
        """Метрики Celery через inspect и Redis."""
        from app.celery_app import celery

        workers: list[CeleryWorkerInfo] = []
        total_active = 0

        try:
            inspect = celery.control.inspect(timeout=2.0)
            ping_result = await asyncio.to_thread(lambda: inspect.ping())
            active_result = await asyncio.to_thread(lambda: inspect.active())
            stats_result = await asyncio.to_thread(lambda: inspect.stats())

            if ping_result:
                for worker_name in ping_result:
                    active_tasks = len((active_result or {}).get(worker_name, []))
                    total_active += active_tasks
                    processed = 0
                    if stats_result and worker_name in stats_result:
                        total = stats_result[worker_name].get("total", {})
                        processed = sum(total.values()) if isinstance(total, dict) else 0
                    workers.append(CeleryWorkerInfo(
                        name=worker_name,
                        status="online",
                        active_tasks=active_tasks,
                        processed=processed,
                    ))
        except Exception:
            pass

        # Длина очереди из Redis (Celery broker DB 1)
        queue_length = 0
        try:
            from redis import Redis as SyncRedis
            broker = SyncRedis.from_url(settings.celery_broker_url)
            queue_length = broker.llen("celery") or 0
            broker.close()
        except Exception:
            pass

        # Beat last run
        beat_last_run = None
        try:
            ts_str = await self.redis.get("celery-beat:last_run")
            if ts_str:
                beat_last_run = datetime.fromtimestamp(float(ts_str), tz=timezone.utc)
        except Exception:
            pass

        # Активные боты
        result = await self.db.execute(
            select(func.count()).where(Bot.status == BotStatus.RUNNING)
        )
        active_bots = result.scalar() or 0

        return CeleryInfo(
            workers=workers,
            queue_length=queue_length,
            active_tasks=total_active,
            beat_last_run=beat_last_run,
            active_bots_count=active_bots,
        )

    # === Error Log ===

    async def get_errors(
        self,
        module: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> ErrorLogResponse:
        """Последние ошибки из BotLog."""
        from app.modules.auth.models import User

        # Базовый запрос
        query = (
            select(BotLog, Bot.user_id)
            .join(Bot, BotLog.bot_id == Bot.id, isouter=True)
            .where(BotLog.level == BotLogLevel.ERROR)
            .order_by(BotLog.created_at.desc())
        )

        # Получаем все (для фильтра по module)
        count_query = (
            select(func.count(BotLog.id))
            .where(BotLog.level == BotLogLevel.ERROR)
        )

        result_count = await self.db.execute(count_query)
        total = result_count.scalar() or 0

        result = await self.db.execute(query.offset(offset).limit(limit))
        rows = result.all()

        # Получить email пользователей
        user_ids = {row[1] for row in rows if row[1]}
        user_emails: dict[uuid.UUID, str] = {}
        if user_ids:
            users_result = await self.db.execute(
                select(User.id, User.email).where(User.id.in_(user_ids))
            )
            user_emails = {uid: email for uid, email in users_result.all()}

        items = []
        for log, user_id in rows:
            detected_module = _detect_module(log.message)
            if module and detected_module != module:
                continue
            traceback_str = None
            if log.details and isinstance(log.details, dict):
                traceback_str = log.details.get("traceback")
            items.append(ErrorLogItem(
                id=log.id,
                timestamp=log.created_at,
                module=detected_module,
                message=log.message,
                traceback=traceback_str,
                bot_id=log.bot_id,
                user_email=user_emails.get(user_id) if user_id else None,
            ))

        return ErrorLogResponse(items=items, total=total)

    # === System Config ===

    async def get_config(self) -> SystemConfig:
        """Конфигурация системы (секреты маскируются)."""
        SECRET_MARKERS = {"KEY", "SECRET", "PASSWORD", "TOKEN"}

        env_vars: dict[str, str] = {}
        for key, value in os.environ.items():
            if any(marker in key.upper() for marker in SECRET_MARKERS):
                env_vars[key] = "••••••••••"
            else:
                env_vars[key] = value

        # Git commit
        git_commit = "unknown"
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                git_commit = result.stdout.strip()
        except Exception:
            pass

        # Docker containers (docker ps)
        containers: list[ContainerStatus] | None = None
        try:
            result = subprocess.run(
                ["docker", "ps", "--format", "{{.Names}}\t{{.Status}}"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                containers = []
                for line in result.stdout.strip().split("\n"):
                    parts = line.split("\t", 1)
                    if len(parts) == 2:
                        name, status_str = parts
                        status = "running" if "Up" in status_str else "stopped"
                        containers.append(ContainerStatus(
                            name=name, status=status, uptime=status_str,
                        ))
        except Exception:
            pass

        import sys
        return SystemConfig(
            env_vars=env_vars,
            app_version="0.9.0",
            python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            git_commit=git_commit,
            docker_containers=containers,
        )

    # === Platform P&L ===

    async def get_platform_pnl(self, exclude_demo: bool = False) -> PlatformPnL:
        """Суммарный P&L по всем ботам."""
        # Live P&L
        result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_pnl), 0),
                func.count(Bot.id),
            ).where(Bot.mode == BotMode.LIVE)
        )
        live_row = result.one()
        live_pnl = Decimal(str(live_row[0]))
        live_count = live_row[1]

        # Demo P&L
        result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_pnl), 0),
                func.count(Bot.id),
            ).where(Bot.mode == BotMode.DEMO)
        )
        demo_row = result.one()
        demo_pnl = Decimal(str(demo_row[0]))
        demo_count = demo_row[1]

        # Active bots
        result = await self.db.execute(
            select(func.count()).where(Bot.status == BotStatus.RUNNING)
        )
        active_bots = result.scalar() or 0

        total_pnl = live_pnl if exclude_demo else live_pnl + demo_pnl
        total_bots = live_count if exclude_demo else live_count + demo_count

        return PlatformPnL(
            total_pnl=total_pnl,
            total_bots=total_bots,
            active_bots=active_bots,
            demo_bots_excluded=demo_count if exclude_demo else 0,
            live_pnl=live_pnl,
            demo_pnl=demo_pnl,
        )

    # === Reconcile All ===

    async def reconcile_all(self) -> ReconcileAllResponse:
        """Сверка P&L всех live ботов."""
        from app.modules.trading.service import TradingService

        # Получить всех live ботов
        result = await self.db.execute(
            select(Bot)
            .where(Bot.mode == BotMode.LIVE)
            .options()
        )
        bots = list(result.scalars().all())

        trading_service = TradingService(self.db)
        results_list: list[dict] = []
        total_corrections = 0

        for bot in bots:
            try:
                # Вызываем reconcile с user_id бота (не admin)
                result = await trading_service.reconcile_bot_pnl(bot.id, bot.user_id)
                corrections = len(result.get("corrections", []))
                total_corrections += corrections
                results_list.append({
                    "bot_id": str(bot.id),
                    "status": "ok",
                    "corrections": corrections,
                })
            except Exception as e:
                results_list.append({
                    "bot_id": str(bot.id),
                    "status": "error",
                    "error": str(e),
                })

        return ReconcileAllResponse(
            bots_checked=len(bots),
            corrections=total_corrections,
            results=results_list,
        )
```

- [ ] **Step 2: Verify import works**

Run: `cd backend && python -c "from app.modules.admin.system_service import SystemService; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/admin/system_service.py
git commit -m "feat(admin): add system monitoring service"
```

---

### Task 4: Backend system_router.py + wire up

**Files:**
- Create: `backend/app/modules/admin/system_router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create system_router.py**

```python
"""API-эндпоинты системного мониторинга (admin)."""

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.admin.system_schemas import (
    CeleryInfo,
    DatabaseInfo,
    ErrorLogResponse,
    FlushResponse,
    PlatformPnL,
    ReconcileAllResponse,
    RedisInfo,
    ServerMetrics,
    SystemConfig,
    SystemHealthResponse,
)
from app.modules.admin.system_service import SystemService
from app.modules.auth.dependencies import get_admin_user
from app.modules.auth.models import User
from app.redis import get_redis

router = APIRouter(prefix="/api/admin/system", tags=["admin-system"])


def _get_service(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> SystemService:
    return SystemService(db, redis)


@router.get("/health", response_model=SystemHealthResponse)
async def system_health(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> SystemHealthResponse:
    """Комплексная проверка здоровья всех сервисов."""
    return await service.check_health()


@router.get("/metrics", response_model=ServerMetrics)
async def server_metrics(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> ServerMetrics:
    """Серверные метрики (CPU, RAM, Disk)."""
    return await service.get_metrics()


@router.get("/redis", response_model=RedisInfo)
async def redis_info(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> RedisInfo:
    """Метрики Redis."""
    return await service.get_redis_info()


@router.post("/redis/flush", response_model=FlushResponse)
async def redis_flush(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> FlushResponse:
    """Очистка кеш-ключей Redis (без Celery данных)."""
    return await service.flush_cache()


@router.get("/db", response_model=DatabaseInfo)
async def database_info(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> DatabaseInfo:
    """Метрики PostgreSQL."""
    return await service.get_db_info()


@router.get("/celery", response_model=CeleryInfo)
async def celery_info(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> CeleryInfo:
    """Метрики Celery workers и задач."""
    return await service.get_celery_info()


@router.get("/errors", response_model=ErrorLogResponse)
async def error_logs(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
    module: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> ErrorLogResponse:
    """Последние ошибки из логов."""
    return await service.get_errors(module=module, limit=limit, offset=offset)


@router.get("/config", response_model=SystemConfig)
async def system_config(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> SystemConfig:
    """Конфигурация системы (секреты маскируются)."""
    return await service.get_config()


@router.get("/platform-pnl", response_model=PlatformPnL)
async def platform_pnl(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
    exclude_demo: bool = Query(False),
) -> PlatformPnL:
    """Суммарный P&L платформы по всем ботам."""
    return await service.get_platform_pnl(exclude_demo=exclude_demo)


@router.post("/reconcile-all", response_model=ReconcileAllResponse)
async def reconcile_all_bots(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> ReconcileAllResponse:
    """Сверка P&L всех live ботов с Bybit."""
    return await service.reconcile_all()
```

- [ ] **Step 2: Wire router in main.py**

In `backend/app/main.py`, add import after line 20 (`from app.modules.admin.router import router as admin_router`):

```python
from app.modules.admin.system_router import router as system_router
```

Add after line 83 (`app.include_router(admin_router)`):

```python
app.include_router(system_router)
```

- [ ] **Step 3: Verify app starts**

Run: `cd backend && python -c "from app.main import app; print('Routes:', len(app.routes))"`
Expected: prints route count without errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/admin/system_router.py backend/app/main.py
git commit -m "feat(admin): add system monitoring API endpoints"
```

---

### Task 5: Frontend - install alert-dialog + add route and sidebar

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Install alert-dialog shadcn component**

Run: `cd frontend && npx shadcn@latest add alert-dialog -y`

- [ ] **Step 2: Add import and route in App.tsx**

Add import after line 33 (`import { AdminAnalytics } from '@/pages/admin/AdminAnalytics';`):

```typescript
import { AdminSystem } from '@/pages/admin/AdminSystem';
```

Add route after line 86 (`<Route path="/admin/logs" element={<AdminLogs />} />`):

```typescript
              <Route path="/admin/system" element={<AdminSystem />} />
```

- [ ] **Step 3: Add "Система" to sidebar navigation**

In `frontend/src/components/layout/Sidebar.tsx`, add `Monitor` to lucide-react imports (line 1-18):

```typescript
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
  BarChart3,
  Monitor,
} from 'lucide-react';
```

Add to `adminNavigation` array after the "Логи" entry (line 38):

```typescript
  { name: 'Система', href: '/admin/system', icon: Monitor },
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/ui/alert-dialog.tsx
git commit -m "feat(admin): add system route and sidebar nav"
```

---

### Task 6: Frontend - AdminSystem.tsx page

**Files:**
- Create: `frontend/src/pages/admin/AdminSystem.tsx`

- [ ] **Step 1: Create the full AdminSystem page**

This is a large file. Create `frontend/src/pages/admin/AdminSystem.tsx` with the complete implementation.

The file should contain:
1. **Type definitions** matching backend schemas (SystemHealthResponse, ServerMetrics, RedisInfo, DatabaseInfo, CeleryInfo, ErrorLogItem, SystemConfig, PlatformPnL)
2. **Helper components**: MetricCard, ServicePill, ProgressBar
3. **Main AdminSystem component** with:
   - useState for all data blocks + loading states + activeTab + errorModule + excludeDemo
   - Fetch functions for each endpoint (`fetchHealth`, `fetchMetrics`, `fetchRedis`, etc.)
   - `fetchAll()` for forced refresh button
   - useEffect polling: 5s (health+metrics), 60s (redis+db+celery), 30s (errors when tab active)
   - Config fetched only on tab switch
   - Summary bar with service pills + check button + uptime
   - Alert bar for critical thresholds (CPU>90%, RAM>80%, Disk>90%, service down, Bybit>500ms)
   - 6 tabs with shadcn Tabs component
   - Each tab content with MetricCards in responsive grid
   - Error tab with module filter, expandable traceback, copy button
   - Config tab with masked env vars, versions, git hash
   - P&L card with exclude_demo toggle
   - Reconcile All + Flush Cache buttons with AlertDialog confirmation
   - Skeleton loading for all cards
4. **Styling**: inline Tailwind classes matching AlgoBond palette (#0d0d1a, #1a1a2e, #00E676, #FF1744, #FFD700)
5. **Responsive**: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4

Key imports:
```typescript
import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Monitor, Database, HardDrive, Cpu, Activity,
  AlertTriangle, RefreshCw, Trash2, Copy, Server,
  Wifi, Clock, CheckCircle, XCircle, AlertCircle,
} from 'lucide-react';
import api from '@/lib/api';
```

Full implementation code is extensive (~800-1000 lines). The implementing agent should build it section by section following the spec and mockup, using the patterns from existing admin pages (useState, api.get, loading states, error handling).

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminSystem.tsx
git commit -m "feat(admin): add system monitoring dashboard page"
```

---

### Task 7: Deploy and verify on VPS

**Files:** none (deployment)

- [ ] **Step 1: Push to git**

```bash
git push origin main
```

- [ ] **Step 2: Deploy to VPS**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api celery-worker celery-beat bybit-listener frontend"
```

Note: rebuild api (psutil), celery-worker, celery-beat (heartbeat task), bybit-listener (ws heartbeat), frontend (new page)

- [ ] **Step 3: Health check**

```bash
ssh jeremy-vps "curl -sf http://localhost:8100/health"
```

- [ ] **Step 4: Test system endpoints**

```bash
ssh jeremy-vps "curl -sf -H 'Authorization: Bearer <admin_token>' http://localhost:8100/api/admin/system/health | python3 -m json.tool"
ssh jeremy-vps "curl -sf -H 'Authorization: Bearer <admin_token>' http://localhost:8100/api/admin/system/metrics | python3 -m json.tool"
```

- [ ] **Step 5: Verify frontend page**

Open https://algo.dev-james.bond/admin/system in browser, login as admin, verify:
- Summary bar shows service statuses
- All 6 tabs render with data
- Auto-refresh works (watch CPU/RAM changing)
- Error log loads
- Config shows masked secrets

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix(admin): system dashboard deploy fixes"
git push origin main
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api frontend"
```
