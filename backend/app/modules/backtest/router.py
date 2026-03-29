"""API-эндпоинты модуля backtest."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.backtest.schemas import (
    BacktestCreate,
    BacktestResultResponse,
    BacktestRunResponse,
)
from app.modules.backtest.service import BacktestService

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.post("/runs", response_model=BacktestRunResponse, status_code=201)
async def create_backtest_run(
    data: BacktestCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BacktestRunResponse:
    """Создать запуск бэктеста."""
    service = BacktestService(db)
    run = await service.create_run(user.id, data)
    return run


@router.get("/runs", response_model=list[BacktestRunResponse])
async def list_backtest_runs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BacktestRunResponse]:
    """Список моих запусков бэктеста."""
    service = BacktestService(db)
    return await service.list_runs(user.id)


@router.get("/runs/{run_id}", response_model=BacktestRunResponse)
async def get_backtest_run(
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BacktestRunResponse:
    """Получить статус запуска бэктеста."""
    service = BacktestService(db)
    return await service.get_run(run_id, user.id)


@router.get("/runs/{run_id}/result", response_model=BacktestResultResponse)
async def get_backtest_result(
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BacktestResultResponse:
    """Получить результаты бэктеста."""
    service = BacktestService(db)
    return await service.get_result(run_id, user.id)
