"""Тесты TelegramService: привязка, отвязка, токены."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.auth.models import User, UserRole
from app.modules.telegram.models import TelegramDeepLinkToken, TelegramLink
from app.modules.telegram.service import TelegramService

pytestmark = pytest.mark.asyncio


async def _create_user(db: AsyncSession) -> User:
    """Вспомогательная функция: создать пользователя для FK-связи."""
    user = User(
        id=uuid.uuid4(),
        email=f"tgservice_{uuid.uuid4().hex[:8]}@test.com",
        username=f"tgsvc_{uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("Test123"),
        is_active=True,
        role=UserRole.USER,
    )
    db.add(user)
    await db.flush()
    return user


async def test_generate_deep_link_token(db_session: AsyncSession):
    """Генерация deep link токена."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)

    result = await service.generate_deep_link_token(user.id)

    assert result.token is not None
    assert len(result.token) == 32
    assert result.expires_at > datetime.now(timezone.utc)


async def test_link_telegram(db_session: AsyncSession):
    """Привязка Telegram через deep link token."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)

    token_obj = await service.generate_deep_link_token(user.id)

    link = await service.link_telegram(
        token=token_obj.token,
        telegram_id=123456789,
        telegram_username="testuser",
        chat_id=123456789,
    )
    assert link is not None
    assert link.user_id == user.id
    assert link.telegram_id == 123456789


async def test_link_expired_token(db_session: AsyncSession):
    """Expired токен не привязывает."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)

    token_obj = TelegramDeepLinkToken(
        user_id=user.id,
        token="c" * 32,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    db_session.add(token_obj)
    await db_session.flush()

    link = await service.link_telegram(
        token="c" * 32,
        telegram_id=111,
        telegram_username="test",
        chat_id=111,
    )
    assert link is None


async def test_link_used_token(db_session: AsyncSession):
    """Использованный токен не привязывает повторно."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)

    token_obj = await service.generate_deep_link_token(user.id)
    await service.link_telegram(
        token=token_obj.token,
        telegram_id=222,
        telegram_username="user1",
        chat_id=222,
    )
    link = await service.link_telegram(
        token=token_obj.token,
        telegram_id=333,
        telegram_username="user2",
        chat_id=333,
    )
    assert link is None


async def test_unlink_telegram(db_session: AsyncSession):
    """Отвязка Telegram."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)

    token_obj = await service.generate_deep_link_token(user.id)
    await service.link_telegram(
        token=token_obj.token,
        telegram_id=444,
        telegram_username="user3",
        chat_id=444,
    )

    result = await service.unlink_telegram(user.id)
    assert result is True

    link = await service.get_link_by_user_id(user.id)
    assert link is None


async def test_get_link_by_telegram_id(db_session: AsyncSession):
    """Получение привязки по telegram_id."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)

    token_obj = await service.generate_deep_link_token(user.id)
    await service.link_telegram(
        token=token_obj.token,
        telegram_id=555,
        telegram_username="user4",
        chat_id=555,
    )

    link = await service.get_link_by_telegram_id(555)
    assert link is not None
    assert link.user_id == user.id
