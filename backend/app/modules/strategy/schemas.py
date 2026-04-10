"""Pydantic v2 схемы модуля strategy."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# === Strategy ===

class StrategyCreate(BaseModel):
    """Создание стратегии (admin)."""
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=200, pattern=r"^[a-z0-9_-]+$")
    engine_type: str = Field(min_length=2, max_length=50)
    description: str | None = None
    is_public: bool = True
    default_config: dict = Field(default_factory=dict)
    version: str = "1.0.0"


class StrategyResponse(BaseModel):
    """Ответ — стратегия."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    engine_type: str
    description: str | None
    is_public: bool
    author_id: uuid.UUID | None
    default_config: dict
    version: str
    created_at: datetime


class StrategyUpdate(BaseModel):
    """Обновление стратегии (admin)."""
    version: str | None = Field(None, min_length=1, max_length=20)
    description: str | None = None
    is_public: bool | None = None


class StrategyListResponse(BaseModel):
    """Ответ — краткая информация о стратегии (без default_config)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    engine_type: str
    description: str | None
    is_public: bool
    version: str


# === StrategyConfig ===

class StrategyConfigCreate(BaseModel):
    """Создание пользовательского конфига."""
    strategy_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    symbol: str = Field(default="RIVERUSDT", max_length=30)
    timeframe: str = Field(default="5", max_length=10)
    config: dict = Field(default_factory=dict)


class StrategyConfigUpdate(BaseModel):
    """Обновление конфига."""
    name: str | None = Field(None, min_length=1, max_length=200)
    symbol: str | None = Field(None, max_length=30)
    timeframe: str | None = Field(None, max_length=10)
    config: dict | None = None


class StrategyConfigResponse(BaseModel):
    """Ответ — конфиг стратегии."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    strategy_id: uuid.UUID
    name: str
    symbol: str
    timeframe: str
    config: dict
    created_at: datetime


# === Chart Signals ===

class ChartSignalResponse(BaseModel):
    """Сигнал для отображения на графике."""
    time: int  # Unix timestamp (секунды) - для маркера на графике
    direction: str  # "long" или "short"
    entry_price: float
    stop_loss: float | None = None
    take_profit: float | None = None
    tp1_price: float | None = None
    tp2_price: float | None = None
    signal_strength: float  # Confluence score 0-100
    knn_class: str  # "BULL", "BEAR", "NEUTRAL"
    knn_confidence: float
    was_executed: bool = False  # False для evaluate-only


class ChartSignalsListResponse(BaseModel):
    """Список сигналов для графика."""
    config_id: str
    symbol: str
    timeframe: str
    signals: list[ChartSignalResponse]
    cached: bool  # Результат из кэша?
    evaluated_at: str  # ISO timestamp
    error: str | None = None
