import { Maximize2, Minimize2, Wifi, WifiOff, Play, Square, RefreshCw, Loader2 } from 'lucide-react';
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
  backtestActive?: boolean;
  backtestLoading?: boolean;
  backtestProgress?: number;
  backtestHasCache?: boolean;
  onToggleBacktest?: () => void;
  onRefreshBacktest?: () => void;
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
  backtestActive,
  backtestLoading,
  backtestProgress,
  backtestHasCache,
  onToggleBacktest,
  onRefreshBacktest,
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

      {/* Бэктест */}
      {onToggleBacktest && linkedConfigId && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleBacktest}
            disabled={backtestLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer border ${
              backtestActive
                ? 'border-brand-profit/30 bg-brand-profit/10 text-brand-profit'
                : 'border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/20'
            }`}
          >
            {backtestLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : backtestActive ? (
              <Square className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span>
              {backtestLoading
                ? `${backtestProgress ?? 0}%`
                : backtestActive
                  ? 'Backtest'
                  : 'Backtest'}
            </span>
          </button>
          {backtestActive && backtestHasCache && onRefreshBacktest && (
            <button
              type="button"
              onClick={onRefreshBacktest}
              disabled={backtestLoading}
              title="Перезапустить бэктест"
              className="p-1 text-gray-500 hover:text-white transition-colors rounded"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${backtestLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      )}

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
