"""API-эндпоинты управления AlgoBond Sentinel."""

import hmac
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
    if not hmac.compare_digest(x_agent_token, settings.agent_secret):
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
    action: str = Query(..., pattern="^(start|stop)$"),
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> dict[str, str]:
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
