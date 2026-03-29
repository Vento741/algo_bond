"""Безопасность: JWT-токены, хеширование паролей, шифрование API-ключей."""

from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# === Хеширование паролей ===

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Хешировать пароль bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверить пароль по хешу."""
    return pwd_context.verify(plain_password, hashed_password)


# === JWT-токены ===

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Создать access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict) -> str:
    """Создать refresh token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Декодировать и верифицировать JWT-токен. Выбрасывает JWTError при невалидном токене."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


# === Шифрование API-ключей бирж (Fernet) ===

def get_fernet() -> Fernet:
    """Получить экземпляр Fernet для шифрования."""
    return Fernet(settings.encryption_key.encode())


def encrypt_value(value: str) -> str:
    """Зашифровать строку (API-ключ, секрет)."""
    return get_fernet().encrypt(value.encode()).decode()


def decrypt_value(encrypted_value: str) -> str:
    """Расшифровать строку."""
    return get_fernet().decrypt(encrypted_value.encode()).decode()
