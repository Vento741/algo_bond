"""API-эндпоинты модуля strategy."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_admin_user, get_current_user
from app.modules.auth.models import User
from app.modules.strategy.schemas import (
    ChartSignalsListResponse,
    StrategyConfigCreate,
    StrategyConfigResponse,
    StrategyConfigUpdate,
    StrategyCreate,
    StrategyListResponse,
    StrategyResponse,
    StrategyUpdate,
)
from app.modules.strategy.service import StrategyService

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


# === Strategies ===

@router.get("", response_model=list[StrategyListResponse])
async def list_strategies(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[StrategyListResponse]:
    """Список доступных стратегий (публичный)."""
    service = StrategyService(db)
    return await service.list_strategies(limit=limit, offset=offset)


@router.get("/{slug}", response_model=StrategyResponse)
async def get_strategy(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> StrategyResponse:
    """Получить стратегию по slug с default_config."""
    service = StrategyService(db)
    return await service.get_strategy_by_slug(slug)


@router.patch("/{strategy_id}", response_model=StrategyResponse)
async def update_strategy(
    strategy_id: uuid.UUID,
    data: StrategyUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyResponse:
    """Обновить стратегию (только admin)."""
    service = StrategyService(db)
    return await service.update_strategy(strategy_id, data)


@router.post("", response_model=StrategyResponse, status_code=201)
async def create_strategy(
    data: StrategyCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyResponse:
    """Создать стратегию (только admin)."""
    service = StrategyService(db)
    return await service.create_strategy(data, author_id=admin.id)


# === Strategy Configs ===

@router.get("/configs/my", response_model=list[StrategyConfigResponse])
async def list_my_configs(
    strategy_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[StrategyConfigResponse]:
    """Мои конфигурации стратегий."""
    service = StrategyService(db)
    return await service.list_user_configs(user.id, strategy_id, limit=limit, offset=offset)


@router.get("/configs/{config_id}", response_model=StrategyConfigResponse)
async def get_config(
    config_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyConfigResponse:
    """Получить конкретный конфиг."""
    service = StrategyService(db)
    return await service.get_config(config_id, user.id)


@router.post("/configs", response_model=StrategyConfigResponse, status_code=201)
async def create_config(
    data: StrategyConfigCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyConfigResponse:
    """Создать конфигурацию стратегии."""
    service = StrategyService(db)
    return await service.create_config(data, user.id)


@router.patch("/configs/{config_id}", response_model=StrategyConfigResponse)
async def update_config(
    config_id: uuid.UUID,
    data: StrategyConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyConfigResponse:
    """Обновить конфигурацию."""
    service = StrategyService(db)
    return await service.update_config(config_id, user.id, data)


@router.delete("/configs/{config_id}", status_code=204)
async def delete_config(
    config_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить конфигурацию."""
    service = StrategyService(db)
    await service.delete_config(config_id, user.id)


# === Chart Signals ===

@router.get("/configs/{config_id}/signals", response_model=ChartSignalsListResponse)
async def evaluate_config_signals(
    config_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChartSignalsListResponse:
    """Оценить сигналы стратегии для отображения на графике.

    Загружает 500 свечей, прогоняет движок, кэширует результат на 5 минут.
    Не создает записей в БД - только evaluate.
    """
    service = StrategyService(db)
    return await service.evaluate_signals(config_id, user.id)
