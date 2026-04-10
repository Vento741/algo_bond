"""Celery задачи модуля market."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.celery_app import celery

logger = logging.getLogger(__name__)

# Bybit API возвращает max 1000 свечей за запрос
BYBIT_KLINE_LIMIT = 1000
# Глубина backfill - 180 дней
BACKFILL_DAYS = 180

# Маппинг таймфрейма в минуты для расчёта шага пагинации
TIMEFRAME_MINUTES = {
    "1": 1, "3": 3, "5": 5, "15": 15, "30": 30,
    "60": 60, "120": 120, "240": 240, "360": 360, "720": 720,
    "D": 1440, "W": 10080, "M": 43200,
}


def _import_all_models() -> None:
    """Импорт моделей для корректной работы SQLAlchemy."""
    import app.modules.auth.models  # noqa: F401
    import app.modules.billing.models  # noqa: F401
    import app.modules.strategy.models  # noqa: F401
    import app.modules.market.models  # noqa: F401
    import app.modules.trading.models  # noqa: F401
    import app.modules.backtest.models  # noqa: F401


async def _sync_pairs() -> int:
    """Асинхронная синхронизация пар."""
    from app.database import async_session
    from app.modules.market.service import MarketService

    service = MarketService()
    async with async_session() as db:
        count = await service.sync_pairs(db)
    return count


@celery.task(name="market.sync_trading_pairs")
def sync_trading_pairs_task() -> dict:
    """Периодическая задача: синхронизация торговых пар с Bybit."""
    _import_all_models()
    count = asyncio.run(_sync_pairs())
    logger.info("Синхронизировано %d торговых пар", count)
    return {"synced": count}


async def _backfill_candles(symbol: str, timeframe: str) -> dict:
    """Асинхронный backfill исторических свечей из Bybit в PostgreSQL."""
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from app.database import create_standalone_session
    from app.modules.market.bybit_client import BybitClient
    from app.modules.market.models import CandleSyncState, OHLCVCandle

    session_factory = create_standalone_session()
    client = BybitClient()
    now = datetime.now(timezone.utc)
    total_inserted = 0

    async with session_factory() as db:
        # Создать или обновить CandleSyncState
        result = await db.execute(
            select(CandleSyncState).where(
                CandleSyncState.symbol == symbol,
                CandleSyncState.timeframe == timeframe,
            )
        )
        sync_state = result.scalar_one_or_none()

        if sync_state is None:
            sync_state = CandleSyncState(
                symbol=symbol,
                timeframe=timeframe,
                backfill_status="running",
                backfill_started_at=now,
                updated_at=now,
            )
            db.add(sync_state)
        else:
            sync_state.backfill_status = "running"
            sync_state.backfill_started_at = now
            sync_state.updated_at = now

        await db.commit()

    try:
        # Определяем границы загрузки
        target_start = now - timedelta(days=BACKFILL_DAYS)
        tf_minutes = TIMEFRAME_MINUTES.get(timeframe, 15)

        # Пагинация: идём от текущего момента назад
        current_end_ms = int(now.timestamp() * 1000)
        target_start_ms = int(target_start.timestamp() * 1000)

        oldest_fetched: datetime | None = None
        newest_fetched: datetime | None = None

        while current_end_ms > target_start_ms:
            # Загрузить batch из Bybit (синхронный pybit -> asyncio.to_thread)
            batch = await asyncio.to_thread(
                client.get_klines, symbol, timeframe, BYBIT_KLINE_LIMIT,
                end=current_end_ms,
            )

            if not batch:
                logger.info("Backfill %s/%s: нет данных, завершаем", symbol, timeframe)
                break

            # Подготовить записи для bulk insert
            rows = []
            for candle in batch:
                ts = candle["timestamp"]  # milliseconds
                open_time = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
                rows.append({
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "open_time": open_time,
                    "open": Decimal(str(candle["open"])),
                    "high": Decimal(str(candle["high"])),
                    "low": Decimal(str(candle["low"])),
                    "close": Decimal(str(candle["close"])),
                    "volume": Decimal(str(candle["volume"])),
                })

                # Трекинг границ
                if oldest_fetched is None or open_time < oldest_fetched:
                    oldest_fetched = open_time
                if newest_fetched is None or open_time > newest_fetched:
                    newest_fetched = open_time

            # Bulk UPSERT: обновляем OHLCV если свеча уже существует (могла быть записана незакрытой)
            if rows:
                async with session_factory() as db:
                    stmt = pg_insert(OHLCVCandle).values(rows)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["symbol", "timeframe", "open_time"],
                        set_={
                            "open": stmt.excluded.open,
                            "high": stmt.excluded.high,
                            "low": stmt.excluded.low,
                            "close": stmt.excluded.close,
                            "volume": stmt.excluded.volume,
                        },
                    )
                    result = await db.execute(stmt)
                    await db.commit()
                    total_inserted += result.rowcount  # type: ignore[operator]

            # Двигаем курсор назад
            first_ts = batch[0]["timestamp"]  # oldest in batch (sorted oldest first)
            if first_ts <= target_start_ms:
                break
            current_end_ms = first_ts - 1

            logger.info(
                "Backfill %s/%s: загружено %d свечей, всего %d",
                symbol, timeframe, len(batch), total_inserted,
            )

        # Обновляем CandleSyncState = done
        async with session_factory() as db:
            result = await db.execute(
                select(CandleSyncState).where(
                    CandleSyncState.symbol == symbol,
                    CandleSyncState.timeframe == timeframe,
                )
            )
            sync_state = result.scalar_one()
            sync_state.backfill_status = "done"
            sync_state.backfill_completed_at = datetime.now(timezone.utc)
            sync_state.oldest_time = oldest_fetched
            sync_state.newest_time = newest_fetched
            sync_state.updated_at = datetime.now(timezone.utc)
            await db.commit()

        logger.info(
            "Backfill завершён: %s/%s, %d свечей загружено",
            symbol, timeframe, total_inserted,
        )
        return {"symbol": symbol, "timeframe": timeframe, "inserted": total_inserted}

    except Exception as e:
        logger.error("Backfill ошибка %s/%s: %s", symbol, timeframe, e, exc_info=True)
        # Обновляем статус = failed
        try:
            async with session_factory() as db:
                result = await db.execute(
                    select(CandleSyncState).where(
                        CandleSyncState.symbol == symbol,
                        CandleSyncState.timeframe == timeframe,
                    )
                )
                sync_state = result.scalar_one_or_none()
                if sync_state:
                    sync_state.backfill_status = "failed"
                    sync_state.updated_at = datetime.now(timezone.utc)
                    await db.commit()
        except Exception:
            logger.error("Не удалось обновить статус backfill на failed")
        raise


@celery.task(name="market.backfill_candles", bind=True, max_retries=2)
def backfill_candles_task(self, symbol: str, timeframe: str) -> dict:
    """Фоновая загрузка исторических свечей (180 дней) из Bybit в PostgreSQL."""
    _import_all_models()
    try:
        return asyncio.run(_backfill_candles(symbol, timeframe))
    except Exception as exc:
        logger.error("Backfill task failed: %s/%s: %s", symbol, timeframe, exc)
        raise self.retry(exc=exc, countdown=60)


async def _sync_latest_candles() -> dict:
    """Синхронизация свежих свечей для всех завершённых backfill."""
    from sqlalchemy import select, func
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from app.database import create_standalone_session
    from app.modules.market.bybit_client import BybitClient
    from app.modules.market.models import CandleSyncState, OHLCVCandle
    from app.redis import pool as redis_client

    session_factory = create_standalone_session()
    client = BybitClient()
    total_synced = 0
    pairs_synced = 0

    async with session_factory() as db:
        result = await db.execute(
            select(CandleSyncState).where(CandleSyncState.backfill_status == "done")
        )
        sync_states = result.scalars().all()

    for state in sync_states:
        try:
            # Найти MAX(open_time) в ohlcv_candles
            async with session_factory() as db:
                result = await db.execute(
                    select(func.max(OHLCVCandle.open_time)).where(
                        OHLCVCandle.symbol == state.symbol,
                        OHLCVCandle.timeframe == state.timeframe,
                    )
                )
                max_time = result.scalar_one_or_none()

            if max_time is None:
                continue

            # Запросить новые свечи с Bybit начиная от max_time
            start_ms = int(max_time.timestamp() * 1000) + 1
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

            batch = await asyncio.to_thread(
                client.get_klines, state.symbol, state.timeframe, BYBIT_KLINE_LIMIT,
                start=start_ms, end=now_ms,
            )

            if not batch:
                continue

            # Подготовить и вставить
            rows = []
            for candle in batch:
                ts = candle["timestamp"]
                open_time = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
                rows.append({
                    "symbol": state.symbol,
                    "timeframe": state.timeframe,
                    "open_time": open_time,
                    "open": Decimal(str(candle["open"])),
                    "high": Decimal(str(candle["high"])),
                    "low": Decimal(str(candle["low"])),
                    "close": Decimal(str(candle["close"])),
                    "volume": Decimal(str(candle["volume"])),
                })

            if rows:
                async with session_factory() as db:
                    stmt = pg_insert(OHLCVCandle).values(rows)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["symbol", "timeframe", "open_time"],
                        set_={
                            "open": stmt.excluded.open,
                            "high": stmt.excluded.high,
                            "low": stmt.excluded.low,
                            "close": stmt.excluded.close,
                            "volume": stmt.excluded.volume,
                        },
                    )
                    result = await db.execute(stmt)
                    await db.commit()
                    inserted = result.rowcount  # type: ignore[operator]
                    total_synced += inserted

            # Инвалидировать Redis cache
            cache_key = f"candles:{state.symbol}:{state.timeframe}:latest"
            try:
                await redis_client.delete(cache_key)
            except Exception:
                logger.warning("Redis cache invalidation failed: %s", cache_key)

            pairs_synced += 1
            logger.debug(
                "Sync latest %s/%s: %d новых свечей",
                state.symbol, state.timeframe, len(batch),
            )

        except Exception as e:
            logger.error(
                "Sync latest ошибка %s/%s: %s", state.symbol, state.timeframe, e
            )

    return {"pairs_synced": pairs_synced, "candles_inserted": total_synced}


@celery.task(name="market.sync_latest_candles")
def sync_latest_candles_task() -> dict:
    """Периодическая задача: синхронизация свежих свечей для завершённых backfill."""
    _import_all_models()
    result = asyncio.run(_sync_latest_candles())
    logger.info(
        "Sync latest candles: %d пар, %d свечей",
        result["pairs_synced"], result["candles_inserted"],
    )
    return result
