import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import type { KlineData } from '@/lib/chart-types';
import { CHART_COLORS } from '@/lib/chart-constants';

// Re-export KlineData для обратной совместимости
export type { KlineData } from '@/lib/chart-types';

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
  /** Callback при создании/удалении chart API */
  onChartReady?: (chart: IChartApi | null) => void;
}

/** Конвертация Unix-секунд в формат lightweight-charts */
function toChartTime(ts: number): Time {
  return ts as Time;
}

/** Маппинг KlineData -> CandlestickData */
function toCandlestick(k: KlineData): CandlestickData<Time> {
  return {
    time: toChartTime(k.time),
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
  };
}

/** Маппинг KlineData -> HistogramData (volume) */
function toVolume(k: KlineData): HistogramData<Time> {
  return {
    time: toChartTime(k.time),
    value: k.volume,
    color: k.close >= k.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
  };
}

export function TradingChart({
  symbol: _symbol,
  interval: _interval,
  initialData,
  lastKline,
  onCrosshairMove,
  onChartReady,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const createdRef = useRef(false);
  const onCrosshairMoveRef = useRef(onCrosshairMove);
  onCrosshairMoveRef.current = onCrosshairMove;
  const onChartReadyRef = useRef(onChartReady);
  onChartReadyRef.current = onChartReady;

  // Создание графика (один раз)
  useEffect(() => {
    if (!containerRef.current) return;
    // React 18 StrictMode guard - предотвращаем двойное создание
    if (createdRef.current) return;
    createdRef.current = true;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.bg },
        textColor: CHART_COLORS.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_COLORS.crosshair, width: 1, style: 3, labelBackgroundColor: CHART_COLORS.crosshair },
        horzLine: { color: CHART_COLORS.crosshair, width: 1, style: 3, labelBackgroundColor: CHART_COLORS.crosshair },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.border,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: CHART_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
      handleScroll: { vertTouchDrag: true },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.up,
      downColor: CHART_COLORS.down,
      borderUpColor: CHART_COLORS.up,
      borderDownColor: CHART_COLORS.down,
      wickUpColor: CHART_COLORS.up,
      wickDownColor: CHART_COLORS.down,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    function handleCrosshair(param: MouseEventParams<Time>) {
      const cb = onCrosshairMoveRef.current;
      if (!cb) return;
      if (!param.time || !param.seriesData) {
        cb({ time: null, price: null, volume: null });
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
      cb({
        time: param.time as number,
        price: candle?.close ?? null,
        volume: vol?.value ?? null,
      });
    }

    chart.subscribeCrosshairMove(handleCrosshair);

    onChartReadyRef.current?.(chart);

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
      onChartReadyRef.current?.(null);
      createdRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Загрузка исторических данных (только при смене symbol/interval)
  useEffect(() => {
    if (!initialData || initialData.length === 0) return;
    const sorted = [...initialData].sort((a, b) => a.time - b.time);
    candleSeriesRef.current?.setData(sorted.map(toCandlestick));
    volumeSeriesRef.current?.setData(sorted.map(toVolume));
    // Принудительный autoScale по оси Y
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
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
