"""API-эндпоинты модуля trading."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.trading.schemas import (
    BotCreate,
    BotLogResponse,
    BotResponse,
    OrderResponse,
    PositionResponse,
    TradeSignalResponse,
)
from app.modules.trading.service import TradingService

router = APIRouter(prefix="/api/trading", tags=["trading"])


# === Bots ===


@router.post("/bots", response_model=BotResponse, status_code=201)
async def create_bot(
    data: BotCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BotResponse:
    """Создать торгового бота."""
    service = TradingService(db)
    return await service.create_bot(user.id, data)


@router.get("/bots", response_model=list[BotResponse])
async def list_bots(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[BotResponse]:
    """Список моих ботов."""
    service = TradingService(db)
    return await service.list_user_bots(user.id, limit=limit, offset=offset)


@router.get("/bots/{bot_id}", response_model=BotResponse)
async def get_bot(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BotResponse:
    """Получить детали бота."""
    service = TradingService(db)
    return await service.get_bot(bot_id, user.id)


@router.post("/bots/{bot_id}/start", response_model=BotResponse)
async def start_bot(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BotResponse:
    """Запустить бота."""
    service = TradingService(db)
    return await service.start_bot(bot_id, user.id)


@router.post("/bots/{bot_id}/stop", response_model=BotResponse)
async def stop_bot(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BotResponse:
    """Остановить бота."""
    service = TradingService(db)
    return await service.stop_bot(bot_id, user.id)


@router.delete("/bots/{bot_id}", status_code=204)
async def delete_bot(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить бота (только если остановлен)."""
    service = TradingService(db)
    await service.delete_bot(bot_id, user.id)


# === Orders ===


@router.get("/bots/{bot_id}/orders", response_model=list[OrderResponse])
async def get_bot_orders(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[OrderResponse]:
    """Ордера бота."""
    service = TradingService(db)
    return await service.get_bot_orders(bot_id, user.id, limit=limit, offset=offset)


# === Positions ===


@router.get("/bots/{bot_id}/positions", response_model=list[PositionResponse])
async def get_bot_positions(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[PositionResponse]:
    """Позиции бота."""
    service = TradingService(db)
    return await service.get_bot_positions(bot_id, user.id, limit=limit, offset=offset)


# === Signals ===


@router.get("/bots/{bot_id}/signals", response_model=list[TradeSignalResponse])
async def get_bot_signals(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[TradeSignalResponse]:
    """Торговые сигналы бота."""
    service = TradingService(db)
    return await service.get_bot_signals(bot_id, user.id, limit=limit, offset=offset)


# === Logs ===


@router.get("/bots/{bot_id}/logs", response_model=list[BotLogResponse])
async def get_bot_logs(
    bot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[BotLogResponse]:
    """Логи исполнения бота."""
    service = TradingService(db)
    return await service.get_bot_logs(bot_id, user.id, limit=limit, offset=offset)
