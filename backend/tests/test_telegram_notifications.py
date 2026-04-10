"""Тесты TelegramNotifier: доставка уведомлений в Telegram."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.auth.models import User, UserRole
from app.modules.notifications.enums import NotificationPriority, NotificationType
from app.modules.notifications.models import Notification, NotificationPreference
from app.modules.telegram.service import TelegramService

pytestmark = pytest.mark.asyncio


async def _create_user(db: AsyncSession, role: UserRole = UserRole.USER) -> User:
    """Создать тестового пользователя."""
    user = User(
        id=uuid.uuid4(),
        email=f"tgnotif_{uuid.uuid4().hex[:8]}@test.com",
        username=f"tgn_{uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("Test123"),
        is_active=True,
        role=role,
    )
    db.add(user)
    await db.flush()
    return user


async def _link_telegram(db: AsyncSession, user: User, telegram_id: int = 111222333) -> None:
    """Привязать Telegram к пользователю."""
    service = TelegramService(db)
    token_obj = await service.generate_deep_link_token(user.id)
    link = await service.link_telegram(
        token=token_obj.token,
        telegram_id=telegram_id,
        telegram_username="testuser",
        chat_id=telegram_id,
    )
    return link


async def _set_prefs(
    db: AsyncSession,
    user: User,
    telegram_enabled: bool = True,
    **kwargs,
) -> NotificationPreference:
    """Создать/обновить NotificationPreference."""
    prefs = NotificationPreference(
        user_id=user.id,
        telegram_enabled=telegram_enabled,
        **kwargs,
    )
    db.add(prefs)
    await db.flush()
    return prefs


def _make_notification(
    user_id: uuid.UUID,
    ntype: NotificationType = NotificationType.BOT_STARTED,
    priority: NotificationPriority = NotificationPriority.MEDIUM,
) -> Notification:
    """Создать объект Notification (без сохранения в БД)."""
    return Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        type=ntype,
        priority=priority,
        title="Test title",
        message="Test message",
    )


# === Основные сценарии ===


async def test_sends_when_telegram_enabled(db_session: AsyncSession) -> None:
    """telegram_enabled=True и категория включена -> send_message вызван."""
    user = await _create_user(db_session)
    await _link_telegram(db_session, user)
    await _set_prefs(db_session, user, telegram_enabled=True, bots_telegram=True)

    notification = _make_notification(user.id, NotificationType.BOT_STARTED)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_called_once()


async def test_skips_when_telegram_disabled(db_session: AsyncSession) -> None:
    """telegram_enabled=False -> send_message НЕ вызван."""
    user = await _create_user(db_session)
    await _link_telegram(db_session, user)
    await _set_prefs(db_session, user, telegram_enabled=False)

    notification = _make_notification(user.id, NotificationType.BOT_STARTED)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_not_called()


async def test_skips_when_category_telegram_disabled(db_session: AsyncSession) -> None:
    """positions_telegram=False -> уведомление о позиции НЕ отправляется."""
    user = await _create_user(db_session)
    await _link_telegram(db_session, user)
    await _set_prefs(db_session, user, telegram_enabled=True, positions_telegram=False)

    notification = _make_notification(user.id, NotificationType.POSITION_OPENED)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_not_called()


async def test_skips_system_for_regular_user(db_session: AsyncSession) -> None:
    """Системное уведомление (system) не доставляется обычному пользователю."""
    user = await _create_user(db_session, role=UserRole.USER)
    await _link_telegram(db_session, user)
    await _set_prefs(db_session, user, telegram_enabled=True, system_telegram=True)

    notification = _make_notification(user.id, NotificationType.SYSTEM_ERROR)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_not_called()


async def test_sends_system_to_admin(db_session: AsyncSession) -> None:
    """Системное уведомление доставляется администратору."""
    admin = await _create_user(db_session, role=UserRole.ADMIN)
    await _link_telegram(db_session, admin)
    await _set_prefs(db_session, admin, telegram_enabled=True, system_telegram=True)

    notification = _make_notification(admin.id, NotificationType.SYSTEM_ERROR)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_called_once()


async def test_critical_sent_always(db_session: AsyncSession) -> None:
    """CRITICAL-уведомление отправляется даже без настроек."""
    user = await _create_user(db_session)
    await _link_telegram(db_session, user)
    # НЕ создаём preferences - defaults все отключены

    notification = _make_notification(
        user.id,
        NotificationType.BOT_EMERGENCY,
        priority=NotificationPriority.CRITICAL,
    )

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_called_once()


async def test_skips_when_no_telegram_link(db_session: AsyncSession) -> None:
    """Пользователь без Telegram-привязки -> send_message НЕ вызван."""
    user = await _create_user(db_session)
    # Не привязываем Telegram

    notification = _make_notification(user.id, NotificationType.BOT_STARTED)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_not_called()


async def test_skips_when_bot_not_initialized(db_session: AsyncSession) -> None:
    """Если бот не инициализирован (bot=None) -> ничего не происходит."""
    user = await _create_user(db_session)
    await _link_telegram(db_session, user)

    notification = _make_notification(user.id, NotificationType.BOT_STARTED)

    with patch("app.modules.telegram.bot.bot", None):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)  # не должен бросить исключение


async def test_new_notification_types_in_enums() -> None:
    """Новые типы уведомлений присутствуют в enum и категориях."""
    from app.modules.notifications.enums import (
        NotificationType,
        NOTIFICATION_CATEGORIES,
        get_category,
    )

    assert NotificationType.DAILY_PNL_REPORT in NOTIFICATION_CATEGORIES["finance"]
    assert NotificationType.BALANCE_CHANGED in NOTIFICATION_CATEGORIES["finance"]
    assert NotificationType.MARGIN_WARNING in NOTIFICATION_CATEGORIES["finance"]
    assert NotificationType.NEW_LOGIN in NOTIFICATION_CATEGORIES["security"]
    assert NotificationType.API_KEY_CHANGED in NOTIFICATION_CATEGORIES["security"]

    assert get_category(NotificationType.DAILY_PNL_REPORT) == "finance"
    assert get_category(NotificationType.NEW_LOGIN) == "security"


async def test_finance_notification_sent_when_enabled(db_session: AsyncSession) -> None:
    """finance_telegram=True -> финансовое уведомление отправляется."""
    user = await _create_user(db_session)
    await _link_telegram(db_session, user)
    await _set_prefs(db_session, user, telegram_enabled=True, finance_telegram=True)

    notification = _make_notification(user.id, NotificationType.DAILY_PNL_REPORT)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_called_once()


async def test_security_notification_sent_when_enabled(db_session: AsyncSession) -> None:
    """security_telegram=True -> уведомление безопасности отправляется."""
    user = await _create_user(db_session)
    await _link_telegram(db_session, user)
    await _set_prefs(db_session, user, telegram_enabled=True, security_telegram=True)

    notification = _make_notification(user.id, NotificationType.NEW_LOGIN)

    mock_bot = AsyncMock()
    with patch("app.modules.telegram.bot.bot", mock_bot):
        from app.modules.telegram.notifications import TelegramNotifier
        notifier = TelegramNotifier(db_session)
        await notifier.on_notification(notification)

    mock_bot.send_message.assert_called_once()
