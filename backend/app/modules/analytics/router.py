"""API-эндпоинты модуля аналитики."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.database import get_db
from app.modules.analytics.schemas import (
    DeviceStats,
    EventBatch,
    EventListResponse,
    FunnelStep,
    IngestResponse,
    OverviewStats,
    PageStats,
    RealtimeStats,
    SourceStats,
)
from app.modules.analytics.service import AnalyticsService
from app.modules.auth.dependencies import get_admin_user
from app.modules.auth.models import User

# Публичный роутер - прием событий от трекера
router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Административный роутер - просмотр статистики
admin_router = APIRouter(prefix="/api/admin/analytics", tags=["admin-analytics"])


@router.post("/events", response_model=IngestResponse)
@limiter.limit("30/minute")
async def ingest_events(
    request: Request,
    batch: EventBatch,
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    """Принять пакет событий от фронтенд-трекера.

    Rate limit: 30 запросов/мин на IP.
    """
    xff = request.headers.get("x-forwarded-for", "")
    xri = request.headers.get("x-real-ip", "")
    cf_ip = request.headers.get("cf-connecting-ip", "")
    client_host = request.client.host if request.client else "0.0.0.0"
    ip = cf_ip or xff.split(",")[0].strip() or xri or client_host
    print(f"[ANALYTICS IP] cf={cf_ip!r} xff={xff!r} xri={xri!r} client={client_host!r} -> {ip!r}", flush=True)
    user_agent = request.headers.get("user-agent", "")

    service = AnalyticsService(db)
    return await service.ingest_events(batch, ip, user_agent)


@admin_router.get("/overview", response_model=OverviewStats)
async def get_overview(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
) -> OverviewStats:
    """Общая статистика аналитики (только admin)."""
    service = AnalyticsService(db)
    return await service.get_overview(days)


@admin_router.get("/pages", response_model=list[PageStats])
async def get_pages(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(20, ge=1, le=100),
) -> list[PageStats]:
    """Топ страниц с метриками (только admin)."""
    service = AnalyticsService(db)
    return await service.get_pages(days, limit)


@admin_router.get("/sources", response_model=list[SourceStats])
async def get_sources(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
) -> list[SourceStats]:
    """Распределение по источникам трафика (только admin)."""
    service = AnalyticsService(db)
    return await service.get_sources(days)


@admin_router.get("/devices", response_model=DeviceStats)
async def get_devices(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
) -> DeviceStats:
    """Распределение по устройствам (только admin)."""
    service = AnalyticsService(db)
    return await service.get_devices(days)


@admin_router.get("/funnel", response_model=list[FunnelStep])
async def get_funnel(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
) -> list[FunnelStep]:
    """Воронка конверсий (только admin)."""
    service = AnalyticsService(db)
    return await service.get_funnel(days)


@admin_router.get("/realtime", response_model=RealtimeStats)
async def get_realtime(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> RealtimeStats:
    """Статистика в реальном времени (только admin)."""
    service = AnalyticsService(db)
    return await service.get_realtime()


@admin_router.get("/events", response_model=EventListResponse)
async def get_events(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
    type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> EventListResponse:
    """Список событий с фильтрами (только admin)."""
    service = AnalyticsService(db)
    return await service.get_events(days, type, limit, offset)
