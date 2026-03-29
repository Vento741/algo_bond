import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FlaskConical,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Shield,
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
} from 'lucide-react';
import {
  createChart,
  type IChartApi,
  ColorType,
  type Time,
} from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
  // Strategy configs
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [selectedConfigId, setSelectedConfigId] = useState('');

  // Form state
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2026-03-29');
  const [initialCapital, setInitialCapital] = useState('10000');

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
        if (data.length > 0) {
          setSelectedConfigId(data[0].id);
        }
      })
      .catch(() => {
        setConfigs([]);
      })
      .finally(() => setConfigsLoading(false));
  }, []);

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

  const runBacktest = async () => {
    if (!selectedConfigId) return;

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Бэктестинг</h1>
        <p className="text-gray-400 text-sm mt-1">
          Проверьте стратегию на исторических данных
        </p>
      </div>

      {/* Top-level tabs: Новый бэктест / История */}
      <Tabs defaultValue="new" value={topTab} onValueChange={setTopTab}>
        <TabsList>
          <TabsTrigger value="new">
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
            Новый бэктест
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            История
            {historyRuns.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full font-mono">
                {historyRuns.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new">

      {/* No configs warning */}
      {hasNoConfigs && (
        <Card className="border-brand-premium/20 bg-brand-premium/5">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-brand-premium shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-medium">
                Нет конфигураций стратегий
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Для запуска бэктеста нужна конфигурация стратегии. Создайте её
                на странице{' '}
                <a
                  href="/strategies"
                  className="text-brand-premium hover:underline"
                >
                  Стратегии
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config form */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 items-end">
            <div className="lg:col-span-2">
              <label className="text-xs text-gray-400 block mb-1.5 flex items-center gap-1">
                <Settings2 className="h-3 w-3" />
                Конфигурация стратегии
              </label>
              {configsLoading ? (
                <div className="flex h-9 items-center rounded-md border border-white/10 bg-white/5 px-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                  <span className="ml-2 text-sm text-gray-500">Загрузка...</span>
                </div>
              ) : configs.length > 0 ? (
                <Select
                  value={selectedConfigId}
                  onChange={setSelectedConfigId}
                  options={configOptions}
                  className="w-full"
                />
              ) : (
                <div className="flex h-9 items-center rounded-md border border-white/10 bg-white/5 px-3">
                  <span className="text-sm text-gray-500">Нет конфигураций</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Символ</label>
              <Select
                value={symbol}
                onChange={setSymbol}
                options={[
                  { value: 'BTCUSDT', label: 'BTC/USDT' },
                  { value: 'ETHUSDT', label: 'ETH/USDT' },
                  { value: 'RIVERUSDT', label: 'RIVER/USDT' },
                  { value: 'SOLUSDT', label: 'SOL/USDT' },
                ]}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Таймфрейм</label>
              <Select
                value={timeframe}
                onChange={setTimeframe}
                options={[...TIMEFRAME_OPTIONS]}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Начало</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Конец</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Капитал ($)</label>
              <Input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                className="bg-white/5 border-white/10 text-white font-mono"
              />
            </div>
          </div>

          {/* Run button — full width row below on small screens, inline on large */}
          <div className="mt-4 flex items-center gap-4">
            <Button
              onClick={runBacktest}
              disabled={loading || !selectedConfigId}
              className="bg-brand-premium text-brand-bg hover:bg-brand-premium/90 min-w-[140px]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Запуск
                </>
              )}
            </Button>

            {/* Progress indicator */}
            {loading && runStatus && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-premium" />
                <span className="text-gray-400">
                  {runStatus === 'pending' && 'Запуск бэктеста...'}
                  {runStatus === 'running' &&
                    `Вычисление... ${runProgress}%`}
                  {runStatus === 'completed' && 'Загрузка результатов...'}
                </span>
                {runStatus === 'running' && (
                  <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-premium rounded-full transition-all duration-300"
                      style={{ width: `${runProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="mt-3 flex items-center gap-2 text-sm text-brand-loss">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{errorMessage} (показаны демо-данные)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Metrics cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="Сделок"
              value={String(result.metrics.total_trades)}
              icon={BarChart3}
              color="text-brand-accent"
            />
            <MetricCard
              label="Win Rate"
              value={`${result.metrics.win_rate.toFixed(1)}%`}
              icon={Target}
              color={result.metrics.win_rate >= 50 ? 'text-brand-profit' : 'text-brand-loss'}
            />
            <MetricCard
              label="Profit Factor"
              value={result.metrics.profit_factor >= 999 ? '∞' : result.metrics.profit_factor.toFixed(2)}
              icon={TrendingUp}
              color={result.metrics.profit_factor >= 1 ? 'text-brand-profit' : 'text-brand-loss'}
            />
            <MetricCard
              label="Итого P&L"
              value={`$${result.metrics.total_pnl.toFixed(0)}`}
              icon={result.metrics.total_pnl >= 0 ? TrendingUp : TrendingDown}
              color={result.metrics.total_pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${result.metrics.max_drawdown.toFixed(1)}%`}
              icon={Shield}
              color="text-brand-loss"
            />
            <MetricCard
              label="Sharpe"
              value={result.metrics.sharpe_ratio.toFixed(2)}
              icon={Percent}
              color={result.metrics.sharpe_ratio >= 1 ? 'text-brand-premium' : 'text-gray-400'}
            />
          </div>

          {/* Equity curve + Chart + Trades */}
          <Tabs defaultValue="chart">
            <TabsList>
              <TabsTrigger value="chart">График сделок</TabsTrigger>
              <TabsTrigger value="equity">Equity Curve</TabsTrigger>
              <TabsTrigger value="trades">Сделки ({result.trades.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="chart">
              <Card className="border-white/5 bg-white/[0.02]">
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

            <TabsContent value="equity">
              <Card className="border-white/5 bg-white/[0.02]">
                <CardContent className="p-0">
                  <EquityChart data={result.equity_curve} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trades">
              <Card className="border-white/5 bg-white/[0.02]">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Сторона</TableHead>
                        <TableHead>Вход</TableHead>
                        <TableHead>Выход</TableHead>
                        <TableHead>Цена входа</TableHead>
                        <TableHead>Цена выхода</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead className="text-right">P&L %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.trades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell className="font-mono text-xs text-gray-500">
                            {trade.id}
                          </TableCell>
                          <TableCell>
                            <Badge variant={trade.side === 'long' ? 'profit' : 'loss'}>
                              {trade.side.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {trade.entry_time}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {trade.exit_time}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            ${trade.entry_price.toFixed(2)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
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
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <FlaskConical className="h-12 w-12 text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg font-medium">
              Запустите бэктест
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Выберите конфигурацию стратегии, настройте параметры и нажмите
              "Запуск"
            </p>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="history">
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

/* ---- Metric Card ---- */

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="border-white/5 bg-white/[0.02]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      </CardContent>
    </Card>
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
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#666',
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

    const lineSeries = chart.addAreaSeries({
      lineColor: '#FFD700',
      topColor: 'rgba(255,215,0,0.15)',
      bottomColor: 'rgba(255,215,0,0.0)',
      lineWidth: 2,
    });

    const mapped = data.map((d) => ({
      time: d.time as Time,
      value: d.equity,
    }));
    lineSeries.setData(mapped);
    chart.timeScale().fitContent();

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
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
      const { data: klines } = await api.get(`/market/klines/${symbol}`, {
        params: { interval: activeTimeframe, limit: 1000 },
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
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#00E676',
        downColor: '#FF1744',
        borderUpColor: '#00E676',
        borderDownColor: '#FF1744',
        wickUpColor: '#00E676',
        wickDownColor: '#FF1744',
      });
      candleSeries.setData(candles);

      // Volume
      const volumeSeries = chart.addHistogramSeries({
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

      // Trade markers on candlestick chart
      type MarkerItem = {
        time: Time;
        position: 'belowBar' | 'aboveBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown' | 'circle';
        text: string;
      };
      const markers: MarkerItem[] = [];

      for (const trade of trades) {
        // Extract bar timestamps from trade entry/exit times
        // entry_time format: "bar 271" — we need actual timestamps
        // Use entry_price to find closest candle
        const entryCandle = candles.find(
          (c) => Math.abs(c.close - trade.entry_price) / trade.entry_price < 0.01,
        );
        const exitCandle = candles.find(
          (c) => Math.abs(c.close - trade.exit_price) / trade.exit_price < 0.01,
        );

        if (entryCandle) {
          markers.push({
            time: entryCandle.time,
            position: trade.side === 'long' ? 'belowBar' : 'aboveBar',
            color: trade.side === 'long' ? '#00E676' : '#FF1744',
            shape: trade.side === 'long' ? 'arrowUp' : 'arrowDown',
            text: `${trade.side === 'long' ? 'BUY' : 'SELL'} $${trade.entry_price.toFixed(4)}`,
          });
        }

        if (exitCandle && exitCandle.time !== entryCandle?.time) {
          markers.push({
            time: exitCandle.time,
            position: trade.side === 'long' ? 'aboveBar' : 'belowBar',
            color: trade.pnl >= 0 ? '#FFD700' : '#FF6D00',
            shape: 'circle',
            text: `EXIT ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`,
          });
        }
      }

      // Sort markers by time (required by lightweight-charts)
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      if (markers.length > 0) {
        candleSeries.setMarkers(markers);
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
      // Cleanup chart directly via ref
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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Таймфрейм:</span>
          <div className="flex items-center rounded-lg bg-white/5 p-0.5">
            {CHART_TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setActiveTimeframe(tf.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTimeframe === tf.value
                    ? 'bg-brand-premium/10 text-brand-premium'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {activeTimeframe !== defaultTimeframe && (
            <span className="text-[10px] text-gray-600">
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
        <div className="flex items-center gap-4 px-4 py-2 border-t border-white/5 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-brand-profit rounded-sm" /> Long вход
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-brand-loss rounded-sm" /> Short вход
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-brand-premium rounded-full" /> Выход (profit)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full" /> Выход (loss)
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
        <span className="inline-flex items-center gap-1 text-xs text-brand-profit bg-brand-profit/10 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="h-3 w-3" /> Завершён
        </span>
      );
    case 'failed':
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-brand-loss bg-brand-loss/10 px-2 py-0.5 rounded-full"
          title={errorMsg ?? undefined}
        >
          <XCircle className="h-3 w-3" /> Ошибка
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full">
          <Loader2 className="h-3 w-3 animate-spin" /> Выполняется
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-brand-premium bg-brand-premium/10 px-2 py-0.5 rounded-full">
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
    <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-white font-medium text-sm">
              {run.symbol}
            </span>
            <span className="text-xs text-gray-500">/</span>
            <span className="text-xs text-gray-400 font-mono">{tfLabel}</span>
            <span className="text-xs text-gray-600 font-mono">
              {run.start_date.slice(0, 10)} → {run.end_date.slice(0, 10)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(run.status, run.error_message)}
          </div>
        </div>

        {/* Info row */}
        <div className="flex items-center gap-6 px-4 py-2.5 border-b border-white/5 text-xs text-gray-400">
          <span>
            Капитал: <span className="font-mono text-white">${run.initial_capital}</span>
          </span>
          <span>
            Создан: <span className="font-mono text-gray-300">{formatDate(run.created_at)}</span>
          </span>
        </div>

        {/* Metrics row (if result loaded) */}
        {resultData && (
          <div className="flex items-center gap-6 px-4 py-2.5 border-b border-white/5 text-xs">
            <span className="text-gray-400">
              Сделок: <span className="font-mono text-white">{resultData.total_trades}</span>
            </span>
            <span className="text-gray-400">
              Win:{' '}
              <span
                className={`font-mono ${
                  Number(resultData.win_rate) * 100 >= 50
                    ? 'text-brand-profit'
                    : 'text-brand-loss'
                }`}
              >
                {(Number(resultData.win_rate) * 100).toFixed(1)}%
              </span>
            </span>
            <span className="text-gray-400">
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
            <span className="text-gray-400">
              DD:{' '}
              <span className="font-mono text-brand-loss">
                {Number(resultData.max_drawdown).toFixed(1)}%
              </span>
            </span>
          </div>
        )}

        {resultLoading && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка результатов...
          </div>
        )}

        {/* Error message */}
        {run.status === 'failed' && run.error_message && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 text-xs text-brand-loss">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{run.error_message}</span>
          </div>
        )}

        {/* Notes + Actions */}
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <StickyNote className="h-3 w-3 text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Заметка</span>
            </div>
            <Input
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="Добавьте заметку к этому запуску..."
              className="bg-white/5 border-white/5 text-white text-xs h-8 placeholder:text-gray-600"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            {run.status === 'completed' && resultData && (
              <Button
                size="sm"
                onClick={handleLoadResult}
                className="bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20 text-xs h-8"
              >
                <Download className="h-3 w-3 mr-1" />
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
                  ? 'text-brand-loss bg-brand-loss/10 hover:bg-brand-loss/20'
                  : 'text-gray-500 hover:text-brand-loss hover:bg-brand-loss/10'
              }`}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {confirmDelete ? 'Точно?' : 'Удалить'}
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

  const visibleRuns = runs
    .filter((r) => !hiddenIds.includes(r.id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleHide = (id: string) => {
    hideRun(id);
    setHiddenIds((prev) => [...prev, id]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
        <span className="ml-3 text-gray-400">Загрузка истории...</span>
      </div>
    );
  }

  if (visibleRuns.length === 0) {
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <History className="h-12 w-12 text-gray-600 mb-4" />
          <p className="text-gray-400 text-lg font-medium">Нет запусков</p>
          <p className="text-gray-500 text-sm mt-1">
            Запустите бэктест, и он появится здесь
          </p>
          {hiddenIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 text-xs text-gray-500"
              onClick={() => {
                localStorage.removeItem(LS_HIDDEN_KEY);
                setHiddenIds([]);
                onRefresh();
              }}
            >
              <CircleDot className="h-3 w-3 mr-1" />
              Показать скрытые ({hiddenIds.length})
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {visibleRuns.length} {visibleRuns.length === 1 ? 'запуск' : visibleRuns.length < 5 ? 'запуска' : 'запусков'}
        </p>
        <div className="flex items-center gap-2">
          {hiddenIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 h-7"
              onClick={() => {
                localStorage.removeItem(LS_HIDDEN_KEY);
                setHiddenIds([]);
                onRefresh();
              }}
            >
              <CircleDot className="h-3 w-3 mr-1" />
              Показать скрытые ({hiddenIds.length})
            </Button>
          )}
        </div>
      </div>
      {visibleRuns.map((run) => (
        <HistoryRunCard
          key={run.id}
          run={run}
          onLoad={onLoadResult}
          onHide={handleHide}
        />
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
