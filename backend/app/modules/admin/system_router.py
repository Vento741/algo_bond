"""API-эндпоинты системного мониторинга."""

from fastapi import APIRouter, Depends, Query, Request
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
    VersionResponse,
    VersionUpdate,
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
    """Dependency: создать SystemService."""
    return SystemService(db, redis)


@router.get("/health", response_model=SystemHealthResponse)
async def system_health(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> SystemHealthResponse:
    """Комплексная проверка здоровья сервисов (только admin)."""
    return await service.check_health()


@router.get("/metrics", response_model=ServerMetrics)
async def server_metrics(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> ServerMetrics:
    """Серверные метрики CPU/RAM/Disk (только admin)."""
    return await service.get_metrics()


@router.get("/redis", response_model=RedisInfo)
async def redis_info(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> RedisInfo:
    """Метрики Redis (только admin)."""
    return await service.get_redis_info()


@router.post("/redis/flush", response_model=FlushResponse)
async def flush_redis_cache(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> FlushResponse:
    """Очистка кеша Redis по паттернам (только admin)."""
    return await service.flush_cache()


@router.get("/db", response_model=DatabaseInfo)
async def database_info(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> DatabaseInfo:
    """Метрики PostgreSQL (только admin)."""
    return await service.get_db_info()


@router.get("/celery", response_model=CeleryInfo)
async def celery_info(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> CeleryInfo:
    """Метрики Celery workers и очереди (только admin)."""
    return await service.get_celery_info()


@router.get("/errors", response_model=ErrorLogResponse)
async def error_logs(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
    module: str | None = Query(None, description="Фильтр по модулю"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> ErrorLogResponse:
    """Логи ошибок с фильтрацией (только admin)."""
    return await service.get_errors(module=module, limit=limit, offset=offset)


@router.put("/version", response_model=VersionResponse)
async def update_app_version(
    request: Request,
    data: VersionUpdate,
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> VersionResponse:
    """Обновить версию приложения (только admin)."""
    version = await service.update_app_version(data.version)
    request.app.state.app_version = version
    return VersionResponse(version=version)


@router.get("/config", response_model=SystemConfig)
async def system_config(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> SystemConfig:
    """Конфигурация системы (только admin)."""
    return await service.get_config()


@router.get("/platform-pnl", response_model=PlatformPnL)
async def platform_pnl(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
    exclude_demo: bool = Query(False, description="Исключить demo ботов"),
) -> PlatformPnL:
    """Суммарный P&L платформы (только admin)."""
    return await service.get_platform_pnl(exclude_demo=exclude_demo)


@router.post("/reconcile-all", response_model=ReconcileAllResponse)
async def reconcile_all(
    admin: User = Depends(get_admin_user),
    service: SystemService = Depends(_get_service),
) -> ReconcileAllResponse:
    """Массовая сверка P&L для всех live ботов (только admin)."""
    return await service.reconcile_all()
