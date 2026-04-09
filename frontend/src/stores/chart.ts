import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { INDICATOR_REGISTRY } from '@/lib/chart-constants';
import type { IndicatorState } from '@/lib/chart-types';

interface ChartStore {
  indicators: Record<string, IndicatorState>;
  toggleIndicator: (id: string) => void;
  updateIndicatorParams: (id: string, params: Record<string, number>) => void;
}

/** Начальные состояния индикаторов (все выключены) */
function getDefaultIndicators(): Record<string, IndicatorState> {
  const result: Record<string, IndicatorState> = {};
  for (const def of INDICATOR_REGISTRY) {
    result[def.id] = {
      enabled: false,
      params: { ...def.defaultParams },
    };
  }
  return result;
}

export const useChartStore = create<ChartStore>()(
  persist(
    (set) => ({
      indicators: getDefaultIndicators(),

      toggleIndicator: (id: string) =>
        set((state) => {
          const definition = INDICATOR_REGISTRY.find((d) => d.id === id);
          if (!definition) return state;

          const current = state.indicators[id];
          const newEnabled = !current?.enabled;

          const updated = { ...state.indicators };

          // Radio-behavior для осцилляторов: при включении одного выключаем остальные
          if (definition.group === 'oscillator' && newEnabled) {
            for (const def of INDICATOR_REGISTRY) {
              if (def.group === 'oscillator' && def.id !== id && updated[def.id]?.enabled) {
                updated[def.id] = { ...updated[def.id], enabled: false };
              }
            }
          }

          updated[id] = {
            ...current,
            enabled: newEnabled,
            params: current?.params ?? { ...definition.defaultParams },
          };

          return { indicators: updated };
        }),

      updateIndicatorParams: (id: string, params: Record<string, number>) =>
        set((state) => {
          const current = state.indicators[id];
          if (!current) return state;
          return {
            indicators: {
              ...state.indicators,
              [id]: { ...current, params: { ...current.params, ...params } },
            },
          };
        }),
    }),
    {
      name: 'algobond-chart-indicators',
      version: 1,
    },
  ),
);
