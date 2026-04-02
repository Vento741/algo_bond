"""Pydantic v2 схемы модуля trading."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.trading.models import (
    BotLogLevel,
    BotMode,
    BotStatus,
    OrderSide,
    OrderStatus,
    OrderType,
    PositionSide,
    PositionStatus,
    SignalDirection,
)


# === Bot ===


class BotCreate(BaseModel):
    """Создание торгового бота."""
    strategy_config_id: uuid.UUID
    exchange_account_id: uuid.UUID
    mode: BotMode = BotMode.DEMO


class BotResponse(BaseModel):
    """Ответ — торговый бот (все поля)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    strategy_config_id: uuid.UUID
    exchange_account_id: uuid.UUID
    status: BotStatus
    mode: BotMode
    total_pnl: Decimal
    total_trades: int
    win_rate: Decimal
    max_pnl: Decimal
    max_drawdown: Decimal
    started_at: datetime | None
    stopped_at: datetime | None
    updated_at: datetime | None
    created_at: datetime


class BotStatusResponse(BaseModel):
    """Ответ — краткий статус бота."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: BotStatus
    total_pnl: Decimal
    total_trades: int
    win_rate: Decimal


# === Order ===


class OrderResponse(BaseModel):
    """Ответ — ордер."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bot_id: uuid.UUID
    exchange_order_id: str | None
    symbol: str
    side: OrderSide
    type: OrderType
    quantity: Decimal
    price: Decimal
    filled_price: Decimal | None
    status: OrderStatus
    filled_at: datetime | None
    created_at: datetime


# === Position ===


class PositionResponse(BaseModel):
    """Ответ — позиция."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bot_id: uuid.UUID
    symbol: str
    side: PositionSide
    entry_price: Decimal
    quantity: Decimal
    original_quantity: Decimal | None
    stop_loss: Decimal
    take_profit: Decimal
    trailing_stop: Decimal | None
    unrealized_pnl: Decimal
    realized_pnl: Decimal | None
    max_pnl: Decimal
    min_pnl: Decimal
    current_price: Decimal | None
    max_price: Decimal | None
    min_price: Decimal | None
    status: PositionStatus
    opened_at: datetime
    closed_at: datetime | None
    updated_at: datetime | None
    # Multi-TP info (обогащается из сигнала)
    tp1_price: Decimal | None = None
    tp1_hit: bool = False
    tp2_price: Decimal | None = None


# === TradeSignal ===


class TradeSignalResponse(BaseModel):
    """Ответ — торговый сигнал."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bot_id: uuid.UUID
    strategy_config_id: uuid.UUID
    symbol: str
    direction: SignalDirection
    signal_strength: Decimal
    knn_class: str
    knn_confidence: Decimal
    indicators_snapshot: dict
    was_executed: bool
    created_at: datetime


# === BotLog ===


class BotLogResponse(BaseModel):
    """Ответ — лог исполнения бота."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bot_id: uuid.UUID
    level: BotLogLevel
    message: str
    details: dict | None
    created_at: datetime
