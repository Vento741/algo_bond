# Chart History + Lazy Scroll

Историческое хранение OHLCV свечей в PostgreSQL (6+ месяцев) с lazy-loading при скролле графика влево.

## Проблема

- График показывает ~5 дней (500 свечей @ 15мин)
- Каждый запрос идет напрямую в Bybit API (нет локального хранения)
- Redis кеш на 60 секунд не помогает при скролле в историю

## Решение

### Backend

#### 1. БД - OHLCVCandle (существующая таблица) + CandleSyncState (новая)

Существующая `ohlcv_candles` используется как есть. Новая таблица отслеживает состояние backfill:

```sql
CREATE TABLE candle_sync_state (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(30) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    oldest_time TIMESTAMPTZ,
    newest_time TIMESTAMPTZ,
    backfill_status VARCHAR(20) DEFAULT 'pending',  -- pending|running|done|failed
    backfill_started_at TIMESTAMPTZ,
    backfill_completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(symbol, timeframe)
);

-- Covering index для index-only scans (~1-2ms)
CREATE INDEX ix_ohlcv_range_cover
    ON ohlcv_candles (symbol, timeframe, open_time DESC)
    INCLUDE (open, high, low, close, volume);
```

Расчет хранения: 50 символов x 6 TF x 26K свечей = ~7.8M строк, ~1.6GB. Без партиционирования.

#### 2. Новый endpoint

```
GET /api/market/candles/{symbol}
  ?interval=15
  &limit=1000          (max 1000, default 500)
  &before=1712000000   (unix seconds, опционально)

Response:
{
  "candles": [...],           // oldest-first, до limit
  "has_more": true,           // false если достигли самой старой свечи
  "backfill_status": "done"   // pending|running|done
}
```

- Без `before`: возвращает последние N свечей (hot path, Redis cached)
- С `before`: cursor-пагинация по `open_time DESC`, прямой PostgreSQL запрос
- Если данных в БД нет: enqueue backfill, вернуть данные из Bybit API + `backfill_status: "running"`

#### 3. Backfill (Celery task)

Task `market.backfill_candles(symbol, timeframe)`:
1. Создать `candle_sync_state` row с `status=running`
2. Цикл: fetch 1000 свечей от Bybit, `INSERT ON CONFLICT DO NOTHING`, сдвинуть курсор назад
3. 6 месяцев @ 15мин = ~17.5K свечей = 18 запросов = ~4 секунды
4. Установить `status=done`, записать `oldest_time`/`newest_time`

Дедупликация через UNIQUE constraint `(symbol, timeframe, open_time)`.

#### 4. Инкрементальный sync (Celery Beat)

Task `market.sync_latest_candles` каждые 60 секунд:
- Для каждого symbol/tf с `candle_sync_state.status = 'done'`
- `SELECT MAX(open_time)` -> fetch новые свечи от Bybit -> INSERT
- Инвалидировать Redis cache key

#### 5. Redis кеш

- Ключ: `candles:{symbol}:{tf}:latest`, TTL 60с
- Кешируем только последние 500 свечей (initial load)
- Исторические scroll-запросы (с `before`) идут в PostgreSQL напрямую

### Frontend

#### 1. Хук `useChartLazyLoad`

```typescript
interface UseChartLazyLoadOptions {
  chartApi: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  volumeSeries: ISeriesApi<'Histogram'> | null;
  klines: KlineData[];
  setKlines: (klines: KlineData[]) => void;
  symbol: string;
  interval: string;
}
```

Поведение:
- Подписывается на `chart.timeScale().subscribeVisibleLogicalRangeChange()`
- Когда `logicalRange.from < 10`: загружает старшие свечи
- Debounce 300ms + `isLoadingRef` guard (один запрос одновременно)
- Max 10,000 свечей в памяти
- `exhaustedRef = true` когда `has_more === false`

#### 2. Prepend без сброса зума

Хук работает напрямую с `chartApi` и series refs:
1. Сохранить `chart.timeScale().scrollPosition()`
2. `candleSeries.setData(mergedCandles)`, `volumeSeries.setData(mergedVolume)`
3. `chart.timeScale().scrollToPosition(savedPosition + addedBarsCount, false)`

`setKlines(allKlines)` вызывается отдельно для обновления `useIndicators` и `useChartSignals`.

#### 3. Loading indicator

Абсолютный `Loader2` в левом верхнем углу chart-контейнера, `isLoadingOlder` state.

#### 4. TradingChart изменения (минимальные)

- Добавить `onVolumeSeriesReady` callback (аналогично `onCandleSeriesReady`)
- Не вызывать `fitContent()` при обновлении `initialData` если данные prepend (добавить `autoFit` prop, default true)

### Migration

1. Новый endpoint `/market/candles/{symbol}` coexists с старым `/market/klines/{symbol}`
2. Frontend переходит на новый endpoint
3. Старый endpoint deprecated но не удаляется (Backtest.tsx и BotDetail.tsx его используют)

### Порядок реализации

1. **Backend: модель CandleSyncState + миграция** (~30мин)
2. **Backend: endpoint GET /market/candles/{symbol}** (~1ч)
3. **Backend: Celery task backfill_candles** (~1ч)
4. **Backend: Celery Beat sync_latest_candles** (~30мин)
5. **Frontend: useChartLazyLoad хук** (~2ч)
6. **Frontend: интеграция в Chart.tsx** (~1ч)
7. **Frontend: TradingChart минимальные изменения** (~30мин)
8. **Тестирование + деплой** (~30мин)

### Не делаем (YAGNI)

- Партиционирование таблицы (< 100M строк)
- Web Workers для индикаторов (< 10K свечей)
- Виртуализация свечей (lightweight-charts справляется с 10K)
- Пресетные кнопки 1W/1M/3M (автоскролл достаточен)
