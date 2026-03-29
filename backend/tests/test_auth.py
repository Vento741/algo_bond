"""Тесты модуля auth."""

import pytest
from httpx import AsyncClient

from app.modules.auth.models import User

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
