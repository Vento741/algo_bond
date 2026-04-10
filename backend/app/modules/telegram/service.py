"""Сервис Telegram: привязка, отвязка, токены, отправка."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.telegram.models import TelegramDeepLinkToken, TelegramLink


class TelegramService:
    """Сервис для управления Telegram-интеграцией."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def generate_deep_link_token(
        self, user_id: uuid.UUID, ttl_minutes: int = 15
    ) -> TelegramDeepLinkToken:
        """Создать одноразовый токен для deep link привязки."""
        await self.db.execute(
            delete(TelegramDeepLinkToken).where(
                TelegramDeepLinkToken.user_id == user_id,
                TelegramDeepLinkToken.used.is_(False),
            )
        )

        token = TelegramDeepLinkToken(
            user_id=user_id,
            token=secrets.token_hex(16),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
        )
        self.db.add(token)
        await self.db.flush()
        await self.db.commit()
        return token

    async def link_telegram(
        self,
        token: str,
        telegram_id: int,
        telegram_username: str | None,
        chat_id: int,
    ) -> TelegramLink | None:
        """Привязать Telegram аккаунт через deep link токен.

        Проверяет токен на валидность (не истёк, не использован).
        При успехе помечает токен использованным и создаёт TelegramLink.
        Возвращает None если токен невалиден.
        """
        result = await self.db.execute(
            select(TelegramDeepLinkToken).where(
                TelegramDeepLinkToken.token == token,
                TelegramDeepLinkToken.used.is_(False),
                TelegramDeepLinkToken.expires_at > datetime.now(timezone.utc),
            )
        )
        token_obj = result.scalar_one_or_none()
        if token_obj is None:
            return None

        token_obj.used = True

        await self.db.execute(
            delete(TelegramLink).where(TelegramLink.user_id == token_obj.user_id)
        )

        link = TelegramLink(
            user_id=token_obj.user_id,
            telegram_id=telegram_id,
            telegram_username=telegram_username,
            chat_id=chat_id,
            is_active=True,
        )
        self.db.add(link)
        await self.db.flush()
        await self.db.commit()
        return link

    async def unlink_telegram(self, user_id: uuid.UUID) -> bool:
        """Отвязать Telegram аккаунт пользователя.

        Возвращает True если привязка существовала и была удалена.
        """
        result = await self.db.execute(
            delete(TelegramLink).where(TelegramLink.user_id == user_id)
        )
        await self.db.commit()
        return (result.rowcount or 0) > 0

    async def get_link_by_user_id(self, user_id: uuid.UUID) -> TelegramLink | None:
        """Получить привязку по user_id."""
        result = await self.db.execute(
            select(TelegramLink).where(TelegramLink.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_link_by_telegram_id(self, telegram_id: int) -> TelegramLink | None:
        """Получить привязку по telegram_id."""
        result = await self.db.execute(
            select(TelegramLink).where(TelegramLink.telegram_id == telegram_id)
        )
        return result.scalar_one_or_none()
