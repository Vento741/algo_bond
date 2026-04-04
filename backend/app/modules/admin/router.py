"""API-эндпоинты модуля admin."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.admin.schemas import (
    AdminAccessRequestItem,
    AdminInviteCodeItem,
    AdminInviteGenerate,
    AdminLogItem,
    AdminRequestReject,
    AdminStats,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserUpdate,
    PaginatedResponse,
)
from app.modules.admin.service import AdminService
from app.modules.auth.dependencies import get_admin_user
from app.modules.auth.models import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


# === Stats ===


@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
    """Статистика платформы (только admin)."""
    service = AdminService(db)
    return await service.get_stats()


# === Users ===


@router.get("/users", response_model=PaginatedResponse[AdminUserListItem])
async def list_users(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
    role: str | None = Query(None),
    is_active: bool | None = Query(None),
) -> PaginatedResponse[AdminUserListItem]:
    """Список пользователей с пагинацией (только admin)."""
    service = AdminService(db)
    items, total = await service.list_users(
        limit=limit, offset=offset, search=search, role=role, is_active=is_active,
    )
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    """Детали пользователя (только admin)."""
    service = AdminService(db)
    return await service.get_user_detail(user_id)


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
async def update_user(
    user_id: uuid.UUID,
    data: AdminUserUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    """Обновить пользователя (только admin)."""
    service = AdminService(db)
    return await service.update_user(user_id, data)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить пользователя (только admin)."""
    service = AdminService(db)
    await service.delete_user(user_id, admin.id)


# === Access Requests ===


@router.get("/requests", response_model=PaginatedResponse[AdminAccessRequestItem])
async def list_requests(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
) -> PaginatedResponse[AdminAccessRequestItem]:
    """Список заявок на доступ (только admin)."""
    service = AdminService(db)
    items, total = await service.list_requests(limit=limit, offset=offset, status=status)
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/requests/{request_id}/approve")
async def approve_request(
    request_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Одобрить заявку и сгенерировать инвайт-код (только admin)."""
    service = AdminService(db)
    return await service.approve_request(request_id, admin.id)


@router.post("/requests/{request_id}/reject", response_model=AdminAccessRequestItem)
async def reject_request(
    request_id: uuid.UUID,
    data: AdminRequestReject,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminAccessRequestItem:
    """Отклонить заявку (только admin)."""
    service = AdminService(db)
    return await service.reject_request(request_id, admin.id, data.reason)


# === Invite Codes ===


@router.get("/invites", response_model=PaginatedResponse[AdminInviteCodeItem])
async def list_invites(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> PaginatedResponse[AdminInviteCodeItem]:
    """Список инвайт-кодов (только admin)."""
    service = AdminService(db)
    items, total = await service.list_invites(limit=limit, offset=offset)
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/invites/generate",
    response_model=list[AdminInviteCodeItem],
    status_code=201,
)
async def generate_invites(
    data: AdminInviteGenerate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminInviteCodeItem]:
    """Сгенерировать инвайт-коды (только admin)."""
    service = AdminService(db)
    return await service.generate_invites(admin.id, data)


@router.patch("/invites/{invite_id}", response_model=AdminInviteCodeItem)
async def deactivate_invite(
    invite_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminInviteCodeItem:
    """Деактивировать инвайт-код (только admin)."""
    service = AdminService(db)
    return await service.deactivate_invite(invite_id)


# === System Logs ===


@router.get("/logs", response_model=PaginatedResponse[AdminLogItem])
async def list_logs(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    level: str | None = Query(None),
    bot_id: uuid.UUID | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
) -> PaginatedResponse[AdminLogItem]:
    """Логи ботов всех пользователей (только admin)."""
    service = AdminService(db)
    items, total = await service.list_logs(
        limit=limit,
        offset=offset,
        level=level,
        bot_id=bot_id,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
    )
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)
