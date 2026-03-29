"""Модели торговли: Bot, Order, Position, TradeSignal."""

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# === Enums ===


class BotStatus(str, enum.Enum):
    """Статус торгового бота."""
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class BotMode(str, enum.Enum):
    """Режим работы бота."""
    LIVE = "live"
    DEMO = "demo"


class OrderSide(str, enum.Enum):
    """Сторона ордера."""
    BUY = "buy"
    SELL = "sell"


class OrderType(str, enum.Enum):
    """Тип ордера."""
    MARKET = "market"
    LIMIT = "limit"


class OrderStatus(str, enum.Enum):
    """Статус ордера."""
    OPEN = "open"
    FILLED = "filled"
    CANCELLED = "cancelled"
    ERROR = "error"


class PositionSide(str, enum.Enum):
    """Сторона позиции."""
    LONG = "long"
    SHORT = "short"


class PositionStatus(str, enum.Enum):
    """Статус позиции."""
    OPEN = "open"
    CLOSED = "closed"


class SignalDirection(str, enum.Enum):
    """Направление торгового сигнала."""
    LONG = "long"
    SHORT = "short"


# === Models ===


class Bot(Base):
    """Торговый бот пользователя."""

    __tablename__ = "bots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    strategy_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("strategy_configs.id", ondelete="CASCADE")
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exchange_accounts.id", ondelete="CASCADE")
    )
    status: Mapped[BotStatus] = mapped_column(
        Enum(BotStatus, name="bot_status"), default=BotStatus.STOPPED
    )
    mode: Mapped[BotMode] = mapped_column(
        Enum(BotMode, name="bot_mode"), default=BotMode.DEMO
    )
    total_pnl: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    total_trades: Mapped[int] = mapped_column(Integer, default=0)
    win_rate: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    stopped_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи (однонаправленные — не модифицируем User/StrategyConfig/ExchangeAccount)
    orders: Mapped[list["Order"]] = relationship(
        back_populates="bot", cascade="all, delete-orphan"
    )
    positions: Mapped[list["Position"]] = relationship(
        back_populates="bot", cascade="all, delete-orphan"
    )
    trade_signals: Mapped[list["TradeSignal"]] = relationship(
        back_populates="bot", cascade="all, delete-orphan"
    )


class Order(Base):
    """Ордер, отправленный ботом на биржу."""

    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE")
    )
    exchange_order_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    symbol: Mapped[str] = mapped_column(String(30))
    side: Mapped[OrderSide] = mapped_column(
        Enum(OrderSide, name="order_side")
    )
    type: Mapped[OrderType] = mapped_column(
        Enum(OrderType, name="order_type")
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric)
    price: Mapped[Decimal] = mapped_column(Numeric)
    filled_price: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.OPEN
    )
    filled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи
    bot: Mapped["Bot"] = relationship(back_populates="orders")


class Position(Base):
    """Открытая/закрытая позиция бота."""

    __tablename__ = "positions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE")
    )
    symbol: Mapped[str] = mapped_column(String(30))
    side: Mapped[PositionSide] = mapped_column(
        Enum(PositionSide, name="position_side")
    )
    entry_price: Mapped[Decimal] = mapped_column(Numeric)
    quantity: Mapped[Decimal] = mapped_column(Numeric)
    stop_loss: Mapped[Decimal] = mapped_column(Numeric)
    take_profit: Mapped[Decimal] = mapped_column(Numeric)
    trailing_stop: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    realized_pnl: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    status: Mapped[PositionStatus] = mapped_column(
        Enum(PositionStatus, name="position_status"), default=PositionStatus.OPEN
    )
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Связи
    bot: Mapped["Bot"] = relationship(back_populates="positions")


class TradeSignal(Base):
    """Торговый сигнал, сгенерированный стратегией."""

    __tablename__ = "trade_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE")
    )
    strategy_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("strategy_configs.id", ondelete="CASCADE")
    )
    symbol: Mapped[str] = mapped_column(String(30))
    direction: Mapped[SignalDirection] = mapped_column(
        Enum(SignalDirection, name="signal_direction")
    )
    signal_strength: Mapped[Decimal] = mapped_column(Numeric)
    knn_class: Mapped[str] = mapped_column(String(10))
    knn_confidence: Mapped[Decimal] = mapped_column(Numeric)
    indicators_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    was_executed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи
    bot: Mapped["Bot"] = relationship(back_populates="trade_signals")
