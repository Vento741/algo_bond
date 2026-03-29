"""Бизнес-логика модуля billing."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictException, NotFoundException
from app.modules.billing.models import Plan, Subscription, SubscriptionStatus
from app.modules.billing.schemas import PlanCreate


class BillingService:
    """Сервис тарифных планов и подписок."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # === Plans ===

    async def get_plans(self) -> list[Plan]:
        """Список всех тарифных планов."""
        result = await self.db.execute(select(Plan).order_by(Plan.price_monthly))
        return list(result.scalars().all())

    async def get_plan_by_slug(self, slug: str) -> Plan:
        """Получить план по slug."""
        result = await self.db.execute(
            select(Plan).where(Plan.slug == slug)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundException(f"Тарифный план '{slug}' не найден")
        return plan

    async def create_plan(self, data: PlanCreate) -> Plan:
        """Создать тарифный план (admin)."""
        existing = await self.db.execute(
            select(Plan).where(Plan.slug == data.slug)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(f"План с slug '{data.slug}' уже существует")

        plan = Plan(**data.model_dump())
        self.db.add(plan)
        await self.db.flush()
        await self.db.commit()
        return plan

    # === Subscriptions ===

    async def get_user_subscription(self, user_id: uuid.UUID) -> Subscription:
        """Получить активную подписку пользователя."""
        result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.user_id == user_id)
        )
        sub = result.scalar_one_or_none()
        if not sub:
            raise NotFoundException("Подписка не найдена")
        return sub

    async def subscribe(self, user_id: uuid.UUID, plan_slug: str) -> Subscription:
        """Подписать пользователя на тарифный план."""
        plan = await self.get_plan_by_slug(plan_slug)

        # Проверить существующую подписку
        result = await self.db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Обновить план
            existing.plan_id = plan.id
            existing.status = SubscriptionStatus.ACTIVE
            await self.db.flush()
            await self.db.commit()
            # Подгрузить связанный план
            result = await self.db.execute(
                select(Subscription)
                .options(selectinload(Subscription.plan))
                .where(Subscription.id == existing.id)
            )
            return result.scalar_one()

        sub = Subscription(user_id=user_id, plan_id=plan.id)
        self.db.add(sub)
        await self.db.flush()
        await self.db.commit()

        # Подгрузить связанный план
        result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.id == sub.id)
        )
        return result.scalar_one()
