"""Celery задачи модуля backtest."""

import asyncio
import logging
import uuid
from typing import Any

from app.celery_app import celery

logger = logging.getLogger(__name__)


async def _run_backtest(run_id: uuid.UUID) -> dict:
    """Выполнить бэктест: загрузить свечи → стратегия → движок → сохранить результат."""
    # Импорт всех моделей для SQLAlchemy relationships
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401
    import app.modules.backtest.models  # noqa: F401

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.database import create_standalone_session
    from app.modules.backtest.backtest_engine import run_backtest
    from app.modules.backtest.models import BacktestRun, BacktestStatus, BacktestResult
    from app.modules.backtest.service import BacktestService
    from app.modules.market.bybit_client import BybitClient
    from app.modules.strategy.engines import get_engine
    from app.modules.strategy.engines.base import OHLCV
    from app.modules.strategy.models import Strategy, StrategyConfig

    import numpy as np

    standalone_session = create_standalone_session()
    async with standalone_session() as session:
        # 1. Загрузить run с config и strategy
        result = await session.execute(
            select(BacktestRun).where(BacktestRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            return {"status": "error", "message": "Run not found"}

        # Обновить статус → running
        service = BacktestService(session)
        await service.update_run_status(run_id, BacktestStatus.RUNNING, progress=10)

        try:
            # 2. Загрузить strategy config
            cfg_result = await session.execute(
                select(StrategyConfig)
                .options(selectinload(StrategyConfig.strategy))
                .where(StrategyConfig.id == run.strategy_config_id)
            )
            config = cfg_result.scalar_one_or_none()
            if not config:
                await service.update_run_status(
                    run_id, BacktestStatus.FAILED, error_message="Strategy config not found"
                )
                return {"status": "error", "message": "Config not found"}

            strategy: Strategy = config.strategy

            # 3. Получить свечи с Bybit (mainnet, без ключей — публичные данные)
            await service.update_run_status(run_id, BacktestStatus.RUNNING, progress=20)

            client = BybitClient()

            # Для бэктеста нужно много свечей. Bybit API limit=1000.
            # Запрашиваем в цикле с пагинацией по start/end.
            import asyncio as aio
            start_ms = int(run.start_date.timestamp() * 1000)
            end_ms = int(run.end_date.timestamp() * 1000)

            all_candles: list[dict] = []
            current_end = end_ms

            # Bybit V5 kline API возвращает свечи ОТ end НАЗАД.
            # Пагинация: уменьшаем end каждый раз.
            while current_end > start_ms:
                candles = await aio.to_thread(
                    client.get_klines,
                    run.symbol,
                    run.timeframe,
                    1000,
                    start=start_ms,
                    end=current_end,
                )
                if not candles:
                    break
                all_candles = candles + all_candles  # prepend (older data)
                first_ts = candles[0]["timestamp"]
                if first_ts <= start_ms:
                    break  # достигли начала
                current_end = first_ts - 1

                # Обновить прогресс
                progress = min(20 + int(50 * (end_ms - current_end) / max(end_ms - start_ms, 1)), 70)
                await service.update_run_status(run_id, BacktestStatus.RUNNING, progress=progress)

            # Дедупликация по timestamp
            seen = set()
            unique_candles: list[dict] = []
            for c in all_candles:
                if c["timestamp"] not in seen:
                    seen.add(c["timestamp"])
                    unique_candles.append(c)
            all_candles = sorted(unique_candles, key=lambda c: c["timestamp"])

            if len(all_candles) < 100:
                await service.update_run_status(
                    run_id, BacktestStatus.FAILED,
                    error_message=f"Недостаточно свечей: {len(all_candles)} (минимум 100)"
                )
                return {"status": "error", "message": f"Not enough candles: {len(all_candles)}"}

            logger.info("Backtest %s: loaded %d candles", run_id, len(all_candles))

            # 4. Конвертировать в OHLCV
            ohlcv = OHLCV(
                open=np.array([c["open"] for c in all_candles], dtype=np.float64),
                high=np.array([c["high"] for c in all_candles], dtype=np.float64),
                low=np.array([c["low"] for c in all_candles], dtype=np.float64),
                close=np.array([c["close"] for c in all_candles], dtype=np.float64),
                volume=np.array([c["volume"] for c in all_candles], dtype=np.float64),
                timestamps=np.array([c["timestamp"] for c in all_candles], dtype=np.float64),
            )

            await service.update_run_status(run_id, BacktestStatus.RUNNING, progress=75)

            # 5. Запустить стратегию
            merged_config = {**strategy.default_config, **config.config}
            engine = get_engine(strategy.engine_type, merged_config)
            strategy_result = engine.generate_signals(ohlcv)

            await service.update_run_status(run_id, BacktestStatus.RUNNING, progress=85)

            # 6. Запустить backtest engine
            backtest_config = merged_config.get("backtest", {})
            risk_config = merged_config.get("risk", {})
            metrics = run_backtest(
                ohlcv=ohlcv,
                signals=strategy_result.signals,
                initial_capital=float(run.initial_capital),
                commission_pct=backtest_config.get("commission", 0.05),
                order_size_pct=backtest_config.get("order_size", 75),
                min_bars_trailing=risk_config.get("min_bars_trailing", 0),
            )

            # 7. Сохранить результат
            await service.save_result(
                run_id=run_id,
                total_trades=metrics.total_trades,
                winning_trades=metrics.winning_trades,
                losing_trades=metrics.losing_trades,
                win_rate=metrics.win_rate,
                profit_factor=metrics.profit_factor,
                total_pnl=metrics.total_pnl,
                total_pnl_pct=metrics.total_pnl_pct,
                max_drawdown=metrics.max_drawdown,
                sharpe_ratio=metrics.sharpe_ratio,
                equity_curve=metrics.equity_curve,
                trades_log=metrics.trades_log,
            )

            await service.update_run_status(run_id, BacktestStatus.COMPLETED, progress=100)

            logger.info(
                "Backtest %s completed: %d trades, PnL=%.2f%%",
                run_id, metrics.total_trades, metrics.total_pnl_pct,
            )
            return {
                "status": "completed",
                "total_trades": metrics.total_trades,
                "total_pnl_pct": metrics.total_pnl_pct,
            }

        except Exception as e:
            logger.exception("Backtest %s failed", run_id)
            await service.update_run_status(
                run_id, BacktestStatus.FAILED, error_message=str(e)[:500]
            )
            return {"status": "error", "message": str(e)[:200]}


@celery.task(name="backtest.run_backtest", bind=True, max_retries=0)
def run_backtest_task(self: Any, run_id: str) -> dict:
    """Celery task: запустить бэктест."""
    # Импорт ВСЕХ моделей для SQLAlchemy mapper resolution
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401
    import app.modules.backtest.models  # noqa: F401

    return asyncio.run(_run_backtest(uuid.UUID(run_id)))
