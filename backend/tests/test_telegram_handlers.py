"""Тесты Telegram bot handlers: start, help, status, admin, callbacks."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.auth.models import User, UserRole
from app.modules.telegram.service import TelegramService

pytestmark = pytest.mark.asyncio

# Вспомогательные функции


async def _create_user(db: AsyncSession, role: UserRole = UserRole.USER) -> User:
    """Создать тестового пользователя."""
    user = User(
        id=uuid.uuid4(),
        email=f"tghandler_{uuid.uuid4().hex[:8]}@test.com",
        username=f"tgh_{uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("Test123"),
        is_active=True,
        role=role,
    )
    db.add(user)
    await db.flush()
    return user


def _make_message(text: str = "", user_id: int = 123) -> MagicMock:
    """Создать мок aiogram Message."""
    msg = MagicMock()
    msg.answer = AsyncMock()
    msg.edit_text = AsyncMock()
    msg.edit_reply_markup = AsyncMock()
    tg_user = MagicMock()
    tg_user.id = user_id
    tg_user.username = "testuser"
    msg.from_user = tg_user
    msg.chat = MagicMock()
    msg.chat.id = user_id
    msg.text = text
    return msg


def _make_callback(data: str, user_id: int = 123) -> MagicMock:
    """Создать мок aiogram CallbackQuery."""
    cb = MagicMock()
    cb.answer = AsyncMock()
    cb.data = data
    tg_user = MagicMock()
    tg_user.id = user_id
    cb.from_user = tg_user
    cb.message = _make_message()
    return cb


# === Тесты импортов ===


def test_handlers_import() -> None:
    """Все handler-модули импортируются без ошибок."""
    from app.modules.telegram.handlers import register_handlers  # noqa: F401
    from app.modules.telegram.handlers.start import router as start_router  # noqa: F401
    from app.modules.telegram.handlers.help import router as help_router  # noqa: F401
    from app.modules.telegram.handlers.status import router as status_router  # noqa: F401
    from app.modules.telegram.handlers.admin import router as admin_router  # noqa: F401
    from app.modules.telegram.handlers.callbacks import router as callbacks_router  # noqa: F401


def test_router_names() -> None:
    """Имена роутеров соответствуют ожидаемым."""
    from app.modules.telegram.handlers.start import router as start_router
    from app.modules.telegram.handlers.help import router as help_router
    from app.modules.telegram.handlers.status import router as status_router
    from app.modules.telegram.handlers.admin import router as admin_router
    from app.modules.telegram.handlers.callbacks import router as callbacks_router

    assert start_router.name == "start"
    assert help_router.name == "help"
    assert status_router.name == "status"
    assert admin_router.name == "admin"
    assert callbacks_router.name == "callbacks"


# === Тесты /start ===


async def test_start_welcome(db_session: AsyncSession) -> None:
    """/start без аргументов отправляет приветственное сообщение."""
    from app.modules.telegram.handlers.start import start_welcome

    message = _make_message()
    await start_welcome(message)

    message.answer.assert_called_once()
    args, kwargs = message.answer.call_args
    assert "AlgoBond" in args[0]
    assert "reply_markup" in kwargs


async def test_start_deep_link_invalid_token(db_session: AsyncSession) -> None:
    """/start с невалидным токеном отправляет сообщение об ошибке."""
    from app.modules.telegram.handlers.start import start_deep_link

    message = _make_message()
    command = MagicMock()
    command.args = "invalid_token_xyz"

    await start_deep_link(message, command, db_session)

    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "недействительна" in args[0]


async def test_start_deep_link_valid_token(db_session: AsyncSession) -> None:
    """/start с валидным токеном привязывает аккаунт."""
    from app.modules.telegram.handlers.start import start_deep_link

    user = await _create_user(db_session)
    service = TelegramService(db_session)
    token_obj = await service.generate_deep_link_token(user.id)

    message = _make_message(user_id=999001)
    command = MagicMock()
    command.args = token_obj.token

    await start_deep_link(message, command, db_session)

    message.answer.assert_called_once()
    args, kwargs = message.answer.call_args
    assert "успешно привязан" in args[0]
    assert "reply_markup" in kwargs


async def test_start_deep_link_no_args(db_session: AsyncSession) -> None:
    """/start с deep_link=True но без args вызывает start_welcome."""
    from app.modules.telegram.handlers.start import start_deep_link

    message = _make_message()
    command = MagicMock()
    command.args = None

    await start_deep_link(message, command, db_session)

    # Должен показать приветствие
    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "AlgoBond" in args[0]


# === Тесты /help ===


async def test_help_command() -> None:
    """/help отправляет список команд."""
    from app.modules.telegram.handlers.help import help_command

    message = _make_message()
    await help_command(message)

    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "/status" in args[0]
    assert "/pnl" in args[0]
    assert "/admin" in args[0]


async def test_app_command() -> None:
    """/app отправляет кнопку открытия платформы."""
    from app.modules.telegram.handlers.help import app_command

    message = _make_message()
    await app_command(message)

    message.answer.assert_called_once()
    _, kwargs = message.answer.call_args
    assert "reply_markup" in kwargs


async def test_settings_command() -> None:
    """/settings отправляет кнопку настроек."""
    from app.modules.telegram.handlers.help import settings_command

    message = _make_message()
    await settings_command(message)

    message.answer.assert_called_once()
    _, kwargs = message.answer.call_args
    assert "reply_markup" in kwargs


# === Тесты /status ===


async def test_status_no_bots(db_session: AsyncSession) -> None:
    """/status без ботов отправляет сообщение 'нет ботов'."""
    from app.modules.telegram.handlers.status import status_command

    user = await _create_user(db_session)
    message = _make_message()
    await status_command(message, db_session, user.id)

    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "нет ботов" in args[0].lower() or "Нет ботов" in args[0]


async def test_pnl_no_bots(db_session: AsyncSession) -> None:
    """/pnl без ботов отправляет сообщение 'нет ботов'."""
    from app.modules.telegram.handlers.status import pnl_command

    user = await _create_user(db_session)
    message = _make_message()
    await pnl_command(message, db_session, user.id)

    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "нет" in args[0].lower()


async def test_positions_no_bots(db_session: AsyncSession) -> None:
    """/positions без ботов отправляет сообщение 'нет ботов'."""
    from app.modules.telegram.handlers.status import positions_command

    user = await _create_user(db_session)
    message = _make_message()
    await positions_command(message, db_session, user.id)

    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "нет" in args[0].lower()


async def test_balance_command() -> None:
    """/balance предлагает открыть платформу."""
    from app.modules.telegram.handlers.status import balance_command

    user_id = uuid.uuid4()
    message = _make_message()
    # balance_command не использует session напрямую
    db = AsyncMock(spec=AsyncSession)
    await balance_command(message, db, user_id)

    message.answer.assert_called_once()
    _, kwargs = message.answer.call_args
    assert "reply_markup" in kwargs


# === Тесты /admin ===


async def test_admin_command(db_session: AsyncSession) -> None:
    """/admin показывает панель с кнопками."""
    from app.modules.telegram.handlers.admin import admin_command

    user = await _create_user(db_session, role=UserRole.ADMIN)
    message = _make_message()
    await admin_command(message, db_session, user.id)

    message.answer.assert_called_once()
    args, kwargs = message.answer.call_args
    assert "администратора" in args[0].lower()
    assert "reply_markup" in kwargs


async def test_users_command(db_session: AsyncSession) -> None:
    """/users показывает статистику пользователей."""
    from app.modules.telegram.handlers.admin import users_command

    admin = await _create_user(db_session, role=UserRole.ADMIN)
    # Создаём несколько обычных пользователей
    await _create_user(db_session)
    await _create_user(db_session)
    await db_session.flush()

    message = _make_message()
    await users_command(message, db_session, admin.id)

    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "Пользователей" in args[0]


async def test_logs_command(db_session: AsyncSession) -> None:
    """/logs показывает заглушку с перенаправлением."""
    from app.modules.telegram.handlers.admin import logs_command

    user = await _create_user(db_session, role=UserRole.ADMIN)
    message = _make_message()
    await logs_command(message, db_session, user.id)

    message.answer.assert_called_once()
    args, _ = message.answer.call_args
    assert "веб-панели" in args[0]


# === Тесты callbacks ===


async def test_callback_cancel() -> None:
    """Кнопка 'Отмена' убирает клавиатуру."""
    from app.modules.telegram.handlers.callbacks import callback_cancel

    query = _make_callback("cancel")
    await callback_cancel(query)

    query.message.edit_reply_markup.assert_called_once_with(reply_markup=None)
    query.answer.assert_called_once()


async def test_callback_bot_start_not_found(db_session: AsyncSession) -> None:
    """Callback bot_start с несуществующим ботом отвечает ошибкой."""
    from app.modules.telegram.handlers.callbacks import callback_bot_start

    user = await _create_user(db_session)
    fake_bot_id = str(uuid.uuid4())
    query = _make_callback(f"bot_start:{fake_bot_id}")

    await callback_bot_start(query, db_session, user.id)

    query.answer.assert_called_once()
    _, kwargs = query.answer.call_args
    assert kwargs.get("show_alert") is True


async def test_callback_bot_stop_not_found(db_session: AsyncSession) -> None:
    """Callback bot_stop с несуществующим ботом отвечает ошибкой."""
    from app.modules.telegram.handlers.callbacks import callback_bot_stop

    user = await _create_user(db_session)
    fake_bot_id = str(uuid.uuid4())
    query = _make_callback(f"bot_stop:{fake_bot_id}")

    await callback_bot_stop(query, db_session, user.id)

    query.answer.assert_called_once()
    _, kwargs = query.answer.call_args
    assert kwargs.get("show_alert") is True


async def test_callback_close_pos_invalid_uuid(db_session: AsyncSession) -> None:
    """Callback close_pos с невалидным UUID отвечает ошибкой."""
    from app.modules.telegram.handlers.callbacks import callback_close_position

    user = await _create_user(db_session)
    query = _make_callback("close_pos:not-a-uuid")

    await callback_close_position(query, db_session, user.id)

    query.answer.assert_called_once()
    _, kwargs = query.answer.call_args
    assert kwargs.get("show_alert") is True


async def test_callback_admin_health(db_session: AsyncSession) -> None:
    """Callback admin_health выполняет health check и отвечает."""
    from app.modules.telegram.handlers.callbacks import callback_admin_health

    user = await _create_user(db_session, role=UserRole.ADMIN)
    query = _make_callback("admin_health")

    with patch("app.redis.pool") as mock_redis:
        mock_redis.ping = AsyncMock(return_value=True)
        await callback_admin_health(query, db_session, user.id)

    query.answer.assert_called_once()
    query.message.answer.assert_called_once()
    args, _ = query.message.answer.call_args
    assert "Health Check" in args[0]


async def test_callback_admin_logs(db_session: AsyncSession) -> None:
    """Callback admin_logs отвечает заглушкой."""
    from app.modules.telegram.handlers.callbacks import callback_admin_logs

    query = _make_callback("admin_logs")
    await callback_admin_logs(query)

    query.answer.assert_called_once()
    query.message.answer.assert_called_once()


async def test_callback_admin_users(db_session: AsyncSession) -> None:
    """Callback admin_users выводит статистику."""
    from app.modules.telegram.handlers.callbacks import callback_admin_users

    user = await _create_user(db_session, role=UserRole.ADMIN)
    query = _make_callback("admin_users")

    await callback_admin_users(query, db_session, user.id)

    query.answer.assert_called_once()
    query.message.answer.assert_called_once()
    args, _ = query.message.answer.call_args
    assert "Пользователи" in args[0]
