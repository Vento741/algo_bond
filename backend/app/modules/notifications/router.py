"""REST API роутер модуля уведомлений."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.dependencies import get_current_user
from app.database import get_db
from app.modules.notifications.schemas import (
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    UnreadCountResponse,
)
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

DB = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[dict, Depends(get_current_user)]


def _user_id(user: dict) -> uuid.UUID:
    """Извлечь user_id из JWT payload."""
    return uuid.UUID(user["sub"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    db: DB,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    category: str | None = Query(None),
) -> NotificationListResponse:
    """Список уведомлений с пагинацией и фильтром по категории."""
    service = NotificationService(db)
    items, total, unread = await service.get_user_notifications(
        user_id=_user_id(user),
        limit=limit,
        offset=offset,
        type_filter=category,
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        unread_count=unread,
    )


@router.get("/unread/count", response_model=UnreadCountResponse)
async def unread_count(
    db: DB,
    user: CurrentUser,
) -> UnreadCountResponse:
    """Количество непрочитанных уведомлений."""
    service = NotificationService(db)
    count = await service.get_unread_count(_user_id(user))
    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> dict:
    """Отметить уведомление прочитанным."""
    service = NotificationService(db)
    ok = await service.mark_read(_user_id(user), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return {"ok": True}


@router.patch("/read-all")
async def mark_all_read(
    db: DB,
    user: CurrentUser,
) -> dict:
    """Отметить все уведомления прочитанными."""
    service = NotificationService(db)
    count = await service.mark_all_read(_user_id(user))
    return {"updated": count}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> dict:
    """Удалить уведомление."""
    service = NotificationService(db)
    ok = await service.delete_notification(_user_id(user), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return {"ok": True}


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_preferences(
    db: DB,
    user: CurrentUser,
) -> NotificationPreferencesResponse:
    """Получить настройки уведомлений."""
    service = NotificationService(db)
    prefs = await service.get_preferences(_user_id(user))
    if prefs is None:
        return NotificationPreferencesResponse()
    return NotificationPreferencesResponse.model_validate(prefs)


@router.put("/preferences", response_model=NotificationPreferencesResponse)
async def update_preferences(
    body: NotificationPreferencesUpdate,
    db: DB,
    user: CurrentUser,
) -> NotificationPreferencesResponse:
    """Обновить настройки уведомлений."""
    service = NotificationService(db)
    pref = await service.update_preferences(
        _user_id(user),
        body.model_dump(exclude_unset=True),
    )
    return NotificationPreferencesResponse.model_validate(pref)
