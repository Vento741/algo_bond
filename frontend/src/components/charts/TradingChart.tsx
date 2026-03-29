import { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type MouseEventParams,
  ColorType,
  CrosshairMode,
  type Time,
} from 'lightweight-charts';

/** Формат свечи, приходящей из REST / WebSocket */
export interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradingChartProps {
  symbol: string;
  interval: string;
  initialData?: KlineData[];
  lastKline?: KlineData | null;
  onCrosshairMove?: (params: {
    time: number | null;
    price: number | null;
    volume: number | null;
  }) => void;
}

/** Конвертация Unix-секунд в формат lightweight-charts */
function toChartTime(ts: number): Time {
  return ts as Time;
}

/** Маппинг KlineData → CandlestickData */
function toCandlestick(k: KlineData): CandlestickData<Time> {
  return {
    time: toChartTime(k.time),
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
  };
}

/** Маппинг KlineData → HistogramData (volume) */
function toVolume(k: KlineData): HistogramData<Time> {
  return {
    time: toChartTime(k.time),
    value: k.volume,
    color: k.close >= k.open ? 'rgba(0,230,118,0.35)' : 'rgba(255,23,68,0.35)',
  };
}

export function TradingChart({
  symbol: _symbol,
  interval: _interval,
  initialData,
  lastKline,
  onCrosshairMove,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Обработчик crosshair
  const handleCrosshair = useCallback(
    (param: MouseEventParams<Time>) => {
      if (!onCrosshairMove) return;
      if (!param.time || !param.seriesData) {
        onCrosshairMove({ time: null, price: null, volume: null });
        return;
      }
      const candleData = candleSeriesRef.current
        ? param.seriesData.get(candleSeriesRef.current)
        : undefined;
      const volData = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : undefined;
      const candle = candleData as CandlestickData<Time> | undefined;
      const vol = volData as HistogramData<Time> | undefined;
      onCrosshairMove({
        time: param.time as number,
        price: candle?.close ?? null,
        volume: vol?.value ?? null,
      });
    },
    [onCrosshairMove],
  );

  // Создание графика
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d0d1a' },
        textColor: '#666',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#FFD700', width: 1, style: 3, labelBackgroundColor: '#FFD700' },
        horzLine: { color: '#FFD700', width: 1, style: 3, labelBackgroundColor: '#FFD700' },
      },
      rightPriceScale: {
        borderColor: '#2a2a3e',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#2a2a3e',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
      handleScroll: { vertTouchDrag: true },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00E676',
      downColor: '#FF1744',
      borderUpColor: '#00E676',
      borderDownColor: '#FF1744',
      wickUpColor: '#00E676',
      wickDownColor: '#FF1744',
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove(handleCrosshair);

    // ResizeObserver для адаптивности
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshair);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [handleCrosshair]);

  // Загрузка исторических данных (только при смене symbol/interval)
  useEffect(() => {
    if (!initialData || initialData.length === 0) return;
    const sorted = [...initialData].sort((a, b) => a.time - b.time);
    candleSeriesRef.current?.setData(sorted.map(toCandlestick));
    volumeSeriesRef.current?.setData(sorted.map(toVolume));
    chartRef.current?.timeScale().fitContent();
  }, [initialData]);

  // Real-time обновление последней свечи (без сброса зума)
  useEffect(() => {
    if (!lastKline) return;
    candleSeriesRef.current?.update(toCandlestick(lastKline));
    volumeSeriesRef.current?.update(toVolume(lastKline));
  }, [lastKline]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[400px]"
      style={{ position: 'relative' }}
    />
  );
}

/** Обновить последнюю свечу или добавить новую (для real-time) */
export function updateChartCandle(
  candleSeries: ISeriesApi<'Candlestick'> | null,
  volumeSeries: ISeriesApi<'Histogram'> | null,
  kline: KlineData,
): void {
  candleSeries?.update(toCandlestick(kline));
  volumeSeries?.update(toVolume(kline));
}
