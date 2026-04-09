import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useChartStore } from '@/stores/chart';
import { INDICATOR_REGISTRY } from '@/lib/chart-constants';

/** Компонент выбора индикаторов для графика */
export function IndicatorSelector() {
  const indicators = useChartStore((s) => s.indicators);
  const toggleIndicator = useChartStore((s) => s.toggleIndicator);

  const overlays = INDICATOR_REGISTRY.filter((d) => d.group === 'overlay');
  const oscillators = INDICATOR_REGISTRY.filter((d) => d.group === 'oscillator');

  const enabledCount = Object.values(indicators).filter((s) => s.enabled).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white h-8 gap-1.5 px-2.5"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="text-xs">Индикаторы</span>
          {enabledCount > 0 && (
            <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-premium/20 px-1 text-[10px] font-mono text-brand-premium">
              {enabledCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {/* Overlays */}
        <div className="p-3 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
            Наложения
          </div>
          <div className="space-y-1">
            {overlays.map((def) => {
              const state = indicators[def.id];
              const isEnabled = state?.enabled ?? false;
              return (
                <button
                  key={def.id}
                  onClick={() => toggleIndicator(def.id)}
                  className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-sm transition-colors cursor-pointer ${
                    isEnabled
                      ? 'bg-white/5 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  {/* Цветовой индикатор */}
                  <div className="flex items-center gap-1">
                    {def.colors.map((color, i) => (
                      <div
                        key={i}
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color, opacity: isEnabled ? 1 : 0.4 }}
                      />
                    ))}
                  </div>
                  <span className="flex-1 text-left text-xs">{def.label}</span>
                  {/* Параметры */}
                  <span className="text-[10px] font-mono text-gray-500">
                    {Object.values(state?.params ?? def.defaultParams).join(',')}
                  </span>
                  {/* Toggle indicator */}
                  <div
                    className={`h-3.5 w-6 rounded-full transition-colors ${
                      isEnabled ? 'bg-brand-premium/40' : 'bg-white/10'
                    }`}
                  >
                    <div
                      className={`h-2.5 w-2.5 rounded-full mt-0.5 transition-all ${
                        isEnabled
                          ? 'bg-brand-premium ml-[11px]'
                          : 'bg-gray-500 ml-0.5'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Oscillators */}
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
            Осцилляторы
            <span className="ml-1.5 text-gray-600 normal-case">(одновременно один)</span>
          </div>
          <div className="space-y-1">
            {oscillators.map((def) => {
              const state = indicators[def.id];
              const isEnabled = state?.enabled ?? false;
              return (
                <button
                  key={def.id}
                  onClick={() => toggleIndicator(def.id)}
                  className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-sm transition-colors cursor-pointer ${
                    isEnabled
                      ? 'bg-white/5 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {def.colors.map((color, i) => (
                      <div
                        key={i}
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color, opacity: isEnabled ? 1 : 0.4 }}
                      />
                    ))}
                  </div>
                  <span className="flex-1 text-left text-xs">{def.label}</span>
                  <span className="text-[10px] font-mono text-gray-500">
                    {Object.values(state?.params ?? def.defaultParams).join(',')}
                  </span>
                  {/* Radio-style indicator */}
                  <div
                    className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                      isEnabled
                        ? 'border-brand-premium bg-brand-premium/30'
                        : 'border-white/20 bg-transparent'
                    }`}
                  >
                    {isEnabled && (
                      <div className="h-1.5 w-1.5 rounded-full bg-brand-premium mt-[3px] ml-[3px]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
