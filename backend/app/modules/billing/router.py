"""API-эндпоинты модуля billing."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException
from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User, UserRole
from app.modules.billing.schemas import PlanCreate, PlanResponse, SubscriptionResponse
from app.modules.billing.service import BillingService

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(
    db: AsyncSession = Depends(get_db),
) -> list[PlanResponse]:
    """Список всех тарифных планов (публичный)."""
    service = BillingService(db)
    return await service.get_plans()


@router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_plan(
    data: PlanCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlanResponse:
    """Создать тарифный план (только admin)."""
    if user.role != UserRole.ADMIN:
        raise ForbiddenException("Только администратор может создавать тарифные планы")
    service = BillingService(db)
    return await service.create_plan(data)


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """Получить текущую подписку пользователя."""
    service = BillingService(db)
    return await service.get_user_subscription(user.id)


@router.post("/subscribe/{plan_slug}", response_model=SubscriptionResponse)
async def subscribe_to_plan(
    plan_slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """Подписаться на тарифный план."""
    service = BillingService(db)
    return await service.subscribe(user.id, plan_slug)
