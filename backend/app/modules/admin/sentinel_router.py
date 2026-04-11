"""API-эндпоинты управления AlgoBond Sentinel."""

import asyncio
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from app.config import settings
from app.modules.admin.sentinel_schemas import (
    AgentCommandRequest,
    AgentCommandResponse,
    AgentConfig,
    AgentConfigUpdate,
    ApprovalAction,
    ChatHistoryResponse,
    ChatMessage,
    ChatSendRequest,
    CommitsResponse,
    HealthHistoryResponse,
    PendingApprovalsResponse,
    SentinelIncidentsResponse,
    SentinelStatus,
    SentinelStatusUpdate,
    TokenUsageResponse,
)
from app.modules.admin.sentinel_service import (
    AGENT_CHAT_INBOX_KEY,
    AGENT_CHAT_OUT_KEY,
    SentinelService,
)
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


# === Status (existing) ===


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


# === Chat ===


@router.get("/chat/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
    limit: int = Query(50, ge=1, le=200),
) -> ChatHistoryResponse:
    """Последние N сообщений чата с Sentinel."""
    return await service.get_chat_history(limit=limit)


@router.websocket("/chat/ws")
async def chat_websocket(
    websocket: WebSocket,
    token: str = Query(...),
    redis: Redis = Depends(get_redis),
) -> None:
    """WebSocket для real-time чата с Sentinel."""
    # Аутентификация через JWT token в query param
    from jose import JWTError
    from app.core.security import decode_token
    from app.modules.auth.models import UserRole
    from app.modules.auth.service import AuthService
    from app.database import async_session

    try:
        payload = decode_token(token)
        user_id_str = payload.get("sub")
        token_type = payload.get("type")
        if not user_id_str or token_type != "access":
            await websocket.close(code=4001, reason="Unauthorized")
            return
        # Проверяем что пользователь admin
        import uuid as _uuid
        async with async_session() as db:
            auth_service = AuthService(db)
            user = await auth_service.get_user_by_id(_uuid.UUID(user_id_str))
            if not user or user.role != UserRole.ADMIN:
                await websocket.close(code=4003, reason="Forbidden")
                return
    except (JWTError, ValueError, Exception):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    service = SentinelService(redis)

    # Подписка на канал chat:out (сообщения от Sentinel)
    pubsub = redis.pubsub()
    await pubsub.subscribe(AGENT_CHAT_OUT_KEY)

    async def listen_redis() -> None:
        """Слушать Redis pub/sub и отправлять в WebSocket."""
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await websocket.send_text(message["data"])
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass

    listener_task = asyncio.create_task(listen_redis())

    try:
        while True:
            data = await websocket.receive_text()
            # Парсим входящее сообщение
            try:
                payload = json.loads(data)
                content = payload.get("content", "")
            except (json.JSONDecodeError, TypeError):
                content = data

            if not content or len(content) > 4000:
                continue

            # Создаем ChatMessage
            msg = ChatMessage(
                id=str(uuid.uuid4()),
                type="user_message",
                content=content,
                timestamp=datetime.now(timezone.utc),
                metadata=payload.get("metadata") if isinstance(payload, dict) else None,
            )

            # Сохраняем в историю и кладем в inbox для Sentinel (polling)
            await service.save_chat_message(msg)
            await service.redis.rpush(AGENT_CHAT_INBOX_KEY, msg.model_dump_json())

            # Отправляем эхо обратно отправителю для подтверждения
            await websocket.send_text(msg.model_dump_json())

    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        await pubsub.unsubscribe(AGENT_CHAT_OUT_KEY)
        await pubsub.close()


# === Commands ===


@router.post("/command", response_model=AgentCommandResponse)
async def execute_agent_command(
    request: AgentCommandRequest,
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> AgentCommandResponse:
    """Выполнить команду Sentinel (restart, health_check, etc.)."""
    try:
        result = await service.execute_command(request.command, request.params)
        return AgentCommandResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# === Approval ===


@router.get("/approvals", response_model=PendingApprovalsResponse)
async def get_pending_approvals(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> PendingApprovalsResponse:
    """Получить pending approvals."""
    return await service.get_pending_approvals()


@router.post("/approval")
async def resolve_approval(
    action: ApprovalAction,
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> dict[str, str]:
    """Одобрить или отклонить pending action."""
    resolved = await service.resolve_approval(action.approval_id, action.decision)
    if not resolved:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return {"status": "ok", "approval_id": action.approval_id, "decision": action.decision}


# === Config ===


@router.get("/config", response_model=AgentConfig)
async def get_agent_config(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> AgentConfig:
    """Получить текущую конфигурацию Sentinel."""
    return await service.get_config()


@router.put("/config", response_model=AgentConfig)
async def update_agent_config(
    update: AgentConfigUpdate,
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> AgentConfig:
    """Обновить конфигурацию Sentinel."""
    return await service.update_config(update)


# === Health History ===


@router.get("/health-history", response_model=HealthHistoryResponse)
async def get_health_history(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> HealthHistoryResponse:
    """24ч таймлайн health checks."""
    return await service.get_health_history()


# === Commits ===


@router.get("/commits", response_model=CommitsResponse)
async def get_agent_commits(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
    limit: int = Query(20, ge=1, le=50),
) -> CommitsResponse:
    """Последние git коммиты Sentinel."""
    return await service.get_commits(limit=limit)


# === Tokens ===


@router.get("/tokens", response_model=TokenUsageResponse)
async def get_tokens_usage(
    admin: User = Depends(get_admin_user),
    service: SentinelService = Depends(_get_service),
) -> TokenUsageResponse:
    """Использование токенов за сегодня."""
    return await service.get_tokens_usage()
