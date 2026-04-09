import { useEffect, useRef, useState } from 'react';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import type { CrosshairData } from '@/lib/chart-types';

/** Начальное состояние crosshair */
const EMPTY_CROSSHAIR: CrosshairData = {
  time: null,
  open: null,
  high: null,
  low: null,
  close: null,
  volume: null,
};

interface UseCrosshairDataOptions {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  volumeSeries: ISeriesApi<'Histogram'> | null;
}

/**
 * Хук для подписки на crosshair events и извлечения OHLCV данных.
 * Использует ref-паттерн для series, чтобы подписка не пересоздавалась.
 */
export function useCrosshairData({
  chart,
  candleSeries,
  volumeSeries,
}: UseCrosshairDataOptions): CrosshairData {
  const [data, setData] = useState<CrosshairData>(EMPTY_CROSSHAIR);

  // Refs для доступа к series внутри handler без пересоздания подписки
  const candleRef = useRef(candleSeries);
  const volumeRef = useRef(volumeSeries);
  candleRef.current = candleSeries;
  volumeRef.current = volumeSeries;

  useEffect(() => {
    if (!chart) return;

    function handler(param: MouseEventParams<Time>) {
      if (!param.time || !param.seriesData) {
        setData(EMPTY_CROSSHAIR);
        return;
      }

      const candleData = candleRef.current
        ? (param.seriesData.get(candleRef.current) as CandlestickData<Time> | undefined)
        : undefined;
      const volData = volumeRef.current
        ? (param.seriesData.get(volumeRef.current) as HistogramData<Time> | undefined)
        : undefined;

      setData({
        time: param.time,
        open: candleData?.open ?? null,
        high: candleData?.high ?? null,
        low: candleData?.low ?? null,
        close: candleData?.close ?? null,
        volume: volData?.value ?? null,
      });
    }

    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
    };
  }, [chart]);

  return data;
}
