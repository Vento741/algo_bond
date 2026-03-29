"""Pydantic v2 схемы модуля backtest."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BacktestCreate(BaseModel):
    """Запрос на создание бэктеста."""
    strategy_config_id: uuid.UUID
    symbol: str = Field(default="RIVERUSDT", max_length=30)
    timeframe: str = Field(default="5", max_length=10)
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal = Field(default=Decimal("100"), gt=0)


class BacktestRunResponse(BaseModel):
    """Ответ — запуск бэктеста."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    strategy_config_id: uuid.UUID
    symbol: str
    timeframe: str
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal
    status: str
    progress: int
    error_message: str | None = None
    created_at: datetime


class BacktestResultResponse(BaseModel):
    """Ответ — результаты бэктеста."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: Decimal
    profit_factor: Decimal
    total_pnl: Decimal
    total_pnl_pct: Decimal
    max_drawdown: Decimal
    sharpe_ratio: Decimal
    equity_curve: list
    trades_log: list
