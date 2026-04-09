import { useEffect, useRef, useCallback, useState } from 'react';
import { createSeriesMarkers } from 'lightweight-charts';
import type {
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarkerBar,
  Time,
} from 'lightweight-charts';
import api from '@/lib/api';
import { CHART_COLORS } from '@/lib/chart-constants';
import type { ChartSignal, ChartSignalsResponse } from '@/types/api';

/** Интервал опроса новых сигналов (мс) */
const POLL_INTERVAL = 60_000;

/** Последний сигнал для отображения в боковой панели */
export interface LatestSignalInfo {
  direction: 'long' | 'short';
  signalStrength: number;
  knnClass: string;
  knnConfidence: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  tp1Price: number | null;
  tp2Price: number | null;
  wasExecuted: boolean;
}

interface UseChartSignalsOptions {
  configId: string | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
}

interface UseChartSignalsResult {
  latestSignal: LatestSignalInfo | null;
  signalsCount: number;
  loading: boolean;
  error: string | null;
}

/** Конвертация ChartSignal в маркер lightweight-charts */
function signalToMarker(signal: ChartSignal): SeriesMarkerBar<Time> {
  const isLong = signal.direction === 'long';
  return {
    time: signal.time as Time,
    position: isLong ? 'belowBar' : 'aboveBar',
    color: isLong ? CHART_COLORS.up : CHART_COLORS.down,
    shape: isLong ? 'arrowUp' : 'arrowDown',
    text: `${isLong ? 'L' : 'S'} ${Math.round(signal.signal_strength)}`,
    size: 1,
  };
}

/** Извлечение последнего сигнала */
function extractLatestSignal(signals: ChartSignal[]): LatestSignalInfo | null {
  if (signals.length === 0) return null;
  const last = signals[signals.length - 1];
  return {
    direction: last.direction,
    signalStrength: last.signal_strength,
    knnClass: last.knn_class,
    knnConfidence: last.knn_confidence,
    entryPrice: last.entry_price,
    stopLoss: last.stop_loss,
    takeProfit: last.take_profit,
    tp1Price: last.tp1_price,
    tp2Price: last.tp2_price,
    wasExecuted: last.was_executed,
  };
}

/**
 * Хук для загрузки и отображения торговых сигналов на графике.
 * Рисует маркеры (стрелки) на свечном графике через lightweight-charts v5.
 * Опрашивает API каждые 60 секунд для обновления.
 */
export function useChartSignals({
  configId,
  candleSeries,
}: UseChartSignalsOptions): UseChartSignalsResult {
  const [latestSignal, setLatestSignal] = useState<LatestSignalInfo | null>(null);
  const [signalsCount, setSignalsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  /** Очистка маркеров с графика */
  const clearMarkers = useCallback(() => {
    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers([]);
      markersPluginRef.current = null;
    }
  }, []);

  /** Загрузка сигналов из API */
  const fetchSignals = useCallback(
    async (cfgId: string, series: ISeriesApi<'Candlestick'>, controller: AbortController) => {
      try {
        const { data } = await api.get<ChartSignalsResponse>(
          `/strategies/configs/${cfgId}/signals`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        const signals = data.signals;
        const sorted = [...signals].sort((a, b) => a.time - b.time);

        // Конвертация в маркеры
        const markers = sorted.map(signalToMarker);

        // Создаем или обновляем маркеры
        if (!markersPluginRef.current) {
          markersPluginRef.current = createSeriesMarkers(series, markers, {
            zOrder: 'aboveSeries',
          });
        } else {
          markersPluginRef.current.setMarkers(markers);
        }

        setLatestSignal(extractLatestSignal(sorted));
        setSignalsCount(sorted.length);
        setError(null);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        // 404 - конфиг не найден, 403 - нет доступа
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { status?: number } };
          const status = axiosErr.response?.status;
          if (status === 404) {
            setError('Конфиг не найден');
          } else if (status === 403) {
            setError('Нет доступа к конфигу');
          } else {
            setError('Ошибка загрузки сигналов');
          }
        } else {
          setError('Ошибка загрузки сигналов');
        }

        clearMarkers();
        setLatestSignal(null);
        setSignalsCount(0);
      }
    },
    [clearMarkers],
  );

  // Основной эффект: загрузка + поллинг
  useEffect(() => {
    // Если нет configId или серии - очищаем
    if (!configId || !candleSeries) {
      clearMarkers();
      setLatestSignal(null);
      setSignalsCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    // Первая загрузка
    setLoading(true);
    fetchSignals(configId, candleSeries, controller).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    // Поллинг каждые 60 секунд
    const pollTimer = setInterval(() => {
      if (!controller.signal.aborted) {
        fetchSignals(configId, candleSeries, controller);
      }
    }, POLL_INTERVAL);

    return () => {
      controller.abort();
      clearInterval(pollTimer);
      clearMarkers();
    };
  }, [configId, candleSeries, fetchSignals, clearMarkers]);

  return { latestSignal, signalsCount, loading, error };
}
