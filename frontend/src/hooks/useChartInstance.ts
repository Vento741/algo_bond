import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, DeepPartial, ChartOptions } from 'lightweight-charts';
import { CHART_COLORS } from '@/lib/chart-constants';

interface UseChartInstanceOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  options?: DeepPartial<ChartOptions>;
}

interface UseChartInstanceReturn {
  chart: IChartApi | null;
}

/** Дефолтные опции графика AlgoBond */
function getDefaultOptions(): DeepPartial<ChartOptions> {
  return {
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
    },
    timeScale: {
      borderColor: CHART_COLORS.border,
      timeVisible: true,
      secondsVisible: false,
    },
  };
}

/**
 * Хук для управления жизненным циклом графика lightweight-charts v5.
 * Создает chart, настраивает ResizeObserver, очищает при unmount.
 * React 18 StrictMode safe.
 */
export function useChartInstance({ containerRef, options }: UseChartInstanceOptions): UseChartInstanceReturn {
  const [chart, setChart] = useState<IChartApi | null>(null);
  const createdRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!containerRef.current) return;
    // React 18 StrictMode guard
    if (createdRef.current) return;
    createdRef.current = true;

    const mergedOptions: DeepPartial<ChartOptions> = {
      ...getDefaultOptions(),
      ...optionsRef.current,
    };

    const instance = createChart(containerRef.current, mergedOptions);
    setChart(instance);

    // ResizeObserver для адаптивности
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        instance.applyOptions({ width, height });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      instance.remove();
      setChart(null);
      createdRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { chart };
}
