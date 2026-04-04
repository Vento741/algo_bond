"""Бизнес-логика модуля admin."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundException
from app.modules.admin.schemas import (
    AdminAccessRequestItem,
    AdminInviteCodeItem,
    AdminInviteGenerate,
    AdminLogItem,
    AdminStats,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserUpdate,
)
from app.modules.auth.models import User, UserRole
from app.modules.billing.models import Plan, Subscription, SubscriptionStatus
from app.modules.trading.models import Bot, BotLog, BotLogLevel, BotStatus

SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class AdminService:
    """Сервис администрирования платформы."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # === Stats ===

    async def get_stats(self) -> AdminStats:
        """Агрегированная статистика платформы."""
        # Количество пользователей
        users_result = await self.db.execute(select(func.count(User.id)))
        users_count: int = users_result.scalar_one()

        # Активные боты
        bots_result = await self.db.execute(
            select(func.count(Bot.id)).where(Bot.status == BotStatus.RUNNING)
        )
        active_bots: int = bots_result.scalar_one()

        # Заявки на рассмотрении (pending)
        try:
            from app.modules.auth.models import AccessRequest, AccessRequestStatus
            requests_result = await self.db.execute(
                select(func.count(AccessRequest.id)).where(
                    AccessRequest.status == AccessRequestStatus.PENDING
                )
            )
            pending_requests: int = requests_result.scalar_one()
        except (ImportError, Exception):
            pending_requests = 0

        # Всего сделок и суммарный PnL
        trades_result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_trades), 0),
                func.coalesce(func.sum(Bot.total_pnl), Decimal("0")),
            )
        )
        row = trades_result.one()
        total_trades: int = int(row[0])
        total_pnl: Decimal = Decimal(str(row[1]))

        # Активные инвайт-коды
        try:
            from app.modules.auth.models import InviteCode
            invites_result = await self.db.execute(
                select(func.count(InviteCode.id)).where(
                    InviteCode.is_active == True,  # noqa: E712
                    InviteCode.used_by == None,  # noqa: E711
                )
            )
            active_invites: int = invites_result.scalar_one()
        except (ImportError, Exception):
            active_invites = 0

        return AdminStats(
            users_count=users_count,
            active_bots=active_bots,
            pending_requests=pending_requests,
            total_trades=total_trades,
            total_pnl=total_pnl,
            active_invites=active_invites,
        )

    # === Users ===

    async def list_users(
        self,
        limit: int = 20,
        offset: int = 0,
        search: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[AdminUserListItem], int]:
        """Список пользователей с пагинацией и фильтрами."""
        query = select(User)

        # Фильтры
        if search:
            query = query.where(
                (User.email.ilike(f"%{search}%")) | (User.username.ilike(f"%{search}%"))
            )
        if role:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)

        # Total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated results
        query = query.order_by(User.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        users = list(result.scalars().all())

        items: list[AdminUserListItem] = []
        for user in users:
            # Считаем ботов
            bots_result = await self.db.execute(
                select(func.count(Bot.id)).where(Bot.user_id == user.id)
            )
            bots_count: int = bots_result.scalar_one()

            # Получаем подписку
            sub_result = await self.db.execute(
                select(Subscription)
                .options(selectinload(Subscription.plan))
                .where(Subscription.user_id == user.id)
            )
            sub = sub_result.scalar_one_or_none()

            items.append(AdminUserListItem(
                id=user.id,
                email=user.email,
                username=user.username,
                role=user.role.value if hasattr(user.role, 'value') else str(user.role),
                is_active=user.is_active,
                created_at=user.created_at,
                bots_count=bots_count,
                subscription_plan=sub.plan.name if sub and sub.plan else None,
            ))

        return items, total

    async def get_user_detail(self, user_id: uuid.UUID) -> AdminUserDetail:
        """Детальная информация о пользователе."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")

        # Ботов
        bots_result = await self.db.execute(
            select(func.count(Bot.id)).where(Bot.user_id == user.id)
        )
        bots_count: int = bots_result.scalar_one()

        # Exchange accounts
        from app.modules.auth.models import ExchangeAccount
        ea_result = await self.db.execute(
            select(func.count(ExchangeAccount.id)).where(ExchangeAccount.user_id == user.id)
        )
        ea_count: int = ea_result.scalar_one()

        # Подписка
        sub_result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.user_id == user.id)
        )
        sub = sub_result.scalar_one_or_none()

        # Агрегированная статистика ботов
        pnl_result = await self.db.execute(
            select(
                func.coalesce(func.sum(Bot.total_pnl), Decimal("0")),
                func.coalesce(func.sum(Bot.total_trades), 0),
            ).where(Bot.user_id == user.id)
        )
        pnl_row = pnl_result.one()

        return AdminUserDetail(
            id=user.id,
            email=user.email,
            username=user.username,
            role=user.role.value if hasattr(user.role, 'value') else str(user.role),
            is_active=user.is_active,
            created_at=user.created_at,
            updated_at=user.updated_at,
            bots_count=bots_count,
            exchange_accounts_count=ea_count,
            subscription_plan=sub.plan.name if sub and sub.plan else None,
            subscription_status=sub.status.value if sub else None,
            subscription_expires_at=sub.expires_at if sub else None,
            total_pnl=Decimal(str(pnl_row[0])),
            total_trades=int(pnl_row[1]),
        )

    async def update_user(
        self, user_id: uuid.UUID, data: AdminUserUpdate,
    ) -> AdminUserDetail:
        """Обновить пользователя (роль, статус)."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")

        if data.role is not None:
            user.role = UserRole(data.role)
        if data.is_active is not None:
            user.is_active = data.is_active

        await self.db.flush()
        await self.db.commit()

        return await self.get_user_detail(user_id)

    async def delete_user(
        self, user_id: uuid.UUID, admin_id: uuid.UUID,
    ) -> None:
        """Удалить пользователя (каскадное удаление)."""
        if user_id == admin_id:
            raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")

        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")

        await self.db.delete(user)
        await self.db.commit()

    # === Access Requests ===

    async def list_requests(
        self,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
    ) -> tuple[list[AdminAccessRequestItem], int]:
        """Список заявок на доступ с фильтрацией."""
        from app.modules.auth.models import AccessRequest, AccessRequestStatus

        query = select(AccessRequest)

        if status:
            query = query.where(AccessRequest.status == AccessRequestStatus(status))

        # Total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated
        query = query.order_by(AccessRequest.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        requests = list(result.scalars().all())

        items: list[AdminAccessRequestItem] = [
            AdminAccessRequestItem(
                id=req.id,
                telegram=req.telegram,
                status=req.status.value if hasattr(req.status, 'value') else str(req.status),
                created_at=req.created_at,
                reviewed_at=req.reviewed_at,
                reject_reason=req.reject_reason,
            )
            for req in requests
        ]

        return items, total

    async def approve_request(
        self, request_id: uuid.UUID, admin_id: uuid.UUID,
    ) -> dict:
        """Одобрить заявку и сгенерировать инвайт-код."""
        from app.modules.auth.models import (
            AccessRequest,
            AccessRequestStatus,
            InviteCode,
        )

        result = await self.db.execute(
            select(AccessRequest).where(AccessRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if not req:
            raise NotFoundException("Заявка не найдена")

        if req.status != AccessRequestStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail="Заявка уже обработана",
            )

        # Генерация инвайт-кода
        code = "".join(secrets.choice(SAFE_CHARS) for _ in range(8))

        invite = InviteCode(
            code=code,
            created_by=admin_id,
            is_active=True,
        )
        self.db.add(invite)
        await self.db.flush()

        # Обновить заявку
        req.status = AccessRequestStatus.APPROVED
        req.generated_invite_code_id = invite.id
        req.reviewed_by = admin_id
        req.reviewed_at = datetime.now(timezone.utc)

        await self.db.commit()

        return {"invite_code": code, "request_id": str(request_id)}

    async def reject_request(
        self, request_id: uuid.UUID, admin_id: uuid.UUID, reason: str | None = None,
    ) -> AdminAccessRequestItem:
        """Отклонить заявку."""
        from app.modules.auth.models import AccessRequest, AccessRequestStatus

        result = await self.db.execute(
            select(AccessRequest).where(AccessRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if not req:
            raise NotFoundException("Заявка не найдена")

        if req.status != AccessRequestStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail="Заявка уже обработана",
            )

        req.status = AccessRequestStatus.REJECTED
        req.reject_reason = reason
        req.reviewed_by = admin_id
        req.reviewed_at = datetime.now(timezone.utc)

        await self.db.commit()

        return AdminAccessRequestItem(
            id=req.id,
            telegram=req.telegram,
            status=req.status.value,
            created_at=req.created_at,
            reviewed_at=req.reviewed_at,
            reject_reason=req.reject_reason,
        )

    # === Invite Codes ===

    async def list_invites(
        self,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[AdminInviteCodeItem], int]:
        """Список инвайт-кодов."""
        from app.modules.auth.models import InviteCode

        query = select(InviteCode)

        # Total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated
        query = query.order_by(InviteCode.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        invites = list(result.scalars().all())

        items: list[AdminInviteCodeItem] = []
        for inv in invites:
            # Получить email создателя
            creator_result = await self.db.execute(
                select(User.email).where(User.id == inv.created_by)
            )
            creator_email = creator_result.scalar_one_or_none()

            # Получить email использовавшего
            used_by_email = None
            if inv.used_by:
                used_result = await self.db.execute(
                    select(User.email).where(User.id == inv.used_by)
                )
                used_by_email = used_result.scalar_one_or_none()

            items.append(AdminInviteCodeItem(
                id=inv.id,
                code=inv.code,
                is_active=inv.is_active,
                created_at=inv.created_at,
                expires_at=inv.expires_at,
                used_at=inv.used_at,
                created_by_email=creator_email,
                used_by_email=used_by_email,
            ))

        return items, total

    async def generate_invites(
        self,
        admin_id: uuid.UUID,
        data: AdminInviteGenerate,
    ) -> list[AdminInviteCodeItem]:
        """Генерация пакета инвайт-кодов."""
        from app.modules.auth.models import InviteCode

        expires_at = None
        if data.expires_in_days is not None:
            expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)

        # Получить email админа
        admin_result = await self.db.execute(
            select(User.email).where(User.id == admin_id)
        )
        admin_email: str | None = admin_result.scalar_one_or_none()

        codes: list[AdminInviteCodeItem] = []
        for _ in range(data.count):
            code = "".join(secrets.choice(SAFE_CHARS) for _ in range(8))
            invite = InviteCode(
                code=code,
                created_by=admin_id,
                expires_at=expires_at,
                is_active=True,
            )
            self.db.add(invite)
            await self.db.flush()

            codes.append(AdminInviteCodeItem(
                id=invite.id,
                code=invite.code,
                is_active=invite.is_active,
                created_at=invite.created_at,
                expires_at=invite.expires_at,
                used_at=None,
                created_by_email=admin_email,
                used_by_email=None,
            ))

        await self.db.commit()
        return codes

    async def deactivate_invite(self, invite_id: uuid.UUID) -> AdminInviteCodeItem:
        """Деактивировать инвайт-код."""
        from app.modules.auth.models import InviteCode

        result = await self.db.execute(
            select(InviteCode).where(InviteCode.id == invite_id)
        )
        invite = result.scalar_one_or_none()
        if not invite:
            raise NotFoundException("Инвайт-код не найден")

        invite.is_active = False
        await self.db.flush()
        await self.db.commit()

        # Email создателя
        creator_result = await self.db.execute(
            select(User.email).where(User.id == invite.created_by)
        )
        creator_email = creator_result.scalar_one_or_none()

        return AdminInviteCodeItem(
            id=invite.id,
            code=invite.code,
            is_active=invite.is_active,
            created_at=invite.created_at,
            expires_at=invite.expires_at,
            used_at=invite.used_at,
            created_by_email=creator_email,
            used_by_email=None,
        )

    # === System Logs ===

    async def list_logs(
        self,
        limit: int = 50,
        offset: int = 0,
        level: str | None = None,
        bot_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> tuple[list[AdminLogItem], int]:
        """Список логов ботов с фильтрацией."""
        query = select(BotLog)

        # Фильтры
        if level:
            query = query.where(BotLog.level == BotLogLevel(level))
        if bot_id:
            query = query.where(BotLog.bot_id == bot_id)
        if user_id:
            # JOIN через Bot для фильтрации по user_id
            query = query.join(Bot, BotLog.bot_id == Bot.id).where(Bot.user_id == user_id)
        if from_date:
            query = query.where(BotLog.created_at >= from_date)
        if to_date:
            query = query.where(BotLog.created_at <= to_date)

        # Total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginated
        query = query.order_by(BotLog.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        logs = list(result.scalars().all())

        items: list[AdminLogItem] = []
        for log in logs:
            # Получить email пользоват��ля через Bot
            user_result = await self.db.execute(
                select(User.email)
                .join(Bot, Bot.user_id == User.id)
                .where(Bot.id == log.bot_id)
            )
            user_email = user_result.scalar_one_or_none()

            items.append(AdminLogItem(
                id=log.id,
                bot_id=log.bot_id,
                level=log.level.value if hasattr(log.level, 'value') else str(log.level),
                message=log.message,
                details=log.details,
                created_at=log.created_at,
                user_email=user_email,
            ))

        return items, total
