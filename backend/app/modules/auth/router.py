"""API-эндпоинты модуля auth."""

import uuid

from fastapi import APIRouter, Depends, Request
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import CredentialsException
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    AccessRequestCreate,
    AccessRequestResponse,
    ExchangeAccountCreate,
    ExchangeAccountResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    UserUpdateRequest,
)
from app.modules.auth.service import AuthService
from app.core.rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("3/minute")
async def register(
    request: Request,
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Регистрация нового пользователя."""
    service = AuthService(db)
    return await service.register(data)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Вход: email + пароль → JWT-токены."""
    service = AuthService(db)
    return await service.login(data.email, data.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Обновить access token по refresh token."""
    try:
        payload = decode_token(data.refresh_token)
        user_id_str: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id_str is None or token_type != "refresh":
            raise CredentialsException("Невалидный refresh token")
    except JWTError:
        raise CredentialsException("Невалидный refresh token")

    service = AuthService(db)
    user = await service.get_user_by_id(uuid.UUID(user_id_str))

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )


@router.post("/access-request", response_model=AccessRequestResponse, status_code=201)
@limiter.limit("5/hour")
async def create_access_request(
    request: Request,
    data: AccessRequestCreate,
    db: AsyncSession = Depends(get_db),
) -> AccessRequestResponse:
    """Отправить заявку на получение доступа к платформе."""
    service = AuthService(db)
    await service.create_access_request(data)
    return AccessRequestResponse(message="Заявка отправлена", status="pending")


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
) -> User:
    """Получить данные текущего пользователя."""
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Обновить профиль текущего пользователя."""
    service = AuthService(db)
    return await service.update_user(user, username=data.username)


# === Exchange Accounts ===

@router.post("/exchange-accounts", response_model=ExchangeAccountResponse, status_code=201)
async def create_exchange_account(
    data: ExchangeAccountCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExchangeAccountResponse:
    """Привязать аккаунт биржи."""
    service = AuthService(db)
    account = await service.create_exchange_account(user.id, data)
    return account


@router.get("/exchange-accounts", response_model=list[ExchangeAccountResponse])
async def list_exchange_accounts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ExchangeAccountResponse]:
    """Список привязанных аккаунтов бирж."""
    service = AuthService(db)
    return await service.get_exchange_accounts(user.id)


@router.delete("/exchange-accounts/{account_id}", status_code=204)
async def delete_exchange_account(
    account_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить привязку к бирже."""
    service = AuthService(db)
    await service.delete_exchange_account(user.id, account_id)


# === User Settings ===

@router.get("/settings", response_model=UserSettingsResponse)
async def get_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsResponse:
    """Получить настройки пользователя."""
    service = AuthService(db)
    return await service.get_user_settings(user.id)


@router.patch("/settings", response_model=UserSettingsResponse)
async def update_settings(
    data: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsResponse:
    """Обновить настройки пользователя."""
    service = AuthService(db)
    return await service.update_user_settings(user.id, data)
