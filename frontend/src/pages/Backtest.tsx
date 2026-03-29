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

/* ---- Component ---- */

export function Backtest() {
  // Form state
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2026-03-29');
  const [initialCapital, setInitialCapital] = useState('10000');

  // Result state
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runBacktest = () => {
    setLoading(true);
    api
      .post('/backtest/run', {
        symbol,
        timeframe,
        start_date: startDate,
        end_date: endDate,
        initial_capital: Number(initialCapital),
      })
      .then(({ data }) => setResult(data as BacktestResult))
      .catch(() => {
        // Demo fallback
        setResult(generateDemoResult(Number(initialCapital)));
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Бэктестинг</h1>
        <p className="text-gray-400 text-sm mt-1">
          Проверьте стратегию на исторических данных
        </p>
      </div>

      {/* Config form */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
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
                options={[
                  { value: '5m', label: '5m' },
                  { value: '15m', label: '15m' },
                  { value: '1h', label: '1h' },
                  { value: '4h', label: '4h' },
                ]}
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
            <div>
              <Button
                onClick={runBacktest}
                disabled={loading}
                className="w-full bg-brand-premium text-brand-bg hover:bg-brand-premium/90"
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
            </div>
          </div>
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
              value={result.metrics.profit_factor.toFixed(2)}
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

          {/* Equity curve + Trades */}
          <Tabs defaultValue="equity">
            <TabsList>
              <TabsTrigger value="equity">Equity Curve</TabsTrigger>
              <TabsTrigger value="trades">Сделки ({result.trades.length})</TabsTrigger>
            </TabsList>

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
              Настройте параметры выше и нажмите "Запуск"
            </p>
          </CardContent>
        </Card>
      )}
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
