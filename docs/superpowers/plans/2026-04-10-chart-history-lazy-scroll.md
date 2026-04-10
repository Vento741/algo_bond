# Chart History + Lazy Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store 6+ months of OHLCV candles in PostgreSQL and lazy-load older data when user scrolls chart left.

**Architecture:** New `CandleSyncState` model tracks backfill progress per symbol/timeframe. New endpoint `/market/candles/{symbol}` serves from DB with cursor pagination. Celery tasks backfill history and sync new candles. Frontend hook `useChartLazyLoad` subscribes to chart scroll events and fetches older batches.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, Celery, Redis, PostgreSQL, React 18, lightweight-charts v5.1, TypeScript

---

## File Structure

### Backend (create)
- `backend/app/modules/market/candle_service.py` - DB-backed candle service (query, backfill trigger)
- `backend/alembic/versions/2026_04_10_0001_add_candle_sync_state.py` - Migration

### Backend (modify)
- `backend/app/modules/market/models.py` - Add `CandleSyncState` model
- `backend/app/modules/market/schemas.py` - Add `CandlesPageResponse` schema
- `backend/app/modules/market/router.py` - Add `GET /market/candles/{symbol}` endpoint
- `backend/app/modules/market/celery_tasks.py` - Add `backfill_candles` and `sync_latest_candles` tasks

### Frontend (create)
- `frontend/src/hooks/useChartLazyLoad.ts` - Lazy scroll loading hook

### Frontend (modify)
- `frontend/src/components/charts/TradingChart.tsx` - Add `onVolumeSeriesReady` callback
- `frontend/src/pages/Chart.tsx` - Integrate lazy load, switch to new endpoint, loading indicator

---

## Task 1: CandleSyncState model + migration

**Files:**
- Modify: `backend/app/modules/market/models.py`
- Create: `backend/alembic/versions/2026_04_10_0001_add_candle_sync_state.py`

- [ ] **Step 1: Add CandleSyncState model**

Add to `backend/app/modules/market/models.py` after `TradingPair`:

```python
class CandleSyncState(Base):
    """Состояние backfill исторических свечей для пары/таймфрейма."""

    __tablename__ = "candle_sync_state"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30))
    timeframe: Mapped[str] = mapped_column(String(10))
    oldest_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    newest_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    backfill_status: Mapped[str] = mapped_column(String(20), default="pending")
    backfill_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    backfill_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_sync_symbol_tf", "symbol", "timeframe", unique=True),
    )
```

- [ ] **Step 2: Generate and run migration**

```bash
docker compose exec api alembic revision --autogenerate -m "add candle_sync_state and covering index"
docker compose exec api alembic upgrade head
```

Verify the migration includes:
- CREATE TABLE `candle_sync_state`
- CREATE INDEX `ix_ohlcv_range_cover` ON ohlcv_candles (covering index)

If the covering index is not auto-detected, add manually to the migration:

```python
op.create_index(
    "ix_ohlcv_range_cover",
    "ohlcv_candles",
    ["symbol", "timeframe", sa.text("open_time DESC")],
)
```

- [ ] **Step 3: Verify import**

```bash
cd backend && python -c "from app.modules.market.models import CandleSyncState; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/market/models.py backend/alembic/versions/
git commit -m "feat: add CandleSyncState model and covering index migration"
```

---

## Task 2: CandlesPageResponse schema + endpoint

**Files:**
- Modify: `backend/app/modules/market/schemas.py`
- Create: `backend/app/modules/market/candle_service.py`
- Modify: `backend/app/modules/market/router.py`

- [ ] **Step 1: Add schema**

Add to `backend/app/modules/market/schemas.py`:

```python
class CandlesPageResponse(BaseModel):
    """Страница свечей с пагинацией."""
    candles: list[CandleResponse]
    has_more: bool
    backfill_status: str  # pending|running|done|failed
```

- [ ] **Step 2: Create candle_service.py**

Create `backend/app/modules/market/candle_service.py`:

```python
"""Сервис исторических свечей из PostgreSQL."""

import asyncio
import logging
from datetime import datetime, timezone as tz

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.market.bybit_client import BybitClient
from app.modules.market.models import OHLCVCandle, CandleSyncState
from app.modules.market.service import MarketService
from app.redis import pool as redis_client

logger = logging.getLogger(__name__)

CACHE_KEY_LATEST = "candles:{symbol}:{tf}:latest"
CACHE_TTL = 60


class CandleService:
    """Загрузка свечей из БД с fallback на Bybit API."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_candles(
        self, symbol: str, interval: str, limit: int = 500, before: int | None = None,
    ) -> dict:
        """Получить страницу свечей.

        Без before: последние limit свечей (Redis cached).
        С before: cursor-пагинация по open_time.
        Если в БД нет данных: fallback на Bybit API + trigger backfill.
        """
        # Проверить состояние backfill
        sync = await self._get_sync_state(symbol, interval)
        backfill_status = sync.backfill_status if sync else "pending"

        if before is None:
            return await self._get_latest(symbol, interval, limit, backfill_status)
        else:
            return await self._get_before(symbol, interval, limit, before, backfill_status)

    async def _get_latest(
        self, symbol: str, interval: str, limit: int, backfill_status: str,
    ) -> dict:
        """Последние свечи (hot path, Redis cached)."""
        cache_key = CACHE_KEY_LATEST.format(symbol=symbol, tf=interval)

        # Redis cache check
        try:
            import json
            cached = await redis_client.get(cache_key)
            if cached:
                data = json.loads(cached)
                data["backfill_status"] = backfill_status
                return data
        except Exception:
            pass

        # Query DB
        result = await self.db.execute(
            select(OHLCVCandle)
            .where(OHLCVCandle.symbol == symbol, OHLCVCandle.timeframe == interval)
            .order_by(OHLCVCandle.open_time.desc())
            .limit(limit)
        )
        rows = list(reversed(result.scalars().all()))

        if not rows:
            # No DB data - fallback to Bybit API
            return await self._fallback_bybit(symbol, interval, limit, backfill_status)

        candles = [self._row_to_dict(r) for r in rows]
        has_more = len(rows) == limit

        response = {"candles": candles, "has_more": has_more, "backfill_status": backfill_status}

        # Cache in Redis
        try:
            import json
            await redis_client.set(cache_key, json.dumps(response), ex=CACHE_TTL)
        except Exception:
            pass

        return response

    async def _get_before(
        self, symbol: str, interval: str, limit: int, before: int, backfill_status: str,
    ) -> dict:
        """Cursor-пагинация: свечи старше before timestamp."""
        before_dt = datetime.fromtimestamp(before, tz=tz.utc)
        result = await self.db.execute(
            select(OHLCVCandle)
            .where(
                OHLCVCandle.symbol == symbol,
                OHLCVCandle.timeframe == interval,
                OHLCVCandle.open_time < before_dt,
            )
            .order_by(OHLCVCandle.open_time.desc())
            .limit(limit)
        )
        rows = list(reversed(result.scalars().all()))
        candles = [self._row_to_dict(r) for r in rows]
        has_more = len(rows) == limit

        return {"candles": candles, "has_more": has_more, "backfill_status": backfill_status}

    async def _fallback_bybit(
        self, symbol: str, interval: str, limit: int, backfill_status: str,
    ) -> dict:
        """Fallback: загрузить из Bybit API если БД пуста."""
        service = MarketService()
        candles = await service.get_klines(symbol, interval, limit)
        return {
            "candles": candles,
            "has_more": True,
            "backfill_status": backfill_status if backfill_status != "pending" else "pending",
        }

    async def _get_sync_state(self, symbol: str, interval: str) -> CandleSyncState | None:
        """Получить состояние синхронизации."""
        result = await self.db.execute(
            select(CandleSyncState).where(
                CandleSyncState.symbol == symbol,
                CandleSyncState.timeframe == interval,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _row_to_dict(row: OHLCVCandle) -> dict:
        """Конвертация ORM -> dict (совместимый с CandleResponse)."""
        return {
            "timestamp": int(row.open_time.timestamp() * 1000),
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": float(row.close),
            "volume": float(row.volume),
        }
```

- [ ] **Step 3: Add endpoint to router**

Add to `backend/app/modules/market/router.py`:

```python
from app.modules.market.candle_service import CandleService
from app.modules.market.schemas import CandlesPageResponse

@router.get("/candles/{symbol}", response_model=CandlesPageResponse)
async def get_candles_page(
    symbol: str,
    interval: str = Query("15", description="1,5,15,60,240,D"),
    limit: int = Query(500, ge=1, le=1000),
    before: int | None = Query(None, description="Unix seconds - загрузить свечи старше"),
    db: AsyncSession = Depends(get_db),
) -> CandlesPageResponse:
    """Получить страницу свечей из БД с lazy-пагинацией.

    Без before: последние limit свечей (cached).
    С before: cursor-пагинация для скролла в историю.
    При первом обращении запускает backfill в фоне.
    """
    service = CandleService(db)
    result = await service.get_candles(symbol, interval, limit, before)

    # Trigger backfill если нет данных
    if result["backfill_status"] == "pending":
        from app.modules.market.celery_tasks import backfill_candles_task
        backfill_candles_task.delay(symbol, interval)

    return CandlesPageResponse(**result)
```

- [ ] **Step 4: Verify import**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/market/candle_service.py backend/app/modules/market/schemas.py backend/app/modules/market/router.py
git commit -m "feat: add GET /market/candles/{symbol} endpoint with DB-backed pagination"
```

---

## Task 3: Celery backfill + sync tasks

**Files:**
- Modify: `backend/app/modules/market/celery_tasks.py`

- [ ] **Step 1: Add backfill task**

Append to `backend/app/modules/market/celery_tasks.py`:

```python
from datetime import datetime, timezone as tz, timedelta
from decimal import Decimal


async def _backfill(symbol: str, timeframe: str) -> dict:
    """Заполнить 6 месяцев свечей из Bybit в БД."""
    from app.database import async_session
    from app.modules.market.bybit_client import BybitClient
    from app.modules.market.models import OHLCVCandle, CandleSyncState
    from sqlalchemy import select, text
    from sqlalchemy.dialects.postgresql import insert

    _import_all_models()

    async with async_session() as db:
        # Upsert sync state
        result = await db.execute(
            select(CandleSyncState).where(
                CandleSyncState.symbol == symbol,
                CandleSyncState.timeframe == timeframe,
            )
        )
        sync = result.scalar_one_or_none()
        if sync and sync.backfill_status in ("running", "done"):
            return {"status": "already_running_or_done"}

        if not sync:
            sync = CandleSyncState(
                symbol=symbol, timeframe=timeframe,
                backfill_status="running",
                backfill_started_at=datetime.now(tz.utc),
            )
            db.add(sync)
        else:
            sync.backfill_status = "running"
            sync.backfill_started_at = datetime.now(tz.utc)
        await db.flush()

        client = BybitClient()
        now = datetime.now(tz.utc)
        six_months_ago = now - timedelta(days=180)
        end_ms = int(now.timestamp() * 1000)
        start_ms = int(six_months_ago.timestamp() * 1000)
        total_inserted = 0

        try:
            current_end = end_ms
            while current_end > start_ms:
                batch = await asyncio.to_thread(
                    client.get_klines, symbol, timeframe, 1000,
                    start=start_ms, end=current_end,
                )
                if not batch:
                    break

                # Bulk insert with ON CONFLICT DO NOTHING
                values = []
                for c in batch:
                    ts_dt = datetime.fromtimestamp(c["timestamp"] / 1000, tz=tz.utc)
                    values.append({
                        "symbol": symbol,
                        "timeframe": timeframe,
                        "open_time": ts_dt,
                        "open": Decimal(str(c["open"])),
                        "high": Decimal(str(c["high"])),
                        "low": Decimal(str(c["low"])),
                        "close": Decimal(str(c["close"])),
                        "volume": Decimal(str(c["volume"])),
                    })

                if values:
                    stmt = insert(OHLCVCandle).values(values)
                    stmt = stmt.on_conflict_do_nothing(
                        index_elements=["symbol", "timeframe", "open_time"]
                    )
                    await db.execute(stmt)
                    total_inserted += len(values)

                first_ts = batch[0]["timestamp"]
                if first_ts <= start_ms:
                    break
                current_end = first_ts - 1

            # Update sync state
            sync.backfill_status = "done"
            sync.backfill_completed_at = datetime.now(tz.utc)
            sync.oldest_time = six_months_ago
            sync.newest_time = now
            await db.commit()

            logger.info("Backfill %s/%s: %d свечей", symbol, timeframe, total_inserted)
            return {"status": "done", "inserted": total_inserted}

        except Exception as e:
            sync.backfill_status = "failed"
            await db.commit()
            logger.error("Backfill failed %s/%s: %s", symbol, timeframe, e)
            return {"status": "failed", "error": str(e)}


@celery.task(name="market.backfill_candles")
def backfill_candles_task(symbol: str, timeframe: str) -> dict:
    """Celery task: заполнить историю свечей."""
    _import_all_models()
    return asyncio.run(_backfill(symbol, timeframe))


async def _sync_latest() -> dict:
    """Дописать новые свечи для всех backfill-нутых символов."""
    from app.database import async_session
    from app.modules.market.bybit_client import BybitClient
    from app.modules.market.models import OHLCVCandle, CandleSyncState
    from sqlalchemy import select, func
    from sqlalchemy.dialects.postgresql import insert

    _import_all_models()

    async with async_session() as db:
        result = await db.execute(
            select(CandleSyncState).where(CandleSyncState.backfill_status == "done")
        )
        syncs = result.scalars().all()

        client = BybitClient()
        total = 0

        for sync in syncs:
            # Найти newest candle в БД
            max_result = await db.execute(
                select(func.max(OHLCVCandle.open_time)).where(
                    OHLCVCandle.symbol == sync.symbol,
                    OHLCVCandle.timeframe == sync.timeframe,
                )
            )
            max_time = max_result.scalar()
            if not max_time:
                continue

            start_ms = int(max_time.timestamp() * 1000)
            end_ms = int(datetime.now(tz.utc).timestamp() * 1000)

            batch = await asyncio.to_thread(
                client.get_klines, sync.symbol, sync.timeframe, 200,
                start=start_ms, end=end_ms,
            )

            if batch:
                values = []
                for c in batch:
                    ts_dt = datetime.fromtimestamp(c["timestamp"] / 1000, tz=tz.utc)
                    values.append({
                        "symbol": sync.symbol,
                        "timeframe": sync.timeframe,
                        "open_time": ts_dt,
                        "open": Decimal(str(c["open"])),
                        "high": Decimal(str(c["high"])),
                        "low": Decimal(str(c["low"])),
                        "close": Decimal(str(c["close"])),
                        "volume": Decimal(str(c["volume"])),
                    })
                stmt = insert(OHLCVCandle).values(values)
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["symbol", "timeframe", "open_time"]
                )
                await db.execute(stmt)
                total += len(values)

            # Инвалидировать Redis cache
            try:
                from app.redis import pool as redis_client
                cache_key = f"candles:{sync.symbol}:{sync.timeframe}:latest"
                await redis_client.delete(cache_key)
            except Exception:
                pass

            sync.newest_time = datetime.now(tz.utc)
            sync.updated_at = datetime.now(tz.utc)

        await db.commit()
        return {"synced_symbols": len(syncs), "total_candles": total}


@celery.task(name="market.sync_latest_candles")
def sync_latest_candles_task() -> dict:
    """Celery task: дописать новые свечи."""
    _import_all_models()
    return asyncio.run(_sync_latest())
```

- [ ] **Step 2: Register in Celery Beat**

Check `backend/app/celery_app.py` for beat schedule and add:

```python
"sync-latest-candles": {
    "task": "market.sync_latest_candles",
    "schedule": 60.0,  # каждые 60 секунд
},
```

- [ ] **Step 3: Verify**

```bash
cd backend && python -c "from app.modules.market.celery_tasks import backfill_candles_task, sync_latest_candles_task; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/market/celery_tasks.py backend/app/celery_app.py
git commit -m "feat: add backfill_candles and sync_latest_candles Celery tasks"
```

---

## Task 4: TradingChart - expose volume series

**Files:**
- Modify: `frontend/src/components/charts/TradingChart.tsx`

- [ ] **Step 1: Add onVolumeSeriesReady callback**

In `TradingChartProps` interface, add:
```typescript
onVolumeSeriesReady?: (series: ISeriesApi<'Histogram'> | null) => void;
```

In the component, add ref and fire callback (same pattern as `onCandleSeriesReady`):
```typescript
const onVolumeSeriesReadyRef = useRef(onVolumeSeriesReady);
onVolumeSeriesReadyRef.current = onVolumeSeriesReady;

// After volumeSeries creation:
onVolumeSeriesReadyRef.current?.(volumeSeries);

// In cleanup:
onVolumeSeriesReadyRef.current?.(null);
```

- [ ] **Step 2: TSC check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/charts/TradingChart.tsx
git commit -m "feat: expose onVolumeSeriesReady callback from TradingChart"
```

---

## Task 5: useChartLazyLoad hook

**Files:**
- Create: `frontend/src/hooks/useChartLazyLoad.ts`

- [ ] **Step 1: Create hook**

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import api from '@/lib/api';
import type { KlineData } from '@/lib/chart-types';
import { CHART_COLORS } from '@/lib/chart-constants';

const LOAD_THRESHOLD = 10;
const DEBOUNCE_MS = 300;
const MAX_CANDLES = 10000;

interface CandlesPageResponse {
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  has_more: boolean;
  backfill_status: string;
}

interface UseChartLazyLoadOptions {
  chartApi: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  volumeSeries: ISeriesApi<'Histogram'> | null;
  klines: KlineData[];
  setKlines: React.Dispatch<React.SetStateAction<KlineData[]>>;
  symbol: string;
  interval: string;
}

function mapCandle(c: CandlesPageResponse['candles'][0]): KlineData {
  const ts = c.timestamp > 1e12 ? Math.floor(c.timestamp / 1000) : c.timestamp;
  return { time: ts, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

function toCandlestick(k: KlineData) {
  return { time: k.time as Time, open: k.open, high: k.high, low: k.low, close: k.close };
}

function toVolume(k: KlineData) {
  return {
    time: k.time as Time,
    value: k.volume,
    color: k.close >= k.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
  };
}

export function useChartLazyLoad({
  chartApi,
  candleSeries,
  volumeSeries,
  klines,
  setKlines,
  symbol,
  interval,
}: UseChartLazyLoadOptions) {
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const allKlinesRef = useRef<KlineData[]>([]);
  const isLoadingRef = useRef(false);
  const exhaustedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Синхронизация ref с текущими klines
  useEffect(() => {
    allKlinesRef.current = klines;
    exhaustedRef.current = false;
  }, [symbol, interval]);

  // Обновлять ref когда klines меняются извне (initial load)
  useEffect(() => {
    if (klines.length > 0 && allKlinesRef.current.length === 0) {
      allKlinesRef.current = klines;
    }
  }, [klines]);

  const loadOlder = useCallback(async () => {
    if (isLoadingRef.current || exhaustedRef.current) return;
    if (allKlinesRef.current.length >= MAX_CANDLES) return;
    if (!candleSeries || !volumeSeries) return;

    const oldest = allKlinesRef.current[0];
    if (!oldest) return;

    isLoadingRef.current = true;
    setIsLoadingOlder(true);

    try {
      const { data } = await api.get<CandlesPageResponse>(
        `/market/candles/${symbol}`,
        { params: { interval, limit: 1000, before: oldest.time } },
      );

      const olderKlines = data.candles.map(mapCandle);
      if (olderKlines.length === 0) {
        exhaustedRef.current = true;
        return;
      }

      if (!data.has_more) {
        exhaustedRef.current = true;
      }

      // Deduplicate by time
      const existingTimes = new Set(allKlinesRef.current.map((k) => k.time));
      const newKlines = olderKlines.filter((k) => !existingTimes.has(k.time));

      if (newKlines.length === 0) {
        exhaustedRef.current = true;
        return;
      }

      // Merge: older + existing
      const merged = [...newKlines, ...allKlinesRef.current].sort((a, b) => a.time - b.time);

      // Trim to MAX_CANDLES (keep newest)
      const trimmed = merged.length > MAX_CANDLES ? merged.slice(-MAX_CANDLES) : merged;

      // Save scroll position before setData
      const scrollPos = chartApi?.timeScale().scrollPosition() ?? 0;
      const addedCount = newKlines.length;

      // Update chart series directly (bypass React cycle for speed)
      candleSeries.setData(trimmed.map(toCandlestick));
      volumeSeries.setData(trimmed.map(toVolume));

      // Restore scroll position
      chartApi?.timeScale().scrollToPosition(scrollPos + addedCount, false);

      // Update ref and state
      allKlinesRef.current = trimmed;
      setKlines(trimmed);
    } catch {
      // Network error - ignore, will retry on next scroll
    } finally {
      isLoadingRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [symbol, interval, candleSeries, volumeSeries, chartApi, setKlines]);

  // Subscribe to visible range changes
  useEffect(() => {
    if (!chartApi) return;

    const handler = (logicalRange: { from: number; to: number } | null) => {
      if (!logicalRange) return;
      if (logicalRange.from < LOAD_THRESHOLD) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadOlder(), DEBOUNCE_MS);
      }
    };

    chartApi.timeScale().subscribeVisibleLogicalRangeChange(handler);

    return () => {
      chartApi.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [chartApi, loadOlder]);

  return { isLoadingOlder };
}
```

- [ ] **Step 2: TSC check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useChartLazyLoad.ts
git commit -m "feat: add useChartLazyLoad hook for infinite scroll chart history"
```

---

## Task 6: Integrate into Chart.tsx

**Files:**
- Modify: `frontend/src/pages/Chart.tsx`

- [ ] **Step 1: Add volume series state and lazy load hook**

In Chart.tsx imports, add:
```typescript
import { useChartLazyLoad } from '@/hooks/useChartLazyLoad';
```

Add state for volume series (after candleSeries state):
```typescript
const [volumeSeries, setVolumeSeries] = useState<ISeriesApi<'Histogram'> | null>(null);

const handleVolumeSeriesReady = useCallback((series: ISeriesApi<'Histogram'> | null) => {
  setVolumeSeries(series);
}, []);
```

Add hook call (after useIndicators):
```typescript
const { isLoadingOlder } = useChartLazyLoad({
  chartApi, candleSeries, volumeSeries, klines, setKlines, symbol, interval,
});
```

- [ ] **Step 2: Pass callback to TradingChart**

Add prop to TradingChart:
```typescript
<TradingChart
  ...
  onVolumeSeriesReady={handleVolumeSeriesReady}
/>
```

- [ ] **Step 3: Switch initial load to new endpoint**

Change the klines fetch useEffect to use new endpoint:
```typescript
api.get(`/market/candles/${symbol}`, {
  params: { interval, limit: 500 },
  signal: controller.signal,
})
.then(({ data }) => {
  const mapped: KlineData[] = data.candles.map((d: Record<string, unknown>) => {
    const rawTs = Number(d.timestamp ?? d.time);
    const timeSec = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
    return {
      time: timeSec,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume ?? 0),
    };
  });
  setKlines(mapped);
})
```

- [ ] **Step 4: Add loading indicator**

In the chart container div, add:
```typescript
{isLoadingOlder && (
  <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded text-xs text-gray-300 font-mono">
    <Loader2 className="h-3 w-3 animate-spin" />
    Загрузка истории...
  </div>
)}
```

- [ ] **Step 5: TSC check + verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Chart.tsx
git commit -m "feat: integrate lazy scroll loading into Chart page"
```

---

## Task 7: Deploy and verify

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api frontend"
```

- [ ] **Step 3: Run migration on VPS**

```bash
ssh jeremy-vps "docker compose -f /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/docker-compose.yml exec api alembic upgrade head"
```

- [ ] **Step 4: Trigger backfill for RIVERUSDT**

```bash
ssh jeremy-vps "curl -sf https://algo.dev-james.bond/api/market/candles/RIVERUSDT?interval=15&limit=10"
```

This should return data from Bybit (DB empty) and trigger backfill task.

- [ ] **Step 5: Verify backfill completed**

```bash
ssh jeremy-vps "docker compose -f /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/docker-compose.yml logs celery --tail 20"
```

Look for "Backfill RIVERUSDT/15: XXXXX свечей"

- [ ] **Step 6: Health check**

```bash
ssh jeremy-vps "curl -sf http://localhost:8100/health"
```
