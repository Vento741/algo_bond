"""Сервис системного мониторинга платформы."""

import asyncio
import logging
import os
import platform
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import httpx
import psutil
from redis.asyncio import Redis
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

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

logger = logging.getLogger(__name__)

_start_time = time.time()


def _detect_module(message: str) -> str:
    """Определить модуль по тексту сообщения об ошибке."""
    msg = message.lower()
    if any(kw in msg for kw in ("bybit", "order", "position", "leverage")):
        return "trading"
    if "backtest" in msg:
        return "backtest"
    if any(kw in msg for kw in ("kline", "market", "candle", "pair")):
        return "market"
    if any(kw in msg for kw in ("strategy", "signal", "knn", "indicator")):
        return "strategy"
    if any(kw in msg for kw in ("auth", "login", "token", "password", "jwt")):
        return "auth"
    return "other"


def _mask_value(key: str, value: str) -> str:
    """Маскировать секретные значения в переменных окружения."""
    sensitive = ("key", "secret", "password", "token")
    if any(s in key.lower() for s in sensitive):
        if len(value) > 4:
            return value[:2] + "*" * (len(value) - 4) + value[-2:]
        return "****"
    return value


class SystemService:
    """Сервис системного мониторинга."""

    def __init__(self, db: AsyncSession, redis: Redis) -> None:
        self.db = db
        self.redis = redis

    # === Health Check ===

    async def check_health(self) -> SystemHealthResponse:
        """Комплексная проверка здоровья всех сервисов."""
        checks = await asyncio.gather(
            self._check_api(),
            self._check_postgresql(),
            self._check_redis(),
            self._check_celery_worker(),
            self._check_celery_beat(),
            self._check_nginx(),
            self._check_bybit_api(),
            self._check_ws_bridge(),
            return_exceptions=True,
        )

        services: list[ServiceHealth] = []
        for result in checks:
            if isinstance(result, Exception):
                services.append(ServiceHealth(
                    name="unknown",
                    status="down",
                    details={"error": str(result)},
                ))
            else:
                services.append(result)

        uptime = time.time() - _start_time
        return SystemHealthResponse(
            services=services,
            uptime_seconds=round(uptime, 1),
            checked_at=datetime.now(timezone.utc),
        )

    async def _check_api(self) -> ServiceHealth:
        """Проверка API сервиса."""
        start = time.time()
        latency = (time.time() - start) * 1000
        return ServiceHealth(
            name="api",
            status="healthy",
            latency_ms=round(latency, 2),
            details={"version": "0.9.0"},
        )

    async def _check_postgresql(self) -> ServiceHealth:
        """Проверка подключения к PostgreSQL."""
        start = time.time()
        try:
            result = await self.db.execute(text("SELECT 1"))
            result.scalar()
            latency = (time.time() - start) * 1000
            return ServiceHealth(
                name="postgresql",
                status="healthy",
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            return ServiceHealth(
                name="postgresql",
                status="down",
                details={"error": str(e)},
            )

    async def _check_redis(self) -> ServiceHealth:
        """Проверка подключения к Redis."""
        start = time.time()
        try:
            await self.redis.ping()
            latency = (time.time() - start) * 1000
            return ServiceHealth(
                name="redis",
                status="healthy",
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            return ServiceHealth(
                name="redis",
                status="down",
                details={"error": str(e)},
            )

    async def _check_celery_worker(self) -> ServiceHealth:
        """Проверка Celery worker через inspect.ping()."""
        try:
            from app.celery_app import celery
            result = await asyncio.to_thread(
                celery.control.inspect(timeout=2.0).ping,
            )
            if result:
                workers = list(result.keys())
                return ServiceHealth(
                    name="celery_worker",
                    status="healthy",
                    details={"workers": workers},
                )
            return ServiceHealth(
                name="celery_worker",
                status="down",
                details={"error": "Нет ответа от workers"},
            )
        except Exception as e:
            return ServiceHealth(
                name="celery_worker",
                status="down",
                details={"error": str(e)},
            )

    async def _check_celery_beat(self) -> ServiceHealth:
        """Проверка Celery Beat по heartbeat в Redis."""
        try:
            last_run = await self.redis.get("celery-beat:last_run")
            if last_run:
                age = time.time() - float(last_run)
                if age < 120:
                    return ServiceHealth(
                        name="celery_beat",
                        status="healthy",
                        details={"last_run_age_sec": round(age, 1)},
                    )
                return ServiceHealth(
                    name="celery_beat",
                    status="degraded",
                    details={"last_run_age_sec": round(age, 1)},
                )
            return ServiceHealth(
                name="celery_beat",
                status="unknown",
                details={"error": "Нет heartbeat в Redis"},
            )
        except Exception as e:
            return ServiceHealth(
                name="celery_beat",
                status="unknown",
                details={"error": str(e)},
            )

    async def _check_nginx(self) -> ServiceHealth:
        """Проверка Nginx."""
        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get("http://nginx:80/")
                latency = (time.time() - start) * 1000
                status = "healthy" if resp.status_code < 500 else "degraded"
                return ServiceHealth(
                    name="nginx",
                    status=status,
                    latency_ms=round(latency, 2),
                    details={"status_code": resp.status_code},
                )
        except Exception:
            return ServiceHealth(
                name="nginx",
                status="unknown",
                details={"error": "Не удалось подключиться к nginx"},
            )

    async def _check_bybit_api(self) -> ServiceHealth:
        """Проверка доступности Bybit API."""
        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get("https://api.bybit.com/v5/market/time")
                latency = (time.time() - start) * 1000
                if resp.status_code == 200:
                    return ServiceHealth(
                        name="bybit_api",
                        status="healthy",
                        latency_ms=round(latency, 2),
                    )
                return ServiceHealth(
                    name="bybit_api",
                    status="degraded",
                    latency_ms=round(latency, 2),
                    details={"status_code": resp.status_code},
                )
        except Exception as e:
            return ServiceHealth(
                name="bybit_api",
                status="down",
                details={"error": str(e)},
            )

    async def _check_ws_bridge(self) -> ServiceHealth:
        """Проверка WebSocket bridge по heartbeat в Redis."""
        try:
            heartbeat = await self.redis.get("ws_bridge:heartbeat")
            if heartbeat:
                age = time.time() - float(heartbeat)
                if age < 120:
                    return ServiceHealth(
                        name="ws_bridge",
                        status="healthy",
                        details={"last_heartbeat_age_sec": round(age, 1)},
                    )
                return ServiceHealth(
                    name="ws_bridge",
                    status="degraded",
                    details={"last_heartbeat_age_sec": round(age, 1)},
                )
            return ServiceHealth(
                name="ws_bridge",
                status="unknown",
                details={"error": "Нет heartbeat в Redis"},
            )
        except Exception as e:
            return ServiceHealth(
                name="ws_bridge",
                status="unknown",
                details={"error": str(e)},
            )

    # === Server Metrics ===

    async def get_metrics(self) -> ServerMetrics:
        """Серверные метрики (CPU, RAM, Disk)."""
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")

        try:
            load_avg = list(os.getloadavg())
        except (AttributeError, OSError):
            # Windows не поддерживает getloadavg
            load_avg = [cpu, cpu, cpu]

        return ServerMetrics(
            cpu_percent=cpu,
            memory_used_gb=round(mem.used / (1024 ** 3), 2),
            memory_total_gb=round(mem.total / (1024 ** 3), 2),
            memory_percent=mem.percent,
            disk_used_gb=round(disk.used / (1024 ** 3), 2),
            disk_total_gb=round(disk.total / (1024 ** 3), 2),
            disk_percent=disk.percent,
            load_average=[round(la, 2) for la in load_avg],
        )

    # === Redis Info ===

    async def get_redis_info(self) -> RedisInfo:
        """Метрики Redis."""
        info = await self.redis.info()

        used_memory = info.get("used_memory", 0) / (1024 * 1024)
        peak_memory = info.get("used_memory_peak", 0) / (1024 * 1024)
        max_memory = info.get("maxmemory", 0)
        max_memory_mb = max_memory / (1024 * 1024) if max_memory else None

        hits = info.get("keyspace_hits", 0)
        misses = info.get("keyspace_misses", 0)
        total = hits + misses
        hit_rate = (hits / total * 100) if total > 0 else 0.0

        # Ключи по базам данных
        keys_by_db: dict[str, int] = {}
        total_keys = 0
        for key, val in info.items():
            if key.startswith("db") and isinstance(val, dict):
                db_keys = val.get("keys", 0)
                keys_by_db[key] = db_keys
                total_keys += db_keys

        return RedisInfo(
            used_memory_mb=round(used_memory, 2),
            peak_memory_mb=round(peak_memory, 2),
            max_memory_mb=round(max_memory_mb, 2) if max_memory_mb else None,
            total_keys=total_keys,
            keys_by_db=keys_by_db,
            hit_rate_percent=round(hit_rate, 2),
            hits=hits,
            misses=misses,
            connected_clients=info.get("connected_clients", 0),
            ops_per_sec=info.get("instantaneous_ops_per_sec", 0),
        )

    # === Flush Cache ===

    async def flush_cache(self) -> FlushResponse:
        """Очистка кеша Redis по паттернам (НЕ flushdb)."""
        patterns = ["cache:*", "market:*", "strategy:*"]
        total_flushed = 0

        for pattern in patterns:
            cursor = 0
            while True:
                cursor, keys = await self.redis.scan(
                    cursor=cursor, match=pattern, count=100,
                )
                if keys:
                    await self.redis.delete(*keys)
                    total_flushed += len(keys)
                if cursor == 0:
                    break

        return FlushResponse(
            flushed_keys=total_flushed,
            message=f"Очищено {total_flushed} ключей по паттернам: {', '.join(patterns)}",
        )

    # === Database Info ===

    async def get_db_info(self) -> DatabaseInfo:
        """Метрики PostgreSQL."""
        # Активные подключения
        conn_result = await self.db.execute(text(
            "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'"
        ))
        active_connections: int = conn_result.scalar_one()

        # Максимум подключений
        max_conn_result = await self.db.execute(text(
            "SHOW max_connections"
        ))
        max_connections: int = int(max_conn_result.scalar_one())

        # Размер базы данных
        size_result = await self.db.execute(text(
            "SELECT pg_database_size(current_database()) / (1024.0 * 1024.0)"
        ))
        database_size_mb: float = round(float(size_result.scalar_one()), 2)

        # Статистика таблиц
        tables_result = await self.db.execute(text("""
            SELECT
                relname AS name,
                n_live_tup AS row_count,
                pg_total_relation_size(quote_ident(relname)) / (1024.0 * 1024.0) AS size_mb
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(quote_ident(relname)) DESC
        """))
        tables = [
            TableStats(
                name=row.name,
                row_count=row.row_count,
                size_mb=round(float(row.size_mb), 2),
            )
            for row in tables_result.fetchall()
        ]

        return DatabaseInfo(
            active_connections=active_connections,
            max_connections=max_connections,
            database_size_mb=database_size_mb,
            tables=tables,
        )

    # === Celery Info ===

    async def get_celery_info(self) -> CeleryInfo:
        """Метрики Celery."""
        from app.celery_app import celery

        workers_info: list[CeleryWorkerInfo] = []
        total_active = 0

        try:
            inspector = celery.control.inspect(timeout=2.0)
            ping_result = await asyncio.to_thread(inspector.ping)
            active_result = await asyncio.to_thread(inspector.active)
            stats_result = await asyncio.to_thread(inspector.stats)

            if ping_result:
                for worker_name in ping_result:
                    active_tasks = len(active_result.get(worker_name, [])) if active_result else 0
                    total_active += active_tasks

                    processed = 0
                    if stats_result and worker_name in stats_result:
                        total_info = stats_result[worker_name].get("total", {})
                        processed = sum(total_info.values()) if isinstance(total_info, dict) else 0

                    workers_info.append(CeleryWorkerInfo(
                        name=worker_name,
                        status="online",
                        active_tasks=active_tasks,
                        processed=processed,
                    ))
        except Exception as e:
            logger.warning("Не удалось получить статус Celery workers: %s", e)

        # Длина очереди через синхронный redis
        queue_length = 0
        try:
            import redis as sync_redis
            r = sync_redis.from_url(settings.celery_broker_url)
            queue_length = r.llen("celery")
            r.close()
        except Exception as e:
            logger.warning("Не удалось получить длину очереди Celery: %s", e)

        # Beat heartbeat
        beat_last_run: datetime | None = None
        try:
            last_run_ts = await self.redis.get("celery-beat:last_run")
            if last_run_ts:
                beat_last_run = datetime.fromtimestamp(
                    float(last_run_ts), tz=timezone.utc,
                )
        except Exception:
            pass

        # Активные боты
        bots_result = await self.db.execute(
            select(func.count(Bot.id)).where(Bot.status == BotStatus.RUNNING)
        )
        active_bots_count: int = bots_result.scalar_one()

        return CeleryInfo(
            workers=workers_info,
            queue_length=queue_length,
            active_tasks=total_active,
            beat_last_run=beat_last_run,
            active_bots_count=active_bots_count,
        )

    # === Error Log ===

    async def get_errors(
        self,
        module: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> ErrorLogResponse:
        """Логи ошибок с фильтрацией по модулю."""
        from app.modules.auth.models import User

        query = (
            select(BotLog, Bot.user_id, User.email)
            .join(Bot, BotLog.bot_id == Bot.id)
            .join(User, Bot.user_id == User.id)
            .where(BotLog.level == BotLogLevel.ERROR)
        )

        # Фильтрация по модулю через LIKE
        if module and module != "all":
            module_keywords = {
                "trading": ["bybit", "order", "position", "leverage"],
                "backtest": ["backtest"],
                "market": ["kline", "market", "candle", "pair"],
                "strategy": ["strategy", "signal", "knn", "indicator"],
                "auth": ["auth", "login", "token", "password", "jwt"],
            }
            keywords = module_keywords.get(module)
            if keywords:
                from sqlalchemy import or_
                conditions = [BotLog.message.ilike(f"%{kw}%") for kw in keywords]
                query = query.where(or_(*conditions))

        # Подсчет общего количества
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Пагинация
        query = query.order_by(BotLog.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        rows = result.all()

        items: list[ErrorLogItem] = []
        for row in rows:
            log = row[0]
            user_email = row[2]
            detected_module = _detect_module(log.message)

            items.append(ErrorLogItem(
                id=log.id,
                timestamp=log.created_at,
                module=detected_module,
                message=log.message,
                traceback=log.details.get("traceback") if log.details else None,
                bot_id=log.bot_id,
                user_email=user_email,
            ))

        return ErrorLogResponse(items=items, total=total)

    # === Config ===

    async def get_config(self) -> SystemConfig:
        """Конфигурация системы."""
        # Переменные окружения (маскированные)
        env_vars: dict[str, str] = {}
        for key, value in sorted(os.environ.items()):
            if key.startswith(("APP_", "DATABASE_", "REDIS_", "CELERY_", "JWT_",
                               "BYBIT_", "CORS_", "ENCRYPTION_", "FRONTEND_")):
                env_vars[key] = _mask_value(key, value)

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

        # Docker containers
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
                        # Извлечь uptime из статуса (например "Up 2 hours")
                        uptime_match = re.search(r"Up\s+(.+)", status_str)
                        containers.append(ContainerStatus(
                            name=name,
                            status="running" if "Up" in status_str else "stopped",
                            uptime=uptime_match.group(1) if uptime_match else None,
                        ))
        except Exception:
            pass

        return SystemConfig(
            env_vars=env_vars,
            app_version=settings.app_version,
            python_version=platform.python_version(),
            git_commit=git_commit,
            docker_containers=containers,
        )

    async def update_app_version(self, version: str) -> str:
        """Обновить версию приложения в runtime."""
        settings.app_version = version
        return version

    # === Platform P&L ===

    async def get_platform_pnl(self, exclude_demo: bool = False) -> PlatformPnL:
        """Суммарный P&L платформы."""
        # Live P&L
        live_result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_pnl), Decimal("0")),
                func.count(Bot.id),
            ).where(Bot.mode == BotMode.LIVE)
        )
        live_row = live_result.one()
        live_pnl = Decimal(str(live_row[0]))
        live_bots = int(live_row[1])

        # Demo P&L
        demo_result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_pnl), Decimal("0")),
                func.count(Bot.id),
            ).where(Bot.mode == BotMode.DEMO)
        )
        demo_row = demo_result.one()
        demo_pnl = Decimal(str(demo_row[0]))
        demo_bots = int(demo_row[1])

        # Активные боты
        active_result = await self.db.execute(
            select(func.count(Bot.id)).where(Bot.status == BotStatus.RUNNING)
        )
        active_bots: int = active_result.scalar_one()

        total_pnl = live_pnl if exclude_demo else live_pnl + demo_pnl
        total_bots = live_bots if exclude_demo else live_bots + demo_bots

        return PlatformPnL(
            total_pnl=total_pnl,
            total_bots=total_bots,
            active_bots=active_bots,
            demo_bots_excluded=demo_bots if exclude_demo else 0,
            live_pnl=live_pnl,
            demo_pnl=demo_pnl,
        )

    # === Reconcile All ===

    async def reconcile_all(self) -> ReconcileAllResponse:
        """Массовая сверка P&L для всех live ботов."""
        from app.modules.trading.service import TradingService

        # Получить все live running боты
        result = await self.db.execute(
            select(Bot).where(
                Bot.mode == BotMode.LIVE,
                Bot.status == BotStatus.RUNNING,
            )
        )
        bots = list(result.scalars().all())

        results: list[dict] = []
        corrections = 0

        for bot in bots:
            try:
                trading_service = TradingService(self.db)
                reconcile_result = await trading_service.reconcile_bot_pnl(
                    bot_id=bot.id,
                    user_id=bot.user_id,
                )
                bot_corrections = len(reconcile_result.get("corrections", []))
                corrections += bot_corrections
                results.append({
                    "bot_id": str(bot.id),
                    "status": "ok",
                    "corrections": bot_corrections,
                })
            except Exception as e:
                logger.error("Ошибка сверки бота %s: %s", bot.id, e)
                results.append({
                    "bot_id": str(bot.id),
                    "status": "error",
                    "error": str(e),
                })

        return ReconcileAllResponse(
            bots_checked=len(bots),
            corrections=corrections,
            results=results,
        )
