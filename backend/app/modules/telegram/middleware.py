"""Middleware для Telegram бота: DB session, Auth, Admin."""

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.auth.models import User, UserRole
from app.modules.telegram.service import TelegramService


class DbSessionMiddleware(BaseMiddleware):
    """Инжектит AsyncSession в каждый handler."""

    def __init__(self, session_pool: async_sessionmaker[AsyncSession]) -> None:
        super().__init__()
        self.session_pool = session_pool

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        async with self.session_pool() as session:
            data["session"] = session
            return await handler(event, data)


class AuthMiddleware(BaseMiddleware):
    """Проверяет привязку TelegramLink. Блокирует непривязанных пользователей."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = None
        if isinstance(event, Message) and event.from_user:
            user = event.from_user
        elif isinstance(event, CallbackQuery) and event.from_user:
            user = event.from_user

        if user is None:
            return

        session: AsyncSession = data["session"]
        service = TelegramService(session)
        link = await service.get_link_by_telegram_id(user.id)

        if link is None or not link.is_active:
            if isinstance(event, Message):
                await event.answer(
                    "Аккаунт не привязан. Привяжите в ЛК: Настройки -> Telegram"
                )
            elif isinstance(event, CallbackQuery):
                await event.answer("Аккаунт не привязан", show_alert=True)
            return

        data["user_link"] = link
        data["user_id"] = link.user_id
        return await handler(event, data)


class AdminMiddleware(BaseMiddleware):
    """Пропускает только пользователей с role=ADMIN."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        session: AsyncSession = data["session"]
        user_id = data.get("user_id")
        if user_id is None:
            return

        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None or user.role != UserRole.ADMIN:
            if isinstance(event, Message):
                await event.answer("Только для администраторов")
            elif isinstance(event, CallbackQuery):
                await event.answer("Только для администраторов", show_alert=True)
            return

        data["user"] = user
        return await handler(event, data)
