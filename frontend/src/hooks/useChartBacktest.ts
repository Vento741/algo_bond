import { useEffect, useRef, useCallback, useState } from 'react';
import { createSeriesMarkers } from 'lightweight-charts';
import type {
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarkerBar,
  Time,
} from 'lightweight-charts';
import axios from 'axios';
import api from '@/lib/api';
import { CHART_COLORS } from '@/lib/chart-constants';
import type {
  BacktestRunResponse,
  BacktestResultResponse,
  BacktestResultTradeEntry,
} from '@/types/api';

const POLL_INTERVAL = 2000;

/** Метрики бэктеста для stats bar */
export interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
}

/** Кешированные данные бэктеста */
interface CachedBacktest {
  metrics: BacktestMetrics;
  trades: BacktestResultTradeEntry[];
  timestamp: number;
}

interface UseChartBacktestOptions {
  configId: string | null;
  symbol: string;
  interval: string;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  enabled: boolean;
}

interface UseChartBacktestResult {
  metrics: BacktestMetrics | null;
  trades: BacktestResultTradeEntry[];
  loading: boolean;
  progress: number;
  error: string | null;
  runBacktest: () => void;
  hasCache: boolean;
}

const REASON_LABELS: Record<string, string> = {
  sl: 'SL',
  tp: 'TP',
  tp1: 'TP1',
  tp2: 'TP2',
  trailing: 'TRAIL',
  reverse: 'REV',
  signal: 'SIG',
};

function getCacheKey(configId: string, symbol: string, tf: string): string {
  return `bt:${configId}:${symbol}:${tf}`;
}

function loadCache(configId: string, symbol: string, tf: string): CachedBacktest | null {
  try {
    const raw = localStorage.getItem(getCacheKey(configId, symbol, tf));
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedBacktest;
    // Кеш валиден 24 часа
    if (Date.now() - data.timestamp > 86400000) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(configId: string, symbol: string, tf: string, metrics: BacktestMetrics, trades: BacktestResultTradeEntry[]) {
  try {
    const data: CachedBacktest = { metrics, trades, timestamp: Date.now() };
    localStorage.setItem(getCacheKey(configId, symbol, tf), JSON.stringify(data));
  } catch {
    // localStorage full - ignore
  }
}

/** Конвертация timestamp (ms или s) в секунды */
function toSec(ts: number): number {
  return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

/** Рисует маркеры сделок на графике используя entry_time/exit_time из trades */
function drawTradeMarkers(
  candleSeries: ISeriesApi<'Candlestick'>,
  trades: BacktestResultTradeEntry[],
): ISeriesMarkersPluginApi<Time> | null {
  const markers: SeriesMarkerBar<Time>[] = [];

  for (const trade of trades) {
    const entryTs = trade.entry_time;
    const exitTs = trade.exit_time;
    const isLong = trade.direction === 'long';

    if (entryTs && entryTs > 0) {
      markers.push({
        time: toSec(entryTs) as Time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isLong ? CHART_COLORS.up : CHART_COLORS.down,
        shape: isLong ? 'arrowUp' : 'arrowDown',
        text: `${isLong ? 'LONG' : 'SHORT'} $${Number(trade.entry_price).toFixed(4)}`,
        size: 1,
      });
    }

    if (exitTs && exitTs > 0 && trade.exit_bar !== trade.entry_bar) {
      const reasonLabel = REASON_LABELS[trade.exit_reason?.toLowerCase()] || trade.exit_reason?.toUpperCase() || 'EXIT';
      const pnlStr = `${Number(trade.pnl) >= 0 ? '+' : ''}$${Number(trade.pnl).toFixed(2)}`;
      markers.push({
        time: toSec(exitTs) as Time,
        position: isLong ? 'aboveBar' : 'belowBar',
        color: Number(trade.pnl) >= 0 ? CHART_COLORS.premium : '#FF6D00',
        shape: 'circle',
        text: `${reasonLabel} ${pnlStr}`,
        size: 1,
      });
    }
  }

  markers.sort((a, b) => (a.time as number) - (b.time as number));
  if (markers.length > 0) {
    try {
      return createSeriesMarkers(candleSeries, markers);
    } catch {
      return null;
    }
  }
  return null;
}

export function useChartBacktest({
  configId,
  symbol,
  interval,
  candleSeries,
  enabled,
}: UseChartBacktestOptions): UseChartBacktestResult {
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [trades, setTrades] = useState<BacktestResultTradeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasCache, setHasCache] = useState(false);

  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Очистка маркеров
  const clearMarkers = useCallback(() => {
    if (markersPluginRef.current) {
      markersPluginRef.current.detach();
      markersPluginRef.current = null;
    }
  }, []);

  // Рисование маркеров
  const applyMarkers = useCallback(
    (tradesList: BacktestResultTradeEntry[]) => {
      clearMarkers();
      if (!candleSeries || tradesList.length === 0) return;
      try {
        markersPluginRef.current = drawTradeMarkers(candleSeries, tradesList);
      } catch {
        // Маркеры могут не совпасть с данными на графике
      }
    },
    [candleSeries, clearMarkers],
  );

  // Конвертация результата в метрики
  const resultToMetrics = useCallback((r: BacktestResultResponse): BacktestMetrics => ({
    totalTrades: r.total_trades,
    winRate: r.win_rate,
    totalPnl: r.total_pnl,
    totalPnlPct: r.total_pnl_pct,
    maxDrawdown: r.max_drawdown,
    sharpeRatio: r.sharpe_ratio,
    profitFactor: r.profit_factor,
  }), []);

  // Загрузка кеша при смене конфига
  useEffect(() => {
    if (!configId || !enabled) {
      clearMarkers();
      setMetrics(null);
      setTrades([]);
      setHasCache(false);
      return;
    }

    const cached = loadCache(configId, symbol, interval);
    if (cached) {
      setMetrics(cached.metrics);
      setTrades(cached.trades);
      setHasCache(true);
      if (candleSeries) {
        applyMarkers(cached.trades);
      }
    } else {
      setHasCache(false);
    }
  }, [configId, symbol, interval, enabled, candleSeries, clearMarkers, applyMarkers]);

  // Запуск бэктеста
  const runBacktest = useCallback(async () => {
    if (!configId || !candleSeries) return;

    // Отмена предыдущего
    abortRef.current?.abort();
    if (pollingRef.current) clearInterval(pollingRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setProgress(0);
    setError(null);
    clearMarkers();

    try {
      // 3 месяца назад
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);

      const { data: run } = await api.post<BacktestRunResponse>(
        '/backtest/runs',
        {
          strategy_config_id: configId,
          symbol,
          timeframe: interval,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          initial_capital: 100,
        },
        { signal: controller.signal },
      );

      // Поллинг до завершения
      if (run.status !== 'completed' && run.status !== 'failed') {
        await new Promise<void>((resolve, reject) => {
          const poll = setInterval(async () => {
            if (controller.signal.aborted) {
              clearInterval(poll);
              reject(new Error('Cancelled'));
              return;
            }
            try {
              const { data: status } = await api.get<BacktestRunResponse>(
                `/backtest/runs/${run.id}`,
                { signal: controller.signal },
              );
              setProgress(status.progress);
              if (status.status === 'completed') {
                clearInterval(poll);
                resolve();
              } else if (status.status === 'failed') {
                clearInterval(poll);
                reject(new Error(status.error_message ?? 'Бэктест завершился с ошибкой'));
              }
            } catch (err) {
              if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') {
                clearInterval(poll);
                reject(new Error('Cancelled'));
              }
            }
          }, POLL_INTERVAL);
          pollingRef.current = poll;
        });
      } else if (run.status === 'failed') {
        throw new Error(run.error_message ?? 'Бэктест завершился с ошибкой');
      }

      // Получить результат
      const { data: result } = await api.get<BacktestResultResponse>(
        `/backtest/runs/${run.id}/result`,
        { signal: controller.signal },
      );

      const m = resultToMetrics(result);
      const tradesList = result.trades_log ?? [];

      setMetrics(m);
      setTrades(tradesList);
      setProgress(100);
      applyMarkers(tradesList);

      // Кешировать
      saveCache(configId, symbol, interval, m, tradesList);
      setHasCache(true);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Ошибка бэктеста';
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [configId, symbol, interval, candleSeries, clearMarkers, applyMarkers, resultToMetrics]);

  // Автозапуск при включении (если нет кеша)
  useEffect(() => {
    if (enabled && configId && candleSeries && !metrics && !loading && !hasCache) {
      runBacktest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, configId, candleSeries]);

  // Cleanup
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (pollingRef.current) clearInterval(pollingRef.current);
      clearMarkers();
    };
  }, [clearMarkers]);

  return { metrics, trades, loading, progress, error, runBacktest, hasCache };
}
