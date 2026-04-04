"""Тесты модуля auth."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import (
    AccessRequest,
    AccessRequestStatus,
    InviteCode,
    User,
    generate_invite_code,
)

pytestmark = pytest.mark.asyncio


class TestRegister:
    """Тесты регистрации."""

    async def test_register_success(self, client: AsyncClient):
        """Успешная регистрация нового пользователя."""
        response = await client.post("/api/auth/register", json={
            "email": "new@example.com",
            "username": "newuser",
            "password": "SecurePass123",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "new@example.com"
        assert data["username"] == "newuser"
        assert data["is_active"] is True
        assert data["role"] == "user"
        assert "id" in data

    async def test_register_duplicate_email(self, client: AsyncClient, test_user: User):
        """Ошибка при дублировании email."""
        response = await client.post("/api/auth/register", json={
            "email": test_user.email,
            "username": "another",
            "password": "SecurePass123",
        })
        assert response.status_code == 409

    async def test_register_short_password(self, client: AsyncClient):
        """Ошибка при коротком пароле."""
        response = await client.post("/api/auth/register", json={
            "email": "short@example.com",
            "username": "short",
            "password": "123",
        })
        assert response.status_code == 422

    async def test_register_invalid_email(self, client: AsyncClient):
        """Ошибка при невалидном email."""
        response = await client.post("/api/auth/register", json={
            "email": "not-an-email",
            "username": "bad",
            "password": "SecurePass123",
        })
        assert response.status_code == 422


class TestLogin:
    """Тесты аутентификации."""

    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Успешный логин -> получить access + refresh токены."""
        response = await client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Ошибка при неверном пароле."""
        response = await client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "WrongPassword",
        })
        assert response.status_code == 401

    async def test_login_unknown_email(self, client: AsyncClient):
        """Ошибка при несуществующем email."""
        response = await client.post("/api/auth/login", json={
            "email": "ghost@example.com",
            "password": "Anything123",
        })
        assert response.status_code == 401


class TestRefreshToken:
    """Тесты обновления токена."""

    async def test_refresh_success(self, client: AsyncClient, test_user: User):
        """Успешное обновление access token."""
        login_resp = await client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123",
        })
        refresh_token = login_resp.json()["refresh_token"]

        response = await client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert response.status_code == 200
        assert "access_token" in response.json()

    async def test_refresh_invalid_token(self, client: AsyncClient):
        """Ошибка при невалидном refresh token."""
        response = await client.post("/api/auth/refresh", json={
            "refresh_token": "invalid.token.here",
        })
        assert response.status_code == 401


class TestMe:
    """Тесты профиля пользователя."""

    async def test_get_me(self, client: AsyncClient, auth_headers: dict, test_user: User):
        """Получить данные текущего пользователя."""
        response = await client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["email"] == test_user.email

    async def test_get_me_unauthorized(self, client: AsyncClient):
        """Ошибка без авторизации."""
        response = await client.get("/api/auth/me")
        assert response.status_code == 401

    async def test_update_me(self, client: AsyncClient, auth_headers: dict):
        """Обновить username."""
        response = await client.patch("/api/auth/me", headers=auth_headers, json={
            "username": "updated_name",
        })
        assert response.status_code == 200
        assert response.json()["username"] == "updated_name"


class TestSettings:
    """Тесты настроек пользователя."""

    async def test_get_settings(self, client: AsyncClient, auth_headers: dict):
        """Получить настройки пользователя (созданы вместе с пользователем)."""
        response = await client.get("/api/auth/settings", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["default_symbol"] == "RIVERUSDT"
        assert data["timezone"] == "Europe/Moscow"


class TestAccessRequest:
    """Тесты заявки на доступ."""

    async def test_access_request_success(self, client: AsyncClient):
        """Успешная отправка заявки на доступ."""
        response = await client.post("/api/auth/access-request", json={
            "telegram": "@validuser",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["message"] == "Заявка отправлена"
        assert data["status"] == "pending"

    async def test_access_request_duplicate_pending(self, client: AsyncClient):
        """Ошибка при повторной заявке с тем же Telegram (pending)."""
        await client.post("/api/auth/access-request", json={
            "telegram": "@dupeuser",
        })
        response = await client.post("/api/auth/access-request", json={
            "telegram": "@dupeuser",
        })
        assert response.status_code == 409
        assert "уже отправлена" in response.json()["detail"]

    async def test_access_request_invalid_telegram(self, client: AsyncClient):
        """Ошибка при невалидном формате Telegram."""
        response = await client.post("/api/auth/access-request", json={
            "telegram": "no_at_sign",
        })
        assert response.status_code == 422

    async def test_access_request_too_short_telegram(self, client: AsyncClient):
        """Ошибка при слишком коротком Telegram username."""
        response = await client.post("/api/auth/access-request", json={
            "telegram": "@ab",
        })
        assert response.status_code == 422

    async def test_access_request_after_rejected(self, client: AsyncClient, db_session: AsyncSession):
        """Повторная заявка после rejected - разрешена."""
        # Создать rejected заявку напрямую в БД
        rejected = AccessRequest(
            telegram="@rejecteduser",
            status=AccessRequestStatus.REJECTED,
        )
        db_session.add(rejected)
        await db_session.commit()

        response = await client.post("/api/auth/access-request", json={
            "telegram": "@rejecteduser",
        })
        assert response.status_code == 201


class TestRegisterWithInviteCode:
    """Тесты регистрации с инвайт-кодом."""

    async def test_register_with_valid_invite_code(
        self, client: AsyncClient, db_session: AsyncSession, test_user: User,
    ):
        """Успешная регистрация с валидным инвайт-кодом."""
        # Создать инвайт-код
        code = generate_invite_code()
        invite = InviteCode(
            code=code,
            created_by=test_user.id,
            is_active=True,
        )
        db_session.add(invite)
        await db_session.commit()

        response = await client.post("/api/auth/register", json={
            "email": "invited@example.com",
            "username": "inviteduser",
            "password": "SecurePass123",
            "invite_code": code,
        })
        assert response.status_code == 201
        assert response.json()["email"] == "invited@example.com"

        # Проверить что код помечен как использованный
        await db_session.refresh(invite)
        assert invite.used_by is not None
        assert invite.used_at is not None
        assert invite.is_active is False

    async def test_register_with_invalid_invite_code(self, client: AsyncClient):
        """Ошибка при невалидном инвайт-коде."""
        from app.config import settings as app_settings
        original = app_settings.invite_code_required
        app_settings.invite_code_required = True
        try:
            response = await client.post("/api/auth/register", json={
                "email": "bad@example.com",
                "username": "baduser",
                "password": "SecurePass123",
                "invite_code": "ZZZZZZZZ",
            })
            assert response.status_code == 400
            assert "Недействительный" in response.json()["detail"]
        finally:
            app_settings.invite_code_required = original

    async def test_register_with_used_invite_code(
        self, client: AsyncClient, db_session: AsyncSession, test_user: User,
    ):
        """Ошибка при использованном инвайт-коде."""
        from app.config import settings as app_settings
        original = app_settings.invite_code_required
        app_settings.invite_code_required = True
        try:
            code = generate_invite_code()
            invite = InviteCode(
                code=code,
                created_by=test_user.id,
                used_by=test_user.id,
                used_at=datetime.now(timezone.utc),
                is_active=False,
            )
            db_session.add(invite)
            await db_session.commit()

            response = await client.post("/api/auth/register", json={
                "email": "used@example.com",
                "username": "useduser",
                "password": "SecurePass123",
                "invite_code": code,
            })
            assert response.status_code == 400
            assert "уже использован" in response.json()["detail"]
        finally:
            app_settings.invite_code_required = original

    async def test_register_with_expired_invite_code(
        self, client: AsyncClient, db_session: AsyncSession, test_user: User,
    ):
        """Ошибка при просроченном инвайт-коде."""
        from app.config import settings as app_settings
        original = app_settings.invite_code_required
        app_settings.invite_code_required = True
        try:
            code = generate_invite_code()
            invite = InviteCode(
                code=code,
                created_by=test_user.id,
                is_active=True,
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
            db_session.add(invite)
            await db_session.commit()

            response = await client.post("/api/auth/register", json={
                "email": "expired@example.com",
                "username": "expireduser",
                "password": "SecurePass123",
                "invite_code": code,
            })
            assert response.status_code == 400
            assert "истёк" in response.json()["detail"]
        finally:
            app_settings.invite_code_required = original

    async def test_register_without_invite_code_when_not_required(
        self, client: AsyncClient,
    ):
        """Регистрация без инвайт-кода когда INVITE_CODE_REQUIRED=False."""
        from app.config import settings as app_settings
        original = app_settings.invite_code_required
        app_settings.invite_code_required = False
        try:
            response = await client.post("/api/auth/register", json={
                "email": "noinvite@example.com",
                "username": "noinviteuser",
                "password": "SecurePass123",
            })
            assert response.status_code == 201
        finally:
            app_settings.invite_code_required = original


class TestConsentAuditTrail:
    """Тест аудита согласия пользователя."""

    async def test_consent_timestamp_set_on_register(
        self, client: AsyncClient, db_session: AsyncSession,
    ):
        """consent_accepted_at устанавливается при регистрации."""
        from app.config import settings as app_settings
        original = app_settings.invite_code_required
        app_settings.invite_code_required = False

        try:
            response = await client.post("/api/auth/register", json={
                "email": "consent@example.com",
                "username": "consentuser",
                "password": "SecurePass123",
            })
            assert response.status_code == 201

            # Проверить consent_accepted_at в БД
            result = await db_session.execute(
                select(User).where(User.email == "consent@example.com")
            )
            user = result.scalar_one()
            assert user.consent_accepted_at is not None
        finally:
            app_settings.invite_code_required = original
