"""Модели бэктестирования: BacktestRun, BacktestResult."""

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# === Enums ===


class BacktestStatus(str, enum.Enum):
    """Статус запуска бэктеста."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# === Models ===


class BacktestRun(Base):
    """Запуск бэктеста: параметры и статус."""

    __tablename__ = "backtest_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    strategy_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("strategy_configs.id", ondelete="CASCADE"), index=True
    )
    symbol: Mapped[str] = mapped_column(String(30))
    timeframe: Mapped[str] = mapped_column(String(10))
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    initial_capital: Mapped[Decimal] = mapped_column(
        Numeric, default=Decimal("100")
    )
    status: Mapped[BacktestStatus] = mapped_column(
        Enum(BacktestStatus, name="backtest_status"),
        default=BacktestStatus.PENDING,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи
    result: Mapped["BacktestResult | None"] = relationship(
        back_populates="run", uselist=False, cascade="all, delete-orphan"
    )


class BacktestResult(Base):
    """Результаты бэктеста: метрики, equity curve, лог сделок."""

    __tablename__ = "backtest_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("backtest_runs.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    total_trades: Mapped[int] = mapped_column(Integer, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, default=0)
    win_rate: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    profit_factor: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    total_pnl: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    total_pnl_pct: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    max_drawdown: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    sharpe_ratio: Mapped[Decimal] = mapped_column(Numeric, default=Decimal("0"))
    equity_curve: Mapped[dict] = mapped_column(JSONB, default=list)
    trades_log: Mapped[dict] = mapped_column(JSONB, default=list)

    # Связи
    run: Mapped["BacktestRun"] = relationship(back_populates="result")
