import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FlaskConical,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Percent,
  AlertCircle,
  Settings2,
  History,
  Trash2,
  Download,
  StickyNote,
  Clock,
  CheckCircle2,
  XCircle,
  CircleDot,
  CalendarRange,
  DollarSign,
  CandlestickChart,
  Layers,
  Crosshair,
  Activity,
  ArrowDownRight,
  Flame,
  Snowflake,
  Timer,
  RefreshCw,
  EyeOff,
} from 'lucide-react';
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  createSeriesMarkers,
} from 'lightweight-charts';
import type {
  IChartApi,
  Time,
} from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SymbolSearch } from '@/components/ui/symbol-search';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import api from '@/lib/api';
import type {
  StrategyConfig,
  BacktestRunResponse,
  BacktestResultResponse,
  BacktestResultTradeEntry,
  BacktestStatus,
} from '@/types/api';

/* ---- Types ---- */

interface BacktestResult {
  metrics: {
    total_trades: number;
    win_rate: number;
    profit_factor: number;
    total_pnl: number;
    max_drawdown: number;
    sharpe_ratio: number;
    avg_trade_pnl: number;
    best_trade: number;
    worst_trade: number;
  };
  equity_curve: { time: number; equity: number }[];
  trades: {
    id: number;
    side: 'long' | 'short';
    entry_time: string;
    exit_time: string;
    entry_price: number;
    exit_price: number;
    pnl: number;
    pnl_pct: number;
    exit_reason: string;
    entry_bar: number;
    exit_bar: number;
  }[];
}

/* ---- Timeframe mapping ---- */

const TIMEFRAME_OPTIONS = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
] as const;

const CHART_TIMEFRAME_OPTIONS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
] as const;

const TIMEFRAME_TO_BACKEND: Record<string, string> = {
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
};

const BACKEND_TO_LABEL: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
};

/* ---- Backend response mapping ---- */

function mapBackendResultToUI(
  res: BacktestResultResponse,
): BacktestResult {
  const trades = res.trades_log.map(
    (t: BacktestResultTradeEntry, idx: number) => ({
      id: idx + 1,
      side: (t.direction === 'long' ? 'long' : 'short') as 'long' | 'short',
      entry_time: `bar ${t.entry_bar}`,
      exit_time: `bar ${t.exit_bar} (${t.exit_reason})`,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      pnl: t.pnl,
      pnl_pct: t.pnl_pct,
      exit_reason: t.exit_reason,
      entry_bar: t.entry_bar,
      exit_bar: t.exit_bar,
    }),
  );

  const pnls = trades.map((t) => t.pnl);
  const avgTradePnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

  const equityCurve = res.equity_curve.map((pt) => ({
    time: pt.timestamp > 1e12 ? Math.floor(pt.timestamp / 1000) : pt.timestamp,
    equity: pt.equity,
  }));

  return {
    metrics: {
      total_trades: res.total_trades,
      win_rate: Number(res.win_rate) * 100,
      profit_factor: Number(res.profit_factor),
      total_pnl: Number(res.total_pnl),
      max_drawdown: Number(res.max_drawdown),
      sharpe_ratio: Number(res.sharpe_ratio),
      avg_trade_pnl: +avgTradePnl.toFixed(2),
      best_trade: +bestTrade.toFixed(2),
      worst_trade: +worstTrade.toFixed(2),
    },
    equity_curve: equityCurve,
    trades,
  };
}

/* ---- Component ---- */

export function Backtest() {
  const [searchParams] = useSearchParams();
  const urlConfigId = searchParams.get('config_id');

  // Strategy configs
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [selectedConfigId, setSelectedConfigId] = useState('');

  // Form state - загружаем из localStorage если есть
  const savedParams = useRef(() => {
    try {
      const raw = localStorage.getItem('algobond:backtest-params');
      return raw ? JSON.parse(raw) as Record<string, string> : null;
    } catch { return null; }
  });
  const saved = savedParams.current();
  const today = new Date().toISOString().slice(0, 10);
  const [symbol, setSymbol] = useState(saved?.symbol || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState(saved?.timeframe || '15m');
  const [startDate, setStartDate] = useState(saved?.startDate || '2026-01-01');
  const [endDate, setEndDate] = useState(saved?.endDate || today);
  const [initialCapital, setInitialCapital] = useState(saved?.initialCapital || '100');

  // Result state
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [runStatus, setRunStatus] = useState<BacktestStatus | null>(null);
  const [runProgress, setRunProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Polling ref for cleanup
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch user's strategy configs on mount
  useEffect(() => {
    api
      .get<StrategyConfig[]>('/strategies/configs/my')
      .then(({ data }) => {
        setConfigs(data);

        // Если есть config_id в URL - выбрать его и подтянуть symbol/timeframe
        if (urlConfigId) {
          const matched = data.find((c) => c.id === urlConfigId);
          if (matched) {
            setSelectedConfigId(matched.id);
            setSymbol(matched.symbol);
            // Конвертируем timeframe из бэкенд-формата (5) в UI-формат (5m)
            const tfLabel = BACKEND_TO_LABEL[matched.timeframe];
            if (tfLabel) setTimeframe(tfLabel);
            return;
          }
        }

        if (data.length > 0) {
          setSelectedConfigId(data[0].id);
        }
      })
      .catch(() => {
        setConfigs([]);
      })
      .finally(() => setConfigsLoading(false));
  }, [urlConfigId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const pollRunStatus = useCallback(
    (runId: string): Promise<BacktestRunResponse> => {
      return new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const { data: run } = await api.get<BacktestRunResponse>(
              `/backtest/runs/${runId}`,
            );
            setRunStatus(run.status);
            setRunProgress(run.progress);

            if (run.status === 'completed') {
              clearInterval(poll);
              pollingRef.current = null;
              resolve(run);
            } else if (run.status === 'failed') {
              clearInterval(poll);
              pollingRef.current = null;
              reject(new Error(run.error_message ?? 'Бэктест завершился с ошибкой'));
            }
          } catch (err) {
            clearInterval(poll);
            pollingRef.current = null;
            reject(err);
          }
        }, 2000);
        pollingRef.current = poll;
      });
    },
    [],
  );

  // При выборе конфига - подставить символ и ТФ
  const handleConfigChange = useCallback((configId: string) => {
    setSelectedConfigId(configId);
    const cfg = configs.find((c) => c.id === configId);
    if (cfg) {
      setSymbol(cfg.symbol);
      const tfMap: Record<string, string> = { '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', 'D': '1D' };
      setTimeframe(tfMap[cfg.timeframe] || `${cfg.timeframe}m`);
    }
  }, [configs]);

  const runBacktest = async () => {
    if (!selectedConfigId) return;

    // Сохранить параметры в localStorage
    try {
      localStorage.setItem('algobond:backtest-params', JSON.stringify({
        symbol, timeframe, startDate, endDate, initialCapital,
      }));
    } catch {}

    setLoading(true);
    setResult(null);
    setErrorMessage(null);
    setRunStatus('pending');
    setRunProgress(0);

    try {
      // Step 1: Create run
      const { data: run } = await api.post<BacktestRunResponse>('/backtest/runs', {
        strategy_config_id: selectedConfigId,
        symbol,
        timeframe: TIMEFRAME_TO_BACKEND[timeframe] ?? timeframe,
        start_date: `${startDate}T00:00:00Z`,
        end_date: `${endDate}T23:59:59Z`,
        initial_capital: Number(initialCapital),
      });

      setRunStatus(run.status);

      // Step 2: Poll for completion
      if (run.status === 'completed') {
        // Already done (sync backtest)
      } else if (run.status === 'failed') {
        throw new Error(run.error_message ?? 'Бэктест завершился с ошибкой');
      } else {
        await pollRunStatus(run.id);
      }

      // Step 3: Fetch results
      const { data: resultData } = await api.get<BacktestResultResponse>(
        `/backtest/runs/${run.id}/result`,
      );

      const mapped = mapBackendResultToUI(resultData);
      setResult(mapped);
      setRunStatus('completed');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Неизвестная ошибка';
      setErrorMessage(message);

      // Demo fallback
      setResult(generateDemoResult(Number(initialCapital)));
      setRunStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // History state
  const [historyRuns, setHistoryRuns] = useState<BacktestRunResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [topTab, setTopTab] = useState('new');

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get<BacktestRunResponse[]>('/backtest/runs');
      setHistoryRuns(data);
    } catch {
      setHistoryRuns([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Fetch history when switching to history tab
  useEffect(() => {
    if (topTab === 'history') {
      fetchHistory();
    }
  }, [topTab, fetchHistory]);

  const handleLoadResult = (loaded: BacktestResult) => {
    setResult(loaded);
    setTopTab('new');
  };

  const configOptions = configs.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.symbol} / ${c.timeframe})`,
  }));

  const hasNoConfigs = !configsLoading && configs.length === 0;

  return (
    <div className="space-y-8">
      {/* ---- Page Header ---- */}
      <div className="relative">
        <div className="absolute -inset-x-4 -top-4 h-32 bg-gradient-to-b from-brand-accent/[0.03] to-transparent rounded-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-accent/20 to-brand-premium/10 border border-brand-accent/20 shadow-lg shadow-brand-accent/5">
                <FlaskConical className="h-6 w-6 text-brand-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight font-[Tektur]">
                  Бэктест
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Проверьте стратегию на исторических данных
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 h-px bg-gradient-to-r from-brand-accent/30 via-brand-premium/10 to-transparent" />
        </div>
      </div>

      {/* ---- Top-level tabs: Новый бэктест / История ---- */}
      <Tabs defaultValue="new" value={topTab} onValueChange={setTopTab}>
        <TabsList className="bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl">
          <TabsTrigger value="new" className="rounded-lg px-4 py-2 text-xs gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            Новый бэктест
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-4 py-2 text-xs gap-1.5">
            <History className="h-3.5 w-3.5" />
            История
            {historyRuns.length > 0 && (
              <span className="ml-1 text-[10px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded-full font-mono leading-none">
                {historyRuns.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-6">

          {/* No configs warning */}
          {hasNoConfigs && (
            <Card className="border-brand-premium/20 bg-brand-premium/[0.04] mb-6">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10 border border-brand-premium/20 shrink-0">
                  <AlertCircle className="h-4.5 w-4.5 text-brand-premium" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">
                    Нет конфигураций стратегий
                  </p>
                  <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                    Для запуска бэктеста нужна конфигурация стратегии. Создайте её
                    на странице{' '}
                    <a
                      href="/strategies"
                      className="text-brand-premium hover:underline font-medium"
                    >
                      Стратегии
                    </a>
                    .
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---- Config Form ---- */}
          <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
            <CardContent className="p-6">
              {/* Section: Strategy Configuration */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 className="h-4 w-4 text-brand-accent" />
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Конфигурация стратегии
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <Layers className="h-3 w-3" />
                      Стратегия
                    </label>
                    {configsLoading ? (
                      <div className="flex h-9 items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                        <span className="ml-2 text-sm text-gray-500">Загрузка...</span>
                      </div>
                    ) : configs.length > 0 ? (
                      <Select
                        value={selectedConfigId}
                        onChange={handleConfigChange}
                        options={configOptions}
                        className="w-full"
                      />
                    ) : (
                      <div className="flex h-9 items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3">
                        <span className="text-sm text-gray-500">Нет конфигураций</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <CandlestickChart className="h-3 w-3" />
                      Символ
                    </label>
                    <SymbolSearch
                      value={symbol}
                      onChange={setSymbol}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <Timer className="h-3 w-3" />
                      Таймфрейм
                    </label>
                    <Select
                      value={timeframe}
                      onChange={setTimeframe}
                      options={[...TIMEFRAME_OPTIONS]}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.04] mb-6" />

              {/* Section: Market Parameters */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarRange className="h-4 w-4 text-brand-premium" />
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Параметры теста
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <CalendarRange className="h-3 w-3" />
                      Начало
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-white/[0.03] border-white/[0.06] text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <CalendarRange className="h-3 w-3" />
                      Конец
                    </label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-white/[0.03] border-white/[0.06] text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <DollarSign className="h-3 w-3" />
                      Начальный капитал
                    </label>
                    <Input
                      type="number"
                      value={initialCapital}
                      onChange={(e) => setInitialCapital(e.target.value)}
                      className="bg-white/[0.03] border-white/[0.06] text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.04] mb-6" />

              {/* Run button + progress */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Button
                  onClick={runBacktest}
                  disabled={loading || !selectedConfigId}
                  className="bg-gradient-to-r from-brand-premium to-amber-500 text-brand-bg hover:opacity-90 font-semibold shadow-lg shadow-brand-premium/20 min-w-[160px] h-10 text-sm transition-opacity"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Запустить тест
                    </>
                  )}
                </Button>

                {/* Progress indicator */}
                {loading && runStatus && (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-premium" />
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">
                        {runStatus === 'pending' && 'Запуск бэктеста...'}
                        {runStatus === 'running' &&
                          `Вычисление... ${runProgress}%`}
                        {runStatus === 'completed' && 'Загрузка результатов...'}
                      </span>
                      {runStatus === 'running' && (
                        <div className="w-40 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-premium to-amber-500 rounded-full transition-all duration-300"
                            style={{ width: `${runProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Error message */}
              {errorMessage && (
                <div className="mt-4 flex items-center gap-2.5 text-sm text-brand-loss bg-brand-loss/[0.06] border border-brand-loss/10 rounded-lg px-4 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage} (показаны демо-данные)</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Results ---- */}
          {result && (
            <div className="space-y-6 mt-6">
              {/* Metrics summary bar */}
              <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                <CardContent className="p-0">
                  {/* Metrics header */}
                  <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                    <Activity className="h-4 w-4 text-brand-accent" />
                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Результаты
                    </span>
                    <span className="text-xs text-gray-600 font-mono ml-auto">
                      {result.metrics.total_trades} сделок
                    </span>
                  </div>
                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 divide-x divide-white/[0.04]">
                    <MetricCell
                      label="Сделок"
                      value={String(result.metrics.total_trades)}
                      icon={BarChart3}
                      color="text-brand-accent"
                    />
                    <MetricCell
                      label="Win Rate"
                      value={`${result.metrics.win_rate.toFixed(1)}%`}
                      icon={Target}
                      color={result.metrics.win_rate >= 50 ? 'text-brand-profit' : 'text-brand-loss'}
                    />
                    <MetricCell
                      label="Profit Factor"
                      value={result.metrics.profit_factor >= 999 ? 'Inf' : result.metrics.profit_factor.toFixed(2)}
                      icon={TrendingUp}
                      color={result.metrics.profit_factor >= 1 ? 'text-brand-profit' : 'text-brand-loss'}
                    />
                    <MetricCell
                      label="Итого P&L"
                      value={`$${result.metrics.total_pnl.toFixed(0)}`}
                      icon={result.metrics.total_pnl >= 0 ? TrendingUp : TrendingDown}
                      color={result.metrics.total_pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'}
                      highlight
                    />
                    <MetricCell
                      label="Max DD"
                      value={`${result.metrics.max_drawdown.toFixed(1)}%`}
                      icon={ArrowDownRight}
                      color="text-brand-loss"
                    />
                    <MetricCell
                      label="Sharpe"
                      value={result.metrics.sharpe_ratio.toFixed(2)}
                      icon={Percent}
                      color={result.metrics.sharpe_ratio >= 1 ? 'text-brand-premium' : 'text-gray-400'}
                    />
                    <MetricCell
                      label="Avg Trade"
                      value={`$${result.metrics.avg_trade_pnl.toFixed(2)}`}
                      icon={Crosshair}
                      color={result.metrics.avg_trade_pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'}
                    />
                    <MetricCell
                      label="Best"
                      value={`$${result.metrics.best_trade.toFixed(2)}`}
                      icon={Flame}
                      color="text-brand-profit"
                    />
                    <MetricCell
                      label="Worst"
                      value={`$${result.metrics.worst_trade.toFixed(2)}`}
                      icon={Snowflake}
                      color="text-brand-loss"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Charts & Trades tabs */}
              <Tabs defaultValue="chart">
                <TabsList className="bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl">
                  <TabsTrigger value="chart" className="rounded-lg px-4 py-2 text-xs gap-1.5">
                    <CandlestickChart className="h-3.5 w-3.5" />
                    График сделок
                  </TabsTrigger>
                  <TabsTrigger value="equity" className="rounded-lg px-4 py-2 text-xs gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Equity Curve
                  </TabsTrigger>
                  <TabsTrigger value="trades" className="rounded-lg px-4 py-2 text-xs gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Сделки
                    <span className="ml-1 text-[10px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded-full font-mono leading-none">
                      {result.trades.length}
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="chart" className="mt-4">
                  <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                    <CardContent className="p-0">
                      <TradesChart
                        symbol={symbol}
                        timeframe={TIMEFRAME_TO_BACKEND[timeframe] ?? timeframe}
                        startDate={startDate}
                        endDate={endDate}
                        trades={result.trades}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="equity" className="mt-4">
                  <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                    <CardContent className="p-0">
                      <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-brand-premium" />
                        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Equity Curve
                        </span>
                        <span className="text-xs text-gray-600 font-mono ml-auto">
                          ${result.equity_curve.length > 0 ? result.equity_curve[result.equity_curve.length - 1].equity.toFixed(0) : '0'}
                        </span>
                      </div>
                      <EquityChart data={result.equity_curve} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="trades" className="mt-4">
                  <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                    <CardContent className="p-0">
                      <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-brand-accent" />
                        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Журнал сделок
                        </span>
                        <span className="text-xs text-gray-600 font-mono ml-auto">
                          {result.trades.length} записей
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/[0.04] hover:bg-transparent">
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">#</TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">Сторона</TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">Вход</TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">Выход</TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">Цена входа</TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">Цена выхода</TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold text-right">P&L</TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold text-right">P&L %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.trades.map((trade, idx) => (
                              <TableRow
                                key={trade.id}
                                className={`border-white/[0.03] transition-colors hover:bg-white/[0.02] ${
                                  idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]'
                                }`}
                              >
                                <TableCell className="font-mono text-xs text-gray-500">
                                  {trade.id}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={trade.side === 'long' ? 'profit' : 'loss'}>
                                    {trade.side.toUpperCase()}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs font-mono text-gray-400">
                                  {trade.entry_time}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-gray-400">
                                  {trade.exit_time}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-gray-300">
                                  ${trade.entry_price.toFixed(2)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-gray-300">
                                  ${trade.exit_price.toFixed(2)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-mono text-xs font-bold ${
                                    trade.pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                                  }`}
                                >
                                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-mono text-xs ${
                                    trade.pnl_pct >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                                  }`}
                                >
                                  {trade.pnl_pct >= 0 ? '+' : ''}{trade.pnl_pct.toFixed(2)}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && (
            <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] mt-6">
              <CardContent className="flex flex-col items-center justify-center py-24">
                <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-accent/10 to-brand-premium/5 border border-brand-accent/10 mb-6">
                  <FlaskConical className="h-9 w-9 text-gray-600" />
                </div>
                <p className="text-gray-300 text-lg font-semibold font-[Tektur] tracking-tight">
                  Запустите бэктест
                </p>
                <p className="text-gray-500 text-sm mt-2 max-w-xs text-center leading-relaxed">
                  Выберите конфигурацию стратегии, настройте параметры и нажмите
                  "Запустить тест"
                </p>
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {loading && !result && (
            <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] mt-6">
              <CardContent className="flex flex-col items-center justify-center py-24">
                <div className="relative">
                  <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-premium/10 to-brand-accent/5 border border-brand-premium/10">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
                  </div>
                </div>
                <p className="text-gray-300 text-lg font-semibold font-[Tektur] tracking-tight mt-6">
                  Выполняется бэктест
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  {runStatus === 'pending' && 'Инициализация...'}
                  {runStatus === 'running' && `Обработка данных... ${runProgress}%`}
                  {runStatus === 'completed' && 'Подготовка результатов...'}
                  {!runStatus && 'Запуск...'}
                </p>
                {runStatus === 'running' && (
                  <div className="w-48 h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-4">
                    <div
                      className="h-full bg-gradient-to-r from-brand-premium to-amber-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${runProgress}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <BacktestHistory
            runs={historyRuns}
            loading={historyLoading}
            onLoadResult={handleLoadResult}
            onRefresh={fetchHistory}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---- Metric Cell (for results bar) ---- */

function MetricCell({
  label,
  value,
  icon: Icon,
  color,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`px-4 py-4 ${highlight ? 'bg-white/[0.02]' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`h-3 w-3 ${color} opacity-60`} />
        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider leading-none">{label}</p>
      </div>
      <p className={`text-lg font-bold font-mono ${color} leading-none`}>{value}</p>
    </div>
  );
}

/* ---- Equity Curve Chart ---- */

function EquityChart({ data }: { data: { time: number; equity: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current || data.length === 0) return;

    // Cleanup previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d0d1a' },
        textColor: '#8a8a9a',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      rightPriceScale: { borderColor: '#2a2a3e' },
      timeScale: { borderColor: '#2a2a3e', timeVisible: true },
      height: 350,
    });
    chartRef.current = chart;

    const lineSeries = chart.addSeries(AreaSeries, {
      lineColor: '#FFD700',
      topColor: 'rgba(255,215,0,0.15)',
      bottomColor: 'rgba(255,215,0,0.0)',
      lineWidth: 2,
    });

    // Фильтруем null/NaN значения и сортируем
    const mapped = data
      .filter((d) => d.time != null && d.equity != null && !isNaN(d.equity))
      .map((d) => ({ time: d.time as Time, value: d.equity }));

    if (mapped.length > 0) {
      lineSeries.setData(mapped);
    }
    chart.timeScale().fitContent();

    // Resize observer - проверяем chartRef чтобы избежать disposed ошибки
    const ro = new ResizeObserver((entries) => {
      if (!chartRef.current) return;
      for (const entry of entries) {
        try { chartRef.current.applyOptions({ width: entry.contentRect.width }); } catch {}
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      chart.remove();
    };
  }, [data]);

  useEffect(() => {
    const cleanup = initChart();
    return () => cleanup?.();
  }, [initChart]);

  return <div ref={containerRef} className="w-full" style={{ minHeight: 350 }} />;
}

/* ---- Trades Chart (Candlestick + Entry/Exit Markers) ---- */

function TradesChart({
  symbol,
  timeframe: defaultTimeframe,
  startDate: _startDate,
  endDate: _endDate,
  trades,
}: {
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  trades: BacktestResult['trades'];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTimeframe, setActiveTimeframe] = useState(defaultTimeframe);

  // Reset to backtest's TF when props change
  useEffect(() => {
    setActiveTimeframe(defaultTimeframe);
  }, [defaultTimeframe]);

  const initChart = useCallback(async () => {
    if (!containerRef.current) return;
    // Ensure container has dimensions (lightweight-charts requires non-zero size)
    if (containerRef.current.clientWidth === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch candle data for the chart
      const startMs = new Date(_startDate).getTime();
      const endMs = new Date(_endDate).getTime();
      const { data: klines } = await api.get(`/market/klines/${symbol}`, {
        params: { interval: activeTimeframe, start: startMs, end: endMs },
      });

      const candles = (klines as Record<string, unknown>[]).map((d) => {
        const rawTs = Number(d.timestamp ?? d.time);
        return {
          time: (rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs) as Time,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
          volume: Number(d.volume ?? 0),
        };
      });

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#666',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1a1a2e' },
          horzLines: { color: '#1a1a2e' },
        },
        rightPriceScale: {
          borderColor: '#2a2a3e',
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: { borderColor: '#2a2a3e', timeVisible: true },
        height: 450,
      });
      chartRef.current = chart;

      // Candlestick series
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00E676',
        downColor: '#FF1744',
        borderUpColor: '#00E676',
        borderDownColor: '#FF1744',
        wickUpColor: '#00E676',
        wickDownColor: '#FF1744',
      });
      candleSeries.setData(candles);

      // Volume
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeries.setData(
        candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color:
            c.close >= c.open
              ? 'rgba(0,230,118,0.2)'
              : 'rgba(255,23,68,0.2)',
        })),
      );

      // Trade markers
      type MarkerItem = {
        time: Time;
        position: 'belowBar' | 'aboveBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown' | 'circle';
        text: string;
      };
      const markers: MarkerItem[] = [];

      const reasonLabels: Record<string, string> = {
        stop_loss: 'SL',
        take_profit: 'TP',
        take_profit_1: 'TP1',
        take_profit_2: 'TP2',
        trailing_stop: 'TRAIL',
        breakeven: 'BE',
        signal: 'REVERSE',
        end_of_data: 'END',
      };

      for (const trade of trades) {
        const entryCandle = candles[trade.entry_bar];
        const exitCandle = candles[trade.exit_bar];

        if (entryCandle) {
          markers.push({
            time: entryCandle.time,
            position: trade.side === 'long' ? 'belowBar' : 'aboveBar',
            color: trade.side === 'long' ? '#00E676' : '#FF1744',
            shape: trade.side === 'long' ? 'arrowUp' : 'arrowDown',
            text: `${trade.side === 'long' ? 'LONG' : 'SHORT'} $${trade.entry_price.toFixed(4)}`,
          });
        }

        if (exitCandle && trade.exit_bar !== trade.entry_bar) {
          const reasonLabel = reasonLabels[trade.exit_reason] || trade.exit_reason?.toUpperCase() || 'EXIT';
          const pnlStr = `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`;

          markers.push({
            time: exitCandle.time,
            position: trade.side === 'long' ? 'aboveBar' : 'belowBar',
            color: trade.pnl >= 0 ? '#FFD700' : '#FF6D00',
            shape: 'circle',
            text: `${reasonLabel} ${pnlStr}`,
          });
        }
      }

      markers.sort((a, b) => (a.time as number) - (b.time as number));
      if (markers.length > 0) {
        createSeriesMarkers(candleSeries, markers);
      }

      chart.timeScale().fitContent();

      // Resize observer
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      ro.observe(containerRef.current);

      setLoading(false);
      return () => {
        ro.disconnect();
        chart.remove();
      };
    } catch (err) {
      console.error('TradesChart error:', err);
      setError(`Ошибка графика: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }, [symbol, activeTimeframe, trades]);

  useEffect(() => {
    let cancelled = false;
    initChart().then((fn) => {
      if (cancelled && fn) fn();
    });
    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  return (
    <div className="relative">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-bg/90 z-20 text-gray-400 text-sm">
          {error}
        </div>
      )}
      {/* Timeframe selector */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium">Таймфрейм:</span>
          <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5">
            {CHART_TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setActiveTimeframe(tf.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTimeframe === tf.value
                    ? 'bg-brand-premium/10 text-brand-premium shadow-sm'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {activeTimeframe !== defaultTimeframe && (
            <span className="text-[10px] text-gray-600 font-mono">
              (бэктест: {BACKEND_TO_LABEL[defaultTimeframe] ?? defaultTimeframe})
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 top-10 flex items-center justify-center bg-brand-bg/80 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
        </div>
      )}
      <div ref={containerRef} className="w-full" style={{ minHeight: 450 }} />
      {!loading && trades.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 border-t border-white/[0.04] text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-transparent border-b-brand-profit" /> LONG
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-brand-loss" /> SHORT
          </span>
          <span className="text-gray-700">|</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-brand-premium rounded-full" /> SL - стоп-лосс
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-brand-premium rounded-full" /> TP - тейк-профит
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full" /> TRAIL - трейлинг
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full" /> REVERSE - обратный сигнал
          </span>
        </div>
      )}
    </div>
  );
}

/* ---- Backtest History ---- */

const LS_NOTES_KEY = 'algobond_backtest_notes';
const LS_HIDDEN_KEY = 'algobond_backtest_hidden';

function getStoredNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_NOTES_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function setStoredNote(runId: string, note: string): void {
  const notes = getStoredNotes();
  notes[runId] = note;
  localStorage.setItem(LS_NOTES_KEY, JSON.stringify(notes));
}

function getHiddenIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_HIDDEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function hideRun(runId: string): void {
  const hidden = getHiddenIds();
  if (!hidden.includes(runId)) {
    hidden.push(runId);
    localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify(hidden));
  }
}

function statusBadge(status: BacktestStatus, errorMsg: string | null) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-profit bg-brand-profit/10 border border-brand-profit/15 px-2.5 py-1 rounded-lg font-medium">
          <CheckCircle2 className="h-3 w-3" /> Завершён
        </span>
      );
    case 'failed':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-brand-loss bg-brand-loss/10 border border-brand-loss/15 px-2.5 py-1 rounded-lg font-medium"
          title={errorMsg ?? undefined}
        >
          <XCircle className="h-3 w-3" /> Ошибка
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-accent bg-brand-accent/10 border border-brand-accent/15 px-2.5 py-1 rounded-lg font-medium">
          <Loader2 className="h-3 w-3 animate-spin" /> Выполняется
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-premium bg-brand-premium/10 border border-brand-premium/15 px-2.5 py-1 rounded-lg font-medium">
          <Clock className="h-3 w-3" /> В очереди
        </span>
      );
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface HistoryRunCardProps {
  run: BacktestRunResponse;
  onLoad: (result: BacktestResult) => void;
  onHide: (id: string) => void;
}

function HistoryRunCard({ run, onLoad, onHide }: HistoryRunCardProps) {
  const [resultData, setResultData] = useState<BacktestResultResponse | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [note, setNote] = useState(() => getStoredNotes()[run.id] ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto-fetch result for completed runs
  useEffect(() => {
    if (run.status === 'completed' && !resultData && !resultLoading) {
      setResultLoading(true);
      api
        .get<BacktestResultResponse>(`/backtest/runs/${run.id}/result`)
        .then(({ data }) => setResultData(data))
        .catch(() => { /* result not available */ })
        .finally(() => setResultLoading(false));
    }
  }, [run.id, run.status, resultData, resultLoading]);

  const handleNoteChange = (value: string) => {
    setNote(value);
    setStoredNote(run.id, value);
  };

  const handleLoadResult = () => {
    if (resultData) {
      onLoad(mapBackendResultToUI(resultData));
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onHide(run.id);
  };

  const tfLabel = BACKEND_TO_LABEL[run.timeframe] ?? run.timeframe;

  return (
    <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden hover:border-white/[0.1] transition-colors">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <CandlestickChart className="h-4 w-4 text-brand-accent" />
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-white font-semibold text-sm">
                {run.symbol}
              </span>
              <span className="text-xs text-gray-600">/</span>
              <span className="text-xs text-gray-400 font-mono">{tfLabel}</span>
              <span className="hidden sm:inline text-xs text-gray-600 font-mono">
                {run.start_date.slice(0, 10)} - {run.end_date.slice(0, 10)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(run.status, run.error_message)}
          </div>
        </div>

        {/* Info row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5 border-b border-white/[0.04] text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            Капитал: <span className="font-mono text-white ml-0.5">${run.initial_capital}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Создан: <span className="font-mono text-gray-300 ml-0.5">{formatDate(run.created_at)}</span>
          </span>
        </div>

        {/* Metrics row (if result loaded) */}
        {resultData && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5 border-b border-white/[0.04] text-xs">
            <span className="text-gray-500">
              Сделок: <span className="font-mono text-white">{resultData.total_trades}</span>
            </span>
            <span className="text-gray-500">
              Win:{' '}
              <span
                className={`font-mono font-medium ${
                  Number(resultData.win_rate) * 100 >= 50
                    ? 'text-brand-profit'
                    : 'text-brand-loss'
                }`}
              >
                {(Number(resultData.win_rate) * 100).toFixed(1)}%
              </span>
            </span>
            <span className="text-gray-500">
              PnL:{' '}
              <span
                className={`font-mono font-bold ${
                  Number(resultData.total_pnl) >= 0
                    ? 'text-brand-profit'
                    : 'text-brand-loss'
                }`}
              >
                {Number(resultData.total_pnl) >= 0 ? '+' : ''}${Number(resultData.total_pnl).toFixed(2)}
              </span>
            </span>
            <span className="text-gray-500">
              DD:{' '}
              <span className="font-mono text-brand-loss font-medium">
                {Number(resultData.max_drawdown).toFixed(1)}%
              </span>
            </span>
            <span className="text-gray-500">
              Sharpe:{' '}
              <span className={`font-mono font-medium ${
                Number(resultData.sharpe_ratio) >= 1 ? 'text-brand-premium' : 'text-gray-400'
              }`}>
                {Number(resultData.sharpe_ratio).toFixed(2)}
              </span>
            </span>
          </div>
        )}

        {resultLoading && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/[0.04] text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка результатов...
          </div>
        )}

        {/* Error message */}
        {run.status === 'failed' && run.error_message && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/[0.04] text-xs text-brand-loss">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{run.error_message}</span>
          </div>
        )}

        {/* Running progress */}
        {run.status === 'running' && (
          <div className="px-5 py-2.5 border-b border-white/[0.04]">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Выполняется...</span>
              <span className="font-mono">{run.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-accent to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${run.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Notes + Actions */}
        <div className="px-5 py-3.5 flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <StickyNote className="h-3 w-3 text-gray-600" />
              <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Заметка</span>
            </div>
            <Input
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="Добавьте заметку к этому запуску..."
              className="bg-white/[0.03] border-white/[0.04] text-white text-xs h-8 placeholder:text-gray-600"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            {run.status === 'completed' && resultData && (
              <Button
                size="sm"
                onClick={handleLoadResult}
                className="bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20 text-xs h-8 border border-brand-accent/15"
              >
                <Download className="h-3 w-3 mr-1.5" />
                Загрузить
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              onBlur={() => setConfirmDelete(false)}
              className={`text-xs h-8 ${
                confirmDelete
                  ? 'text-brand-loss bg-brand-loss/10 hover:bg-brand-loss/20 border border-brand-loss/15'
                  : 'text-gray-500 hover:text-brand-loss hover:bg-brand-loss/10'
              }`}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {confirmDelete ? 'Точно?' : 'Скрыть'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BacktestHistory({
  runs,
  loading,
  onLoadResult,
  onRefresh,
}: {
  runs: BacktestRunResponse[];
  loading: boolean;
  onLoadResult: (result: BacktestResult) => void;
  onRefresh: () => void;
}) {
  const [hiddenIds, setHiddenIds] = useState<string[]>(getHiddenIds);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visibleRuns = runs
    .filter((r) => !hiddenIds.includes(r.id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleHide = (id: string) => {
    hideRun(id);
    setHiddenIds((prev) => [...prev, id]);
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    setSelected(selected.size === visibleRuns.length ? new Set() : new Set(visibleRuns.map((r) => r.id)));
  };

  const hideSelected = () => {
    for (const id of selected) hideRun(id);
    setHiddenIds((prev) => [...prev, ...selected]);
    setSelected(new Set());
  };

  const deleteAllHidden = async () => {
    for (const id of hiddenIds) {
      try { await api.delete(`/backtest/runs/${id}`); } catch { /* ignore */ }
    }
    localStorage.removeItem(LS_HIDDEN_KEY);
    setHiddenIds([]);
    onRefresh();
  };

  if (loading) {
    return (
      <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
        <CardContent className="flex flex-col items-center justify-center py-24">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-premium/10 to-brand-accent/5 border border-brand-premium/10 mb-4">
            <Loader2 className="h-7 w-7 animate-spin text-brand-premium" />
          </div>
          <span className="text-gray-400 text-sm mt-2">Загрузка истории...</span>
        </CardContent>
      </Card>
    );
  }

  if (visibleRuns.length === 0) {
    return (
      <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
        <CardContent className="flex flex-col items-center justify-center py-24">
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-accent/10 to-brand-premium/5 border border-brand-accent/10 mb-6">
            <History className="h-9 w-9 text-gray-600" />
          </div>
          <p className="text-gray-300 text-lg font-semibold font-[Tektur] tracking-tight">
            Нет запусков
          </p>
          <p className="text-gray-500 text-sm mt-2 max-w-xs text-center leading-relaxed">
            Запустите бэктест, и он появится здесь
          </p>
          {hiddenIds.length > 0 && (
            <div className="flex items-center gap-2 mt-6">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-500 hover:text-white"
                onClick={() => {
                  localStorage.removeItem(LS_HIDDEN_KEY);
                  setHiddenIds([]);
                  onRefresh();
                }}
              >
                <CircleDot className="h-3 w-3 mr-1.5" />
                Показать скрытые ({hiddenIds.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-brand-loss hover:bg-brand-loss/10"
                onClick={deleteAllHidden}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Удалить все скрытые
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const allSelected = selected.size === visibleRuns.length && visibleRuns.length > 0;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button type="button" onClick={selectAll} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-500 hover:text-white transition-colors">
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
              allSelected ? 'border-brand-premium bg-brand-premium' : someSelected ? 'border-brand-premium bg-brand-premium/30' : 'border-gray-600'
            }`}>
              {allSelected && <span className="text-[8px] text-black font-bold">&#10003;</span>}
              {someSelected && !allSelected && <span className="text-[8px] text-black font-bold">-</span>}
            </div>
            {someSelected ? `${selected.size} выбрано` : 'Выбрать все'}
          </button>
          {someSelected && (
            <Button variant="ghost" size="sm" className="text-xs text-brand-loss h-7 hover:bg-brand-loss/10" onClick={hideSelected}>
              <EyeOff className="h-3 w-3 mr-1" />
              Скрыть ({selected.size})
            </Button>
          )}
          <span className="text-xs text-gray-600 font-mono">{visibleRuns.length} запусков</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs text-gray-500 h-7 hover:text-white" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Обновить
          </Button>
          {hiddenIds.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="text-xs text-gray-500 h-7 hover:text-white" onClick={() => { localStorage.removeItem(LS_HIDDEN_KEY); setHiddenIds([]); onRefresh(); }}>
                <CircleDot className="h-3 w-3 mr-1.5" />
                Показать скрытые ({hiddenIds.length})
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-brand-loss h-7 hover:bg-brand-loss/10" onClick={deleteAllHidden}>
                <Trash2 className="h-3 w-3 mr-1" />
                Удалить скрытые
              </Button>
            </>
          )}
        </div>
      </div>
      {/* List with checkboxes */}
      {visibleRuns.map((run) => (
        <div key={run.id} className="flex items-start gap-2">
          <button type="button" onClick={() => toggleSelect(run.id)} className="mt-4 flex-shrink-0">
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              selected.has(run.id) ? 'border-brand-premium bg-brand-premium' : 'border-gray-600 hover:border-gray-400'
            }`}>
              {selected.has(run.id) && <span className="text-[9px] text-black font-bold">&#10003;</span>}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <HistoryRunCard run={run} onLoad={onLoadResult} onHide={handleHide} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Demo Data ---- */

function generateDemoResult(capital: number): BacktestResult {
  const trades: BacktestResult['trades'] = [];
  const equityCurve: BacktestResult['equity_curve'] = [];

  let equity = capital;
  const baseTime = new Date('2025-01-15').getTime() / 1000;
  const step = 86400; // ~1 day

  let wins = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let maxDrawdown = 0;
  let peak = equity;

  for (let i = 0; i < 87; i++) {
    const isWin = Math.random() < 0.58;
    const pnlPct = isWin
      ? Math.random() * 4 + 0.5
      : -(Math.random() * 3 + 0.3);
    const pnl = equity * (pnlPct / 100);
    equity += pnl;

    if (isWin) {
      wins++;
      totalProfit += pnl;
    } else {
      totalLoss += Math.abs(pnl);
    }

    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const entryPrice = 65000 + Math.random() * 5000;
    const exitPrice = entryPrice * (1 + pnlPct / 100);

    const entryDate = new Date((baseTime + i * step) * 1000);
    const exitDate = new Date((baseTime + i * step + 14400) * 1000);

    trades.push({
      id: i + 1,
      side: Math.random() > 0.4 ? 'long' : 'short',
      entry_time: entryDate.toISOString().slice(0, 16).replace('T', ' '),
      exit_time: exitDate.toISOString().slice(0, 16).replace('T', ' '),
      entry_price: +entryPrice.toFixed(2),
      exit_price: +exitPrice.toFixed(2),
      pnl: +pnl.toFixed(2),
      pnl_pct: +pnlPct.toFixed(2),
      exit_reason: ['stop_loss', 'take_profit', 'trailing_stop', 'signal'][Math.floor(Math.random() * 4)],
      entry_bar: i * 10,
      exit_bar: i * 10 + 5 + Math.floor(Math.random() * 10),
    });

    equityCurve.push({
      time: baseTime + i * step,
      equity: +equity.toFixed(2),
    });
  }

  const totalPnl = equity - capital;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99 : 0;

  return {
    metrics: {
      total_trades: trades.length,
      win_rate: (wins / trades.length) * 100,
      profit_factor: +profitFactor.toFixed(2),
      total_pnl: +totalPnl.toFixed(2),
      max_drawdown: +maxDrawdown.toFixed(2),
      sharpe_ratio: +(1.2 + Math.random() * 0.8).toFixed(2),
      avg_trade_pnl: +(totalPnl / trades.length).toFixed(2),
      best_trade: Math.max(...trades.map((t) => t.pnl)),
      worst_trade: Math.min(...trades.map((t) => t.pnl)),
    },
    equity_curve: equityCurve,
    trades,
  };
}
