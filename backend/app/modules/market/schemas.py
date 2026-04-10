"""Pydantic v2 схемы модуля market."""

from pydantic import BaseModel, ConfigDict


class CandleResponse(BaseModel):
    """Ответ — одна свеча."""
    model_config = ConfigDict(from_attributes=True)
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class CandlesPageResponse(BaseModel):
    """Страница свечей с пагинацией."""
    candles: list[CandleResponse]
    has_more: bool
    backfill_status: str


class TickerResponse(BaseModel):
    """Ответ — текущий тикер."""
    symbol: str
    last_price: float
    mark_price: float
    volume_24h: float
    high_24h: float
    low_24h: float
    funding_rate: float
    bid1_price: float
    ask1_price: float


class SymbolInfoResponse(BaseModel):
    """Ответ — информация об инструменте."""
    symbol: str
    tick_size: float
    qty_step: float
    min_qty: float
    max_qty: float
    min_notional: float
    max_leverage: float


class WalletBalanceResponse(BaseModel):
    """Ответ — баланс кошелька."""
    coin: str
    wallet_balance: float
    available: float
    equity: float
    unrealized_pnl: float


class TradingPairResponse(BaseModel):
    """Ответ — торговая пара."""
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    base_currency: str
    quote_currency: str
    tick_size: float
    qty_step: float
    min_qty: float
    max_qty: float
    min_notional: float
    max_leverage: float
    is_active: bool
    status: str
