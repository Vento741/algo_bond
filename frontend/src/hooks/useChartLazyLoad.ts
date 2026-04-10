import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import api from '@/lib/api';
import type { KlineData } from '@/lib/chart-types';
import { CHART_COLORS } from '@/lib/chart-constants';

/** Порог срабатывания: подгрузка при from < LOAD_THRESHOLD */
const LOAD_THRESHOLD = 10;
/** Дебаунс перед загрузкой (мс) */
const DEBOUNCE_MS = 300;
/** Максимальное количество свечей в памяти */
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

/** Маппинг ответа API -> KlineData */
function mapCandle(c: CandlesPageResponse['candles'][number]): KlineData {
  const ts = c.timestamp > 1e12 ? Math.floor(c.timestamp / 1000) : c.timestamp;
  return {
    time: ts,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

/** KlineData -> CandlestickData для lightweight-charts */
function toCandlestick(k: KlineData) {
  return {
    time: k.time as Time,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
  };
}

/** KlineData -> HistogramData для volume */
function toVolume(k: KlineData) {
  return {
    time: k.time as Time,
    value: k.volume,
    color:
      k.close >= k.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
  };
}

/**
 * Хук ленивой подгрузки истории при скролле графика влево.
 * Подписывается на visibleLogicalRangeChange и загружает старые свечи
 * через /market/candles/{symbol} endpoint.
 */
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
  const exhaustedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Сброс при смене символа/интервала
  useEffect(() => {
    allKlinesRef.current = [];
    exhaustedRef.current = false;
    isLoadingRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [symbol, interval]);

  // Синхронизация с внешними klines (начальная загрузка)
  useEffect(() => {
    if (klines.length > 0) {
      allKlinesRef.current = [...klines].sort((a, b) => a.time - b.time);
    }
  }, [klines]);

  const loadOlder = useCallback(async () => {
    if (
      isLoadingRef.current ||
      exhaustedRef.current ||
      !chartApi ||
      !candleSeries ||
      !volumeSeries
    )
      return;

    const existing = allKlinesRef.current;
    if (existing.length === 0) return;
    if (existing.length >= MAX_CANDLES) return;

    const oldest = existing[0];
    isLoadingRef.current = true;
    setIsLoadingOlder(true);

    try {
      const { data } = await api.get<CandlesPageResponse>(
        `/market/candles/${symbol}`,
        {
          params: { interval, limit: 1000, before: oldest.time },
        },
      );

      if (!data.candles || data.candles.length === 0) {
        exhaustedRef.current = true;
        return;
      }

      if (!data.has_more) {
        exhaustedRef.current = true;
      }

      const olderKlines = data.candles.map(mapCandle);

      // Дедупликация по time
      const existingTimes = new Set(existing.map((k) => k.time));
      const unique = olderKlines.filter((k) => !existingTimes.has(k.time));

      if (unique.length === 0) {
        exhaustedRef.current = true;
        return;
      }

      // Объединение и сортировка
      const merged = [...unique, ...existing].sort((a, b) => a.time - b.time);

      // Обрезка до MAX_CANDLES (оставляем самые новые)
      const trimmed =
        merged.length > MAX_CANDLES
          ? merged.slice(merged.length - MAX_CANDLES)
          : merged;

      const addedCount = unique.length;

      // Сохраняем позицию скролла
      const savedPos = chartApi.timeScale().scrollPosition();

      // Обновляем данные на графике
      candleSeries.setData(trimmed.map(toCandlestick));
      volumeSeries.setData(trimmed.map(toVolume));

      // Восстанавливаем позицию скролла с учетом добавленных свечей
      chartApi
        .timeScale()
        .scrollToPosition(savedPos + addedCount, false);

      // Обновляем ref и state
      allKlinesRef.current = trimmed;
      setKlines(trimmed);
    } catch {
      // Молча игнорируем ошибки сети - пользователь просто попробует снова
    } finally {
      isLoadingRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [chartApi, candleSeries, volumeSeries, symbol, interval, setKlines]);

  // Подписка на изменение видимого диапазона
  useEffect(() => {
    if (!chartApi) return;

    const timeScale = chartApi.timeScale();

    const handler = (
      range: { from: number; to: number } | null,
    ) => {
      if (!range) return;
      if (range.from < LOAD_THRESHOLD) {
        // Дебаунс
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          void loadOlder();
        }, DEBOUNCE_MS);
      }
    };

    timeScale.subscribeVisibleLogicalRangeChange(handler);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handler);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [chartApi, loadOlder]);

  return { isLoadingOlder };
}
