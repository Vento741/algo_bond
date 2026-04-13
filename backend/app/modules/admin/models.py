"""Модели модуля admin."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Константы ключей system_settings
SK_APP_VERSION = "app_version"
DEFAULT_APP_VERSION = "0.0.0"


class SystemSetting(Base):
    """Key-value хранилище системных настроек платформы."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
