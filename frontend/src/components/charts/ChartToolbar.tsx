import { Maximize2, Minimize2, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SymbolSearch } from '@/components/ui/symbol-search';
import { IndicatorSelector } from './IndicatorSelector';
import { ConfigSelector } from './ConfigSelector';
import { TimezoneSelector } from './TimezoneSelector';
import { INTERVALS } from '@/lib/chart-constants';
import type { StrategyConfig } from '@/types/api';

interface ChartToolbarProps {
  symbol: string;
  interval: string;
  isConnected: boolean;
  isFullscreen: boolean;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: string) => void;
  onToggleFullscreen: () => void;
  onConfigSelect?: (config: StrategyConfig) => void;
  onConfigUnlink?: () => void;
  linkedConfigId?: string | null;
}

/** Тулбар графика: символ, таймфрейм, индикаторы, статус, fullscreen */
export function ChartToolbar({
  symbol,
  interval,
  isConnected,
  isFullscreen,
  onSymbolChange,
  onIntervalChange,
  onToggleFullscreen,
  onConfigSelect,
  onConfigUnlink,
  linkedConfigId,
}: ChartToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-1">
      {/* Поиск символа */}
      <SymbolSearch
        value={symbol}
        onChange={onSymbolChange}
        className="w-48"
      />

      {/* Таймфрейм pills */}
      <div className="flex items-center rounded-lg bg-white/5 p-0.5">
        {INTERVALS.map((iv) => (
          <button
            key={iv.value}
            onClick={() => onIntervalChange(iv.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              interval === iv.value
                ? 'bg-brand-premium/10 text-brand-premium'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {iv.label}
          </button>
        ))}
      </div>

      {/* Конфиг стратегии */}
      {onConfigSelect && (
        <ConfigSelector
          onSelect={onConfigSelect}
          onUnlink={onConfigUnlink}
          linkedConfigId={linkedConfigId ?? null}
        />
      )}

      {/* Индикаторы */}
      <IndicatorSelector />

      {/* Часовой пояс */}
      <TimezoneSelector />

      {/* Статус соединения */}
      <div className="flex items-center gap-1.5 ml-auto">
        {isConnected ? (
          <Wifi className="h-3.5 w-3.5 text-brand-profit" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-brand-loss" />
        )}
        <span className={`text-xs ${isConnected ? 'text-brand-profit' : 'text-brand-loss'}`}>
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Fullscreen */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleFullscreen}
        className="text-gray-400 hover:text-white h-8 w-8"
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}
