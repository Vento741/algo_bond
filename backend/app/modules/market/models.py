"""Модели рыночных данных: OHLCVCandle, TradingPair."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, Index, Numeric, String
from sqlalchemy import UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OHLCVCandle(Base):
    """Свеча OHLCV. Индексируется по (symbol, timeframe, open_time)."""

    __tablename__ = "ohlcv_candles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30))
    timeframe: Mapped[str] = mapped_column(String(10))
    open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    open: Mapped[Decimal] = mapped_column(Numeric)
    high: Mapped[Decimal] = mapped_column(Numeric)
    low: Mapped[Decimal] = mapped_column(Numeric)
    close: Mapped[Decimal] = mapped_column(Numeric)
    volume: Mapped[Decimal] = mapped_column(Numeric)

    __table_args__ = (
        Index("ix_ohlcv_symbol_tf_time", "symbol", "timeframe", "open_time", unique=True),
    )


class CandleSyncState(Base):
    """Состояние backfill исторических свечей для пары/таймфрейма."""

    __tablename__ = "candle_sync_state"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30))
    timeframe: Mapped[str] = mapped_column(String(10))
    oldest_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    newest_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    backfill_status: Mapped[str] = mapped_column(String(20), default="pending")
    backfill_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    backfill_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_sync_symbol_tf", "symbol", "timeframe", unique=True),
    )


class TradingPair(Base):
    """Торговая пара Bybit Linear USDT-M."""

    __tablename__ = "trading_pairs"

    id: Mapped[uuid.UUID] = mapped_column(SA_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    base_currency: Mapped[str] = mapped_column(String(20))
    quote_currency: Mapped[str] = mapped_column(String(10))
    tick_size: Mapped[Decimal] = mapped_column(Numeric, default=0)
    qty_step: Mapped[Decimal] = mapped_column(Numeric, default=0)
    min_qty: Mapped[Decimal] = mapped_column(Numeric, default=0)
    max_qty: Mapped[Decimal] = mapped_column(Numeric, default=0)
    min_notional: Mapped[Decimal] = mapped_column(Numeric, default=0)
    max_leverage: Mapped[Decimal] = mapped_column(Numeric, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    category: Mapped[str] = mapped_column(String(20), default="linear")
    status: Mapped[str] = mapped_column(String(20), default="Trading")
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
