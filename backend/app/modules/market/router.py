"""API-эндпоинты модуля market."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.core.security import decrypt_value
from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import ExchangeAccount, User
from app.modules.market.bybit_client import BybitClient
from app.modules.market.schemas import (
    CandleResponse, SymbolInfoResponse, TickerResponse, TradingPairResponse,
    WalletBalanceResponse,
)
from app.modules.market.service import MarketService

router = APIRouter(prefix="/api/market", tags=["market"])


def get_market_service() -> MarketService:
    """Dependency: MarketService (без API-ключей, для публичных данных)."""
    return MarketService()


@router.get("/pairs", response_model=list[TradingPairResponse])
async def get_trading_pairs(
    search: str | None = Query(None, description="Поиск по символу"),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> list[TradingPairResponse]:
    """Получить список торговых пар."""
    service = MarketService()
    return await service.get_active_pairs(db, search=search, include_inactive=include_inactive)


@router.get("/klines/{symbol}", response_model=list[CandleResponse])
async def get_klines(
    symbol: str,
    interval: str = Query("5", description="1,5,15,60,240,D"),
    limit: int = Query(200, ge=1, le=1000),
    start: int | None = Query(None, description="Start timestamp ms"),
    end: int | None = Query(None, description="End timestamp ms"),
    service: MarketService = Depends(get_market_service),
) -> list[CandleResponse]:
    """Получить OHLCV свечи для символа.

    Если указаны start/end — загружает ВСЕ свечи за период с пагинацией (max 20000).
    Без start/end — возвращает последние limit свечей.
    """
    if start is not None and end is not None:
        candles = await service.get_klines_range(symbol, interval, start, end)
    else:
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
    exchange_account_id: uuid.UUID = Query(...),
    coin: str = Query("USDT"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WalletBalanceResponse:
    """Получить баланс кошелька (с ключами пользователя)."""
    result = await db.execute(
        select(ExchangeAccount).where(
            ExchangeAccount.id == exchange_account_id,
            ExchangeAccount.user_id == user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise NotFoundException("Exchange account не найден")

    # is_testnet в БД означает demo mode (api-demo.bybit.com)
    client = BybitClient(
        api_key=decrypt_value(account.api_key_encrypted),
        api_secret=decrypt_value(account.api_secret_encrypted),
        demo=account.is_testnet,
    )
    service = MarketService(client=client)
    data = await service.get_wallet_balance(coin)
    return WalletBalanceResponse(**data)
