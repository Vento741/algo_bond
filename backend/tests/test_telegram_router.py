"""Тесты FastAPI роутера Telegram: webhook, deep link, webapp auth, настройки."""

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import User, UserRole
from app.modules.telegram.service import TelegramService

pytestmark = pytest.mark.asyncio


async def _create_user(db: AsyncSession, role: UserRole = UserRole.USER) -> User:
    """Создать тестового пользователя."""
    user = User(
        id=uuid.uuid4(),
        email=f"tgrouter_{uuid.uuid4().hex[:8]}@test.com",
        username=f"tgr_{uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("Test123"),
        is_active=True,
        role=role,
    )
    db.add(user)
    await db.flush()
    return user


def _auth_headers(user: User) -> dict[str, str]:
    """Заголовки авторизации для пользователя."""
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


# === POST /api/telegram/link ===


async def test_create_deep_link_authenticated(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Аутентифицированный пользователь получает deep link URL."""
    user = await _create_user(db_session)
    headers = _auth_headers(user)

    response = await client.post("/api/telegram/link", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert "deep_link_url" in data
    assert "token" in data
    assert data["expires_in_seconds"] == 900
    assert "t.me/algo_bond_bot?start=" in data["deep_link_url"]


async def test_create_deep_link_unauthenticated(client: AsyncClient) -> None:
    """Без токена авторизации возвращает 401."""
    response = await client.post("/api/telegram/link")
    assert response.status_code == 401


# === GET /api/telegram/link ===


async def test_get_link_status_not_linked(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Пользователь без привязки получает is_linked: false."""
    user = await _create_user(db_session)
    headers = _auth_headers(user)

    response = await client.get("/api/telegram/link", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["is_linked"] is False
    assert data["telegram_username"] is None


async def test_get_link_status_linked(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Пользователь с привязкой получает is_linked: true и username."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)
    token_obj = await service.generate_deep_link_token(user.id)
    await service.link_telegram(
        token=token_obj.token,
        telegram_id=987654321,
        telegram_username="linked_user",
        chat_id=987654321,
    )

    headers = _auth_headers(user)
    response = await client.get("/api/telegram/link", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["is_linked"] is True
    assert data["telegram_username"] == "linked_user"


# === DELETE /api/telegram/link ===


async def test_unlink_telegram_success(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Отвязка привязанного Telegram успешна."""
    user = await _create_user(db_session)
    service = TelegramService(db_session)
    token_obj = await service.generate_deep_link_token(user.id)
    await service.link_telegram(
        token=token_obj.token,
        telegram_id=111222333,
        telegram_username="to_unlink",
        chat_id=111222333,
    )

    headers = _auth_headers(user)
    response = await client.delete("/api/telegram/link", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True


async def test_unlink_telegram_not_linked(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Отвязка без привязки возвращает 404."""
    user = await _create_user(db_session)
    headers = _auth_headers(user)

    response = await client.delete("/api/telegram/link", headers=headers)

    assert response.status_code == 404


# === POST /api/telegram/webapp/auth ===


async def test_webapp_auth_invalid_init_data(client: AsyncClient) -> None:
    """Невалидные initData возвращают 401."""
    with patch("app.modules.telegram.router.validate_init_data", return_value=False):
        with patch("app.modules.telegram.router.settings") as mock_settings:
            mock_settings.telegram_bot_token = "fake_token"
            response = await client.post(
                "/api/telegram/webapp/auth",
                json={"init_data": "fake_invalid_data"},
            )
    assert response.status_code == 401


async def test_webapp_auth_no_bot_token(client: AsyncClient) -> None:
    """При отсутствии токена бота возвращает 503."""
    with patch("app.modules.telegram.router.settings") as mock_settings:
        mock_settings.telegram_bot_token = ""
        mock_settings.telegram_admin_chat_id = 0
        response = await client.post(
            "/api/telegram/webapp/auth",
            json={"init_data": "some_data"},
        )
    assert response.status_code == 503


# === POST /api/telegram/webhook ===


async def test_webhook_invalid_secret(client: AsyncClient) -> None:
    """Неверный секретный токен возвращает 403."""
    with patch("app.modules.telegram.router.settings") as mock_settings:
        mock_settings.telegram_webhook_secret = "correct_secret"
        response = await client.post(
            "/api/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong_secret"},
        )
    assert response.status_code == 403


async def test_webhook_missing_secret(client: AsyncClient) -> None:
    """Отсутствие секретного токена возвращает 403."""
    with patch("app.modules.telegram.router.settings") as mock_settings:
        mock_settings.telegram_webhook_secret = "some_secret"
        response = await client.post(
            "/api/telegram/webhook",
            json={"update_id": 1},
        )
    assert response.status_code == 403


async def test_webhook_no_secret_configured(client: AsyncClient) -> None:
    """Если webhook secret не настроен, возвращает 403."""
    with patch("app.modules.telegram.router.settings") as mock_settings:
        mock_settings.telegram_webhook_secret = ""
        response = await client.post(
            "/api/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": ""},
        )
    assert response.status_code == 403


async def test_webhook_valid_secret_no_bot(client: AsyncClient) -> None:
    """Валидный секрет, но бот не инициализирован - возвращает ok."""
    with patch("app.modules.telegram.router.settings") as mock_settings:
        mock_settings.telegram_webhook_secret = "test_secret"
        with patch("app.modules.telegram.bot.bot", None):
            with patch("app.modules.telegram.bot.dp", None):
                response = await client.post(
                    "/api/telegram/webhook",
                    json={"update_id": 1},
                    headers={"X-Telegram-Bot-Api-Secret-Token": "test_secret"},
                )
    assert response.status_code == 200
    assert response.json()["ok"] is True


# === GET /api/telegram/settings ===


async def test_get_settings_no_prefs(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Пользователь без настроек получает дефолтные значения."""
    user = await _create_user(db_session)
    headers = _auth_headers(user)

    response = await client.get("/api/telegram/settings", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert "telegram_enabled" in data
    assert data["telegram_enabled"] is False


async def test_get_settings_unauthenticated(client: AsyncClient) -> None:
    """Без авторизации возвращает 401."""
    response = await client.get("/api/telegram/settings")
    assert response.status_code == 401


# === PATCH /api/telegram/settings ===


async def test_update_settings(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Обновление настроек Telegram-уведомлений."""
    user = await _create_user(db_session)
    headers = _auth_headers(user)

    response = await client.patch(
        "/api/telegram/settings",
        json={"telegram_enabled": True, "bots_telegram": False},
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["telegram_enabled"] is True
    assert data["bots_telegram"] is False


# === POST /api/telegram/admin/notify ===


async def test_admin_notify_unauthorized(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Обычный пользователь не может отправлять admin notify."""
    user = await _create_user(db_session)
    headers = _auth_headers(user)

    response = await client.post(
        "/api/telegram/admin/notify",
        json={"message": "Test"},
        headers=headers,
    )
    assert response.status_code == 403


async def test_admin_notify_no_chat_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Admin без настроенного chat_id получает 503."""
    admin = await _create_user(db_session, role=UserRole.ADMIN)
    headers = _auth_headers(admin)

    with patch("app.modules.telegram.router.settings") as mock_settings:
        mock_settings.telegram_admin_chat_id = 0
        response = await client.post(
            "/api/telegram/admin/notify",
            json={"message": "Hello admin"},
            headers=headers,
        )
    assert response.status_code == 503
