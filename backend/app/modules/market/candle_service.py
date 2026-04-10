"""Сервис хранения и выдачи исторических свечей из PostgreSQL."""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.market.models import CandleSyncState, OHLCVCandle
from app.modules.market.schemas import CandleResponse, CandlesPageResponse
from app.modules.market.service import MarketService
from app.redis import pool as redis_client

logger = logging.getLogger(__name__)

CACHE_TTL_CANDLES = 60


class CandleService:
    """Сервис свечей: PostgreSQL + Redis cache + fallback на Bybit API."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_candles(
        self,
        symbol: str,
        interval: str = "15",
        limit: int = 500,
        before: int | None = None,
    ) -> CandlesPageResponse:
        """Получить страницу свечей.

        Без before: последние свечи из БД (кэш Redis, TTL 60s).
        С before: курсорная пагинация по open_time DESC из PostgreSQL.
        Если БД пуста: fallback на Bybit API.
        """
        # Проверяем состояние backfill
        sync_state = await self._get_sync_state(symbol, interval)
        backfill_status = sync_state.backfill_status if sync_state else "pending"

        if before is None:
            # Попробовать Redis cache для latest
            candles = await self._get_latest_cached(symbol, interval, limit)
            if candles is not None:
                has_more = len(candles) == limit
                return CandlesPageResponse(
                    candles=candles, has_more=has_more, backfill_status=backfill_status
                )

        # Запрос из PostgreSQL
        candles = await self._query_db(symbol, interval, limit, before)

        if candles:
            # Кэшировать latest (без before)
            if before is None:
                await self._cache_latest(symbol, interval, candles)
            has_more = len(candles) == limit
            return CandlesPageResponse(
                candles=candles, has_more=has_more, backfill_status=backfill_status
            )

        # Fallback на Bybit API если БД пуста
        candles = await self._fallback_bybit(symbol, interval, limit)
        return CandlesPageResponse(
            candles=candles, has_more=False, backfill_status=backfill_status
        )

    async def _get_sync_state(
        self, symbol: str, timeframe: str
    ) -> CandleSyncState | None:
        """Получить состояние синхронизации для пары/таймфрейма."""
        result = await self.db.execute(
            select(CandleSyncState).where(
                CandleSyncState.symbol == symbol,
                CandleSyncState.timeframe == timeframe,
            )
        )
        return result.scalar_one_or_none()

    async def _query_db(
        self,
        symbol: str,
        interval: str,
        limit: int,
        before: int | None,
    ) -> list[CandleResponse]:
        """Запросить свечи из PostgreSQL с курсорной пагинацией."""
        query = (
            select(OHLCVCandle)
            .where(
                OHLCVCandle.symbol == symbol,
                OHLCVCandle.timeframe == interval,
            )
            .order_by(OHLCVCandle.open_time.desc())
            .limit(limit)
        )

        if before is not None:
            before_dt = datetime.fromtimestamp(before, tz=timezone.utc)
            query = query.where(OHLCVCandle.open_time < before_dt)

        result = await self.db.execute(query)
        rows = result.scalars().all()

        # Вернуть в хронологическом порядке (oldest first)
        rows.reverse()
        return [
            CandleResponse(
                timestamp=int(r.open_time.timestamp()),
                open=float(r.open),
                high=float(r.high),
                low=float(r.low),
                close=float(r.close),
                volume=float(r.volume),
            )
            for r in rows
        ]

    async def _get_latest_cached(
        self, symbol: str, interval: str, limit: int
    ) -> list[CandleResponse] | None:
        """Попробовать получить latest свечи из Redis cache."""
        cache_key = f"candles:{symbol}:{interval}:latest"
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                data = json.loads(cached)
                # Вернуть только запрошенное количество
                candles = [CandleResponse(**c) for c in data[-limit:]]
                return candles if candles else None
        except Exception:
            logger.warning("Redis cache read failed: %s", cache_key)
        return None

    async def _cache_latest(
        self, symbol: str, interval: str, candles: list[CandleResponse]
    ) -> None:
        """Закэшировать latest свечи в Redis."""
        cache_key = f"candles:{symbol}:{interval}:latest"
        try:
            data = [c.model_dump() for c in candles]
            await redis_client.set(cache_key, json.dumps(data), ex=CACHE_TTL_CANDLES)
        except Exception:
            logger.warning("Redis cache write failed: %s", cache_key)

    async def _fallback_bybit(
        self, symbol: str, interval: str, limit: int
    ) -> list[CandleResponse]:
        """Fallback: получить свечи напрямую из Bybit API."""
        service = MarketService()
        raw = await service.get_klines(symbol, interval, limit)
        return [CandleResponse(**c) for c in raw]
