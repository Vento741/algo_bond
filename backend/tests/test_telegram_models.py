"""Тесты моделей Telegram."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.auth.models import User, UserRole
from app.modules.telegram.models import TelegramDeepLinkToken, TelegramLink

pytestmark = pytest.mark.asyncio


async def _create_user(db: AsyncSession) -> User:
    """Вспомогательная функция: создать пользователя для FK."""
    user = User(
        id=uuid.uuid4(),
        email=f"tg_{uuid.uuid4().hex[:8]}@test.com",
        username=f"tg_{uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("Test123"),
        is_active=True,
        role=UserRole.USER,
    )
    db.add(user)
    await db.flush()
    return user


async def test_create_telegram_link(db_session: AsyncSession):
    """Создание привязки Telegram аккаунта."""
    user = await _create_user(db_session)

    link = TelegramLink(
        user_id=user.id,
        telegram_id=123456789,
        telegram_username="testuser",
        chat_id=123456789,
        is_active=True,
    )
    db_session.add(link)
    await db_session.flush()

    result = await db_session.execute(
        select(TelegramLink).where(TelegramLink.telegram_id == 123456789)
    )
    saved = result.scalar_one()
    assert saved.user_id == user.id
    assert saved.telegram_username == "testuser"
    assert saved.is_active is True
    assert saved.linked_at is not None


async def test_create_deep_link_token(db_session: AsyncSession):
    """Создание токена для deep link привязки."""
    user = await _create_user(db_session)

    token = TelegramDeepLinkToken(
        user_id=user.id,
        token="a" * 32,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
    )
    db_session.add(token)
    await db_session.flush()

    result = await db_session.execute(
        select(TelegramDeepLinkToken).where(
            TelegramDeepLinkToken.token == "a" * 32
        )
    )
    saved = result.scalar_one()
    assert saved.user_id == user.id
    assert saved.used is False


async def test_deep_link_token_expired(db_session: AsyncSession):
    """Проверка что expired токен определяется корректно."""
    user = await _create_user(db_session)

    token = TelegramDeepLinkToken(
        user_id=user.id,
        token="b" * 32,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    db_session.add(token)
    await db_session.flush()

    result = await db_session.execute(
        select(TelegramDeepLinkToken).where(
            TelegramDeepLinkToken.token == "b" * 32,
            TelegramDeepLinkToken.expires_at > datetime.now(timezone.utc),
            TelegramDeepLinkToken.used.is_(False),
        )
    )
    assert result.scalar_one_or_none() is None
