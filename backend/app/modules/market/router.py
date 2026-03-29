"""API-эндпоинты модуля market."""

from fastapi import APIRouter, Depends, Query

from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.market.schemas import (
    CandleResponse, SymbolInfoResponse, TickerResponse, WalletBalanceResponse,
)
from app.modules.market.service import MarketService

router = APIRouter(prefix="/api/market", tags=["market"])


def get_market_service() -> MarketService:
    """Dependency: MarketService."""
    return MarketService()


@router.get("/klines/{symbol}", response_model=list[CandleResponse])
async def get_klines(
    symbol: str,
    interval: str = Query("5", description="1,5,15,60,240,D"),
    limit: int = Query(200, ge=1, le=1000),
    service: MarketService = Depends(get_market_service),
) -> list[CandleResponse]:
    """Получить OHLCV свечи для символа."""
    candles = await service.get_klines(symbol, interval, limit)
    return [CandleResponse(**c) for c in candles]


@router.get("/ticker/{symbol}", response_model=TickerResponse)
async def get_ticker(
    symbol: str,
    service: MarketService = Depends(get_market_service),
) -> TickerResponse:
    """Получить текущий тикер символа."""
    data = await service.get_ticker(symbol)
    return TickerResponse(**data)


@router.get("/symbol/{symbol}", response_model=SymbolInfoResponse)
async def get_symbol_info(
    symbol: str,
    service: MarketService = Depends(get_market_service),
) -> SymbolInfoResponse:
    """Получить спецификацию торгового инструмента."""
    data = await service.get_symbol_info(symbol)
    return SymbolInfoResponse(**data)


@router.get("/balance", response_model=WalletBalanceResponse)
async def get_balance(
    coin: str = Query("USDT"),
    user: User = Depends(get_current_user),
    service: MarketService = Depends(get_market_service),
) -> WalletBalanceResponse:
    """Получить баланс кошелька (требует авторизации)."""
    data = await service.get_wallet_balance(coin)
    return WalletBalanceResponse(**data)
