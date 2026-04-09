import { useEffect, useRef } from 'react';
import { LineSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time, LineData } from 'lightweight-charts';
import { EMA } from 'lightweight-charts-indicators';
import { RSI } from 'lightweight-charts-indicators';
import { MACD } from 'lightweight-charts-indicators';
import { BollingerBands } from 'lightweight-charts-indicators';
import type { Bar } from 'oakscriptjs';
import { useChartStore } from '@/stores/chart';
import { INDICATOR_REGISTRY } from '@/lib/chart-constants';
import type { KlineData } from '@/lib/chart-types';

/** Тип серий, которые создаются для индикаторов */
type IndicatorSeriesRef = ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;

/** Структура для хранения серий одного индикатора */
interface IndicatorSeriesGroup {
  series: IndicatorSeriesRef[];
  indicatorId: string;
}

/** Конвертация KlineData в Bar для oakscriptjs */
function klinesToBars(klines: KlineData[]): Bar[] {
  return klines.map((k) => ({
    time: k.time,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
  }));
}

/** Извлечение массива plot-данных в формат LineData */
function toLineData(plotData: Array<{ time: unknown; value: number }>): LineData<Time>[] {
  return plotData
    .filter((p) => p.value !== null && p.value !== undefined && !isNaN(p.value))
    .map((p) => ({
      time: p.time as Time,
      value: p.value,
    }));
}

interface UseIndicatorsOptions {
  chart: IChartApi | null;
  klines: KlineData[];
}

/**
 * Хук для управления индикаторами на графике.
 * Читает состояние из zustand store, рассчитывает значения,
 * создает/удаляет серии на chart.
 */
export function useIndicators({ chart, klines }: UseIndicatorsOptions): void {
  const indicators = useChartStore((s) => s.indicators);
  const seriesGroupsRef = useRef<IndicatorSeriesGroup[]>([]);

  useEffect(() => {
    if (!chart || klines.length === 0) return;

    const bars = klinesToBars(klines);

    // Удаляем все предыдущие серии индикаторов
    for (const group of seriesGroupsRef.current) {
      for (const s of group.series) {
        try {
          chart.removeSeries(s);
        } catch {
          // Серия могла быть уже удалена при chart.remove()
        }
      }
    }
    seriesGroupsRef.current = [];

    // Создаем серии для включенных индикаторов
    for (const def of INDICATOR_REGISTRY) {
      const state = indicators[def.id];
      if (!state?.enabled) continue;

      const group: IndicatorSeriesGroup = { series: [], indicatorId: def.id };

      try {
        switch (def.id) {
          case 'ema8':
          case 'ema21':
          case 'ema55': {
            const period = state.params.period ?? def.defaultParams.period;
            const result = EMA.calculate(bars, { length: period, src: 'close', offset: 0 });
            const plotData = result.plots.plot0;
            if (plotData) {
              const s = chart.addSeries(LineSeries, {
                color: def.colors[0],
                lineWidth: 1,
                lastValueVisible: false,
                priceLineVisible: false,
              });
              s.setData(toLineData(plotData));
              group.series.push(s);
            }
            break;
          }

          case 'bbands': {
            const period = state.params.period ?? def.defaultParams.period;
            const mult = state.params.mult ?? def.defaultParams.mult;
            const result = BollingerBands.calculate(bars, {
              length: period,
              maType: 'SMA',
              src: 'close',
              mult,
              offset: 0,
            });
            // plot0 = basis, plot1 = upper, plot2 = lower
            const basisData = result.plots.plot0;
            const upperData = result.plots.plot1;
            const lowerData = result.plots.plot2;

            if (basisData) {
              const basisSeries = chart.addSeries(LineSeries, {
                color: def.colors[0],
                lineWidth: 1,
                lastValueVisible: false,
                priceLineVisible: false,
              });
              basisSeries.setData(toLineData(basisData));
              group.series.push(basisSeries);
            }
            if (upperData) {
              const upperSeries = chart.addSeries(LineSeries, {
                color: def.colors[1],
                lineWidth: 1,
                lineStyle: 2,
                lastValueVisible: false,
                priceLineVisible: false,
              });
              upperSeries.setData(toLineData(upperData));
              group.series.push(upperSeries);
            }
            if (lowerData) {
              const lowerSeries = chart.addSeries(LineSeries, {
                color: def.colors[2],
                lineWidth: 1,
                lineStyle: 2,
                lastValueVisible: false,
                priceLineVisible: false,
              });
              lowerSeries.setData(toLineData(lowerData));
              group.series.push(lowerSeries);
            }
            break;
          }

          case 'rsi': {
            const period = state.params.period ?? def.defaultParams.period;
            const result = RSI.calculate(bars, { length: period, src: 'close' });
            const rsiData = result.plots.plot0;

            if (rsiData) {
              const rsiSeries = chart.addSeries(LineSeries, {
                color: def.colors[0],
                lineWidth: 2,
                lastValueVisible: false,
                priceLineVisible: false,
              }, def.paneIndex);
              rsiSeries.setData(toLineData(rsiData));
              group.series.push(rsiSeries);

              // Горизонтальные линии 30 и 70
              const times = rsiData
                .filter((p) => p.value !== null && !isNaN(p.value))
                .map((p) => p.time as Time);

              if (times.length > 0) {
                const line70 = chart.addSeries(LineSeries, {
                  color: 'rgba(255,23,68,0.3)',
                  lineWidth: 1,
                  lineStyle: 2,
                  lastValueVisible: false,
                  priceLineVisible: false,
                }, def.paneIndex);
                line70.setData(times.map((t) => ({ time: t, value: 70 })));
                group.series.push(line70);

                const line30 = chart.addSeries(LineSeries, {
                  color: 'rgba(0,230,118,0.3)',
                  lineWidth: 1,
                  lineStyle: 2,
                  lastValueVisible: false,
                  priceLineVisible: false,
                }, def.paneIndex);
                line30.setData(times.map((t) => ({ time: t, value: 30 })));
                group.series.push(line30);
              }

              // Уменьшаем высоту панели осциллятора
              try {
                const panes = chart.panes();
                if (panes[def.paneIndex]) {
                  panes[def.paneIndex].setHeight(120);
                }
              } catch {
                // Панель может не существовать
              }
            }
            break;
          }

          case 'macd': {
            const fast = state.params.fast ?? def.defaultParams.fast;
            const slow = state.params.slow ?? def.defaultParams.slow;
            const signal = state.params.signal ?? def.defaultParams.signal;
            const result = MACD.calculate(bars, {
              fastLength: fast,
              slowLength: slow,
              signalLength: signal,
              src: 'close',
            });
            // plot0 = histogram, plot1 = MACD line, plot2 = signal line
            const histData = result.plots.plot0;
            const macdLineData = result.plots.plot1;
            const signalData = result.plots.plot2;

            if (histData) {
              const histSeries = chart.addSeries(HistogramSeries, {
                lastValueVisible: false,
                priceLineVisible: false,
              }, def.paneIndex);
              histSeries.setData(
                histData
                  .filter((p) => p.value !== null && !isNaN(p.value))
                  .map((p) => ({
                    time: p.time as Time,
                    value: p.value,
                    color: p.value >= 0 ? '#26A69A' : '#EF5350',
                  })),
              );
              group.series.push(histSeries);
            }

            if (macdLineData) {
              const macdSeries = chart.addSeries(LineSeries, {
                color: def.colors[0],
                lineWidth: 2,
                lastValueVisible: false,
                priceLineVisible: false,
              }, def.paneIndex);
              macdSeries.setData(toLineData(macdLineData));
              group.series.push(macdSeries);
            }

            if (signalData) {
              const signalSeries = chart.addSeries(LineSeries, {
                color: def.colors[1],
                lineWidth: 2,
                lastValueVisible: false,
                priceLineVisible: false,
              }, def.paneIndex);
              signalSeries.setData(toLineData(signalData));
              group.series.push(signalSeries);
            }

            // Уменьшаем высоту панели осциллятора
            try {
              const panes = chart.panes();
              if (panes[def.paneIndex]) {
                panes[def.paneIndex].setHeight(120);
              }
            } catch {
              // Панель может не существовать
            }
            break;
          }
        }
      } catch {
        // Ошибка расчета индикатора - пропускаем
      }

      if (group.series.length > 0) {
        seriesGroupsRef.current.push(group);
      }
    }

    // Cleanup: удаляем серии при размонтировании или пересчете
    return () => {
      for (const group of seriesGroupsRef.current) {
        for (const s of group.series) {
          try {
            chart.removeSeries(s);
          } catch {
            // Chart already removed
          }
        }
      }
      seriesGroupsRef.current = [];
    };
  }, [chart, klines, indicators]);
}
