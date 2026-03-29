"""FastAPI dependencies модуля auth."""

import uuid

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import CredentialsException
from app.core.security import decode_token
from app.database import get_db
from app.modules.auth.models import User
from app.modules.auth.service import AuthService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency: текущий аутентифицированный пользователь."""
    try:
        payload = decode_token(token)
        user_id_str: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id_str is None or token_type != "access":
            raise CredentialsException()
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        raise CredentialsException()

    service = AuthService(db)
    user = await service.get_user_by_id(user_id)

    if not user.is_active:
        raise CredentialsException("Аккаунт деактивирован")

    return user


async def get_current_active_user(
    user: User = Depends(get_current_user),
) -> User:
    """Dependency: активный пользователь (is_active=True)."""
    if not user.is_active:
        raise CredentialsException("Аккаунт деактивирован")
    return user
