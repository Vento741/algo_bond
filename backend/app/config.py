"""Конфигурация приложения AlgoBond."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Загружаются из переменных окружения."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Приложение
    app_name: str = "AlgoBond"
    app_env: str = "development"
    app_debug: bool = False
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_url: str = "http://localhost:5173"

    # База данных
    database_url: str = "postgresql+asyncpg://algobond:changeme@db:5432/algobond"

    # Redis
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    # JWT
    jwt_secret_key: str = "changeme_jwt_secret_at_least_32_chars"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # Шифрование API-ключей бирж
    encryption_key: str = "changeme_fernet_key_base64"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Регистрация
    invite_code_required: bool = True

    # Bybit
    bybit_api_key: str = ""
    bybit_api_secret: str = ""
    bybit_demo: bool = False


settings = Settings()
