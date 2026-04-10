"""Бизнес-логика модуля backtest."""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.modules.backtest.models import BacktestResult, BacktestRun, BacktestStatus
from app.modules.backtest.schemas import BacktestCreate


class BacktestService:
    """Сервис бэктестирования: создание, запуск, получение результатов."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_run(
        self, user_id: uuid.UUID, data: BacktestCreate
    ) -> BacktestRun:
        """Создать запуск бэктеста со статусом pending."""
        run = BacktestRun(
            user_id=user_id,
            strategy_config_id=data.strategy_config_id,
            symbol=data.symbol,
            timeframe=data.timeframe,
            start_date=data.start_date,
            end_date=data.end_date,
            initial_capital=data.initial_capital,
            status=BacktestStatus.PENDING,
            progress=0,
        )
        self.db.add(run)
        await self.db.flush()
        await self.db.commit()
        return run

    async def get_run(
        self, run_id: uuid.UUID, user_id: uuid.UUID
    ) -> BacktestRun:
        """Получить запуск бэктеста по ID."""
        result = await self.db.execute(
            select(BacktestRun).where(
                BacktestRun.id == run_id,
                BacktestRun.user_id == user_id,
            )
        )
        run = result.scalar_one_or_none()
        if not run:
            raise NotFoundException("Бэктест не найден")
        return run

    async def list_runs(
        self, user_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> list[BacktestRun]:
        """Список запусков бэктеста пользователя."""
        result = await self.db.execute(
            select(BacktestRun)
            .where(BacktestRun.user_id == user_id)
            .order_by(BacktestRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get_result(
        self, run_id: uuid.UUID, user_id: uuid.UUID
    ) -> BacktestResult:
        """Получить результат бэктеста."""
        # Проверяем доступ через run
        await self.get_run(run_id, user_id)

        result = await self.db.execute(
            select(BacktestResult).where(BacktestResult.run_id == run_id)
        )
        backtest_result = result.scalar_one_or_none()
        if not backtest_result:
            raise NotFoundException("Результат бэктеста не найден")
        return backtest_result

    async def save_result(
        self,
        run_id: uuid.UUID,
        total_trades: int,
        winning_trades: int,
        losing_trades: int,
        win_rate: float,
        profit_factor: float,
        total_pnl: float,
        total_pnl_pct: float,
        max_drawdown: float,
        sharpe_ratio: float,
        equity_curve: list,
        trades_log: list,
    ) -> BacktestResult:
        """Сохранить результат бэктеста."""
        backtest_result = BacktestResult(
            run_id=run_id,
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
            win_rate=Decimal(str(win_rate)),
            profit_factor=Decimal(str(profit_factor)),
            total_pnl=Decimal(str(total_pnl)),
            total_pnl_pct=Decimal(str(total_pnl_pct)),
            max_drawdown=Decimal(str(max_drawdown)),
            sharpe_ratio=Decimal(str(sharpe_ratio)),
            equity_curve=equity_curve,
            trades_log=trades_log,
        )
        self.db.add(backtest_result)
        await self.db.flush()
        await self.db.commit()
        return backtest_result

    async def delete_run(
        self, run_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Удалить запуск бэктеста и его результаты."""
        run = await self.get_run(run_id, user_id)
        # Удалить результат если есть
        result = await self.db.execute(
            select(BacktestResult).where(BacktestResult.run_id == run_id)
        )
        backtest_result = result.scalar_one_or_none()
        if backtest_result:
            await self.db.delete(backtest_result)
        await self.db.delete(run)
        await self.db.commit()

    async def update_run_status(
        self,
        run_id: uuid.UUID,
        status: BacktestStatus,
        progress: int = 0,
        error_message: str | None = None,
    ) -> BacktestRun:
        """Обновить статус запуска бэктеста."""
        result = await self.db.execute(
            select(BacktestRun).where(BacktestRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            raise NotFoundException("Бэктест не найден")

        run.status = status
        run.progress = progress
        if error_message is not None:
            run.error_message = error_message
        await self.db.flush()
        await self.db.commit()
        return run
