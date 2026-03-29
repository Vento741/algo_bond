"""Бизнес-логика модуля auth."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, CredentialsException, NotFoundException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    encrypt_value,
    hash_password,
    verify_password,
)
from app.modules.auth.models import ExchangeAccount, User, UserSettings
from app.modules.auth.schemas import (
    ExchangeAccountCreate,
    RegisterRequest,
    TokenResponse,
    UserSettingsUpdate,
)


class AuthService:
    """Сервис аутентификации и управления пользователями."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register(self, data: RegisterRequest) -> User:
        """Регистрация нового пользователя."""
        existing = await self.db.execute(
            select(User).where(User.email == data.email)
        )
        if existing.scalar_one_or_none():
            raise ConflictException("Пользователь с таким email уже существует")

        user = User(
            email=data.email,
            username=data.username,
            hashed_password=hash_password(data.password),
        )
        self.db.add(user)
        await self.db.flush()

        # Создать дефолтные настройки
        user_settings = UserSettings(user_id=user.id)
        self.db.add(user_settings)
        await self.db.flush()
        await self.db.commit()

        return user

    async def login(self, email: str, password: str) -> TokenResponse:
        """Аутентификация: email + пароль → JWT-токены."""
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.hashed_password):
            raise CredentialsException("Неверный email или пароль")

        if not user.is_active:
            raise CredentialsException("Аккаунт деактивирован")

        return TokenResponse(
            access_token=create_access_token({"sub": str(user.id)}),
            refresh_token=create_refresh_token({"sub": str(user.id)}),
        )

    async def get_user_by_id(self, user_id: uuid.UUID) -> User:
        """Получить пользователя по ID."""
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("Пользователь не найден")
        return user

    async def update_user(self, user: User, username: str | None = None) -> User:
        """Обновить профиль пользователя."""
        if username is not None:
            user.username = username
        await self.db.flush()
        await self.db.commit()
        return user

    # === Exchange Accounts ===

    async def create_exchange_account(
        self, user_id: uuid.UUID, data: ExchangeAccountCreate
    ) -> ExchangeAccount:
        """Создать привязку к бирже (ключи шифруются)."""
        account = ExchangeAccount(
            user_id=user_id,
            exchange=data.exchange,
            label=data.label,
            api_key_encrypted=encrypt_value(data.api_key),
            api_secret_encrypted=encrypt_value(data.api_secret),
            is_testnet=data.is_testnet,
        )
        self.db.add(account)
        await self.db.flush()
        await self.db.commit()
        return account

    async def get_exchange_accounts(self, user_id: uuid.UUID) -> list[ExchangeAccount]:
        """Список аккаунтов бирж пользователя."""
        result = await self.db.execute(
            select(ExchangeAccount).where(ExchangeAccount.user_id == user_id)
        )
        return list(result.scalars().all())

    async def delete_exchange_account(
        self, user_id: uuid.UUID, account_id: uuid.UUID
    ) -> None:
        """Удалить привязку к бирже."""
        result = await self.db.execute(
            select(ExchangeAccount).where(
                ExchangeAccount.id == account_id,
                ExchangeAccount.user_id == user_id,
            )
        )
        account = result.scalar_one_or_none()
        if not account:
            raise NotFoundException("Аккаунт биржи не найден")
        await self.db.delete(account)
        await self.db.commit()

    # === User Settings ===

    async def get_user_settings(self, user_id: uuid.UUID) -> UserSettings:
        """Получить настройки пользователя."""
        result = await self.db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            raise NotFoundException("Настройки не найдены")
        return settings

    async def update_user_settings(
        self, user_id: uuid.UUID, data: UserSettingsUpdate
    ) -> UserSettings:
        """Обновить настройки пользователя."""
        settings = await self.get_user_settings(user_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(settings, field, value)
        await self.db.flush()
        await self.db.commit()
        return settings
