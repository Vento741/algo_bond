import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  ShieldAlert,
  Radio,
  BarChart3,
  Brain,
  Gauge,
  BarChart2,
} from 'lucide-react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TradingChart } from '@/components/charts/TradingChart';
import { ChartToolbar } from '@/components/charts/ChartToolbar';
import { useMarketStream } from '@/hooks/useMarketStream';
import { useIndicators } from '@/hooks/useIndicators';
import { useChartSignals } from '@/hooks/useChartSignals';
import { useChartLazyLoad } from '@/hooks/useChartLazyLoad';
import { useChartBacktest } from '@/hooks/useChartBacktest';
import type { BacktestMetrics } from '@/hooks/useChartBacktest';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/lib/api';
import type { KlineData } from '@/lib/chart-types';
import type { StrategyConfig } from '@/types/api';

export function Chart() {
  const { symbol: paramSymbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();

  const [symbol, setSymbol] = useState(paramSymbol || '');
  const [interval, setInterval] = useState('15');

  // Загрузить предпочтения пользователя при первом открытии (без paramSymbol)
  useEffect(() => {
    if (paramSymbol) return;
    const controller = new AbortController();
    api.get<{ default_symbol: string; default_timeframe: string }>('/auth/settings', { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const sym = data.default_symbol || 'BTCUSDT';
        setSymbol(sym);
        navigate(`/chart/${sym}`, { replace: true });
        if (data.default_timeframe) {
          const tf = data.default_timeframe.replace(/m$/i, '');
          const TF_MAP: Record<string, string> = { '1h': '60', '4h': '240', '1d': 'D', '1D': 'D' };
          setInterval(TF_MAP[data.default_timeframe] ?? tf);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSymbol('BTCUSDT');
        navigate('/chart/BTCUSDT', { replace: true });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [linkedConfigId, setLinkedConfigId] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState<{
    time: number | null;
    price: number | null;
    volume: number | null;
  }>({ time: null, price: null, volume: null });

  const { lastPrice, lastKline, isConnected } = useMarketStream(symbol, interval);

  // Chart API для индикаторов - state чтобы хук перерисовывался при создании chart
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);

  // Candle series для маркеров сигналов
  const [candleSeries, setCandleSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);

  // Callback вызывается из TradingChart при создании chart
  const handleChartReady = useCallback((chart: IChartApi | null) => {
    chartApiRef.current = chart;
    setChartApi(chart);
  }, []);

  // Callback при создании candle series
  const handleCandleSeriesReady = useCallback((series: ISeriesApi<'Candlestick'> | null) => {
    setCandleSeries(series);
  }, []);

  // Volume series для lazy-load
  const [volumeSeries, setVolumeSeries] = useState<ISeriesApi<'Histogram'> | null>(null);
  const handleVolumeSeriesReady = useCallback((series: ISeriesApi<'Histogram'> | null) => {
    setVolumeSeries(series);
  }, []);

  // Индикаторы
  useIndicators({ chart: chartApi, klines });

  // Ленивая подгрузка истории при скролле влево
  const { isLoadingOlder } = useChartLazyLoad({
    chartApi, candleSeries, volumeSeries, klines, setKlines, symbol, interval,
  });

  // Бэктест
  const [backtestActive, setBacktestActive] = useState(false);

  // Сигналы на графике (скрыты когда бэктест активен)
  const { latestSignal, signalsCount } = useChartSignals({
    configId: backtestActive ? null : linkedConfigId,
    candleSeries,
  });

  // Inline бэктест
  const {
    metrics: btMetrics,
    loading: btLoading,
    progress: btProgress,
    error: btError,
    runBacktest,
    hasCache: btHasCache,
  } = useChartBacktest({
    configId: linkedConfigId,
    symbol,
    interval,
    candleSeries,
    enabled: backtestActive,
  });

  // Загрузка исторических данных с отменой предыдущего запроса
  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    setLoading(true);
    setIsDemo(false);
    api
      .get(`/market/candles/${symbol}`, {
        params: { interval, limit: 500 },
        signal: controller.signal,
      })
      .then(({ data }) => {
        const raw = (data as { candles?: Record<string, unknown>[] }).candles ?? (data as Record<string, unknown>[]);
        const mapped: KlineData[] = (Array.isArray(raw) ? raw : []).map(
          (d: Record<string, unknown>) => {
            const rawTs = Number(d.timestamp ?? d.time ?? d.open_time ?? d.t);
            const timeSec = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
            return {
              time: timeSec,
              open: Number(d.open ?? d.o ?? 0),
              high: Number(d.high ?? d.h ?? 0),
              low: Number(d.low ?? d.l ?? 0),
              close: Number(d.close ?? d.c ?? 0),
              volume: Number(d.volume ?? d.v ?? 0),
            };
          },
        );
        setKlines(mapped);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setKlines(generateDemoKlines(symbol));
        setIsDemo(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [symbol, interval]);

  const handleSymbolChange = useCallback(
    (val: string) => {
      setKlines([]);
      setSymbol(val);
      navigate(`/chart/${val}`, { replace: true });
    },
    [navigate],
  );

  const handleIntervalChange = useCallback((val: string) => {
    setInterval(val);
  }, []);

  const handleConfigSelect = useCallback(
    (config: StrategyConfig) => {
      const symbolChanged = config.symbol !== symbol;
      const intervalChanged = config.timeframe !== interval;
      if (symbolChanged || intervalChanged) {
        setKlines([]);
        setSymbol(config.symbol);
        setInterval(config.timeframe);
      }
      setLinkedConfigId(config.id);
      if (symbolChanged) {
        navigate(`/chart/${config.symbol}`, { replace: true });
      }
    },
    [navigate, symbol, interval],
  );

  const handleConfigUnlink = useCallback(() => {
    setLinkedConfigId(null);
  }, []);

  const displayPrice = crosshair.price ?? lastPrice ?? klines[klines.length - 1]?.close ?? null;
  const prevClose = klines.length >= 2 ? klines[klines.length - 2].close : null;
  const priceChange =
    displayPrice && prevClose ? ((displayPrice - prevClose) / prevClose) * 100 : null;

  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);

  const handleToggleBacktest = useCallback(() => {
    setBacktestActive((prev) => !prev);
  }, []);

  const handleRefreshBacktest = useCallback(() => {
    runBacktest();
  }, [runBacktest]);

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-brand-bg p-2' : 'space-y-4'}>
      {/* Toolbar */}
      <ChartToolbar
        symbol={symbol}
        interval={interval}
        isConnected={isConnected}
        isFullscreen={isFullscreen}
        onSymbolChange={handleSymbolChange}
        onIntervalChange={handleIntervalChange}
        onToggleFullscreen={toggleFullscreen}
        onConfigSelect={handleConfigSelect}
        onConfigUnlink={handleConfigUnlink}
        linkedConfigId={linkedConfigId}
        backtestActive={backtestActive}
        backtestLoading={btLoading}
        backtestProgress={btProgress}
        backtestHasCache={btHasCache}
        onToggleBacktest={handleToggleBacktest}
        onRefreshBacktest={handleRefreshBacktest}
      />

      {/* Price display */}
      <div className="flex items-center gap-4 px-1">
        <div className="font-mono text-2xl sm:text-3xl font-bold text-white animate-price-glow tracking-tight">
          {displayPrice !== null
            ? `$${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
            : '--'}
        </div>
        {priceChange !== null && (
          <Badge
            variant={priceChange >= 0 ? 'profit' : 'loss'}
            className="flex items-center gap-1.5 px-2.5 py-1 text-sm"
          >
            {priceChange >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            <span className="font-mono font-semibold">{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%</span>
          </Badge>
        )}
      </div>

      {/* Backtest stats bar */}
      {backtestActive && btMetrics && (
        <BacktestStatsBar metrics={btMetrics} error={btError} />
      )}
      {backtestActive && btLoading && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-brand-premium/10 text-xs text-gray-400 font-mono relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-brand-premium/0 via-brand-premium/30 to-brand-premium/0" />
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-premium" />
          <span>Backtest: {btProgress}%</span>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-premium/80 to-brand-premium rounded-full transition-all duration-300"
              style={{ width: `${btProgress}%` }}
            />
          </div>
        </div>
      )}
      {backtestActive && btError && !btMetrics && (
        <div className="px-3 py-2 rounded-lg bg-brand-loss/5 border border-brand-loss/15 text-xs text-brand-loss font-mono">
          {btError}
        </div>
      )}

      {/* Chart + Side panel */}
      <div className="flex gap-4 flex-1" style={{ height: isFullscreen ? 'calc(100vh - 130px)' : backtestActive && btMetrics ? 'calc(100vh - 300px)' : 'calc(100vh - 260px)', minHeight: '400px' }}>
        {/* Chart */}
        <div className="relative flex-1 rounded-lg border border-white/[0.06] overflow-hidden bg-brand-bg">
          {/* Demo data warning */}
          {isDemo && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 px-3 py-1 rounded text-sm font-mono">
              Demo data - API unavailable
            </div>
          )}

          {/* Индикатор загрузки истории */}
          {isLoadingOlder && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded text-xs text-gray-300 font-mono">
              <Loader2 className="h-3 w-3 animate-spin" />
              Загрузка истории...
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              {/* Skeleton chart lines */}
              <div className="w-full h-full absolute inset-0 p-6 flex flex-col justify-end gap-1 opacity-20">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
                    style={{
                      width: `${40 + Math.sin(i * 0.8) * 30}%`,
                      marginLeft: `${10 + Math.cos(i * 0.5) * 15}%`,
                      animationDelay: `${i * 0.1}s`,
                      backgroundSize: '200% 100%',
                    }}
                  />
                ))}
              </div>
              <Loader2 className="h-8 w-8 animate-spin text-brand-premium relative z-10" />
              <span className="text-xs text-gray-500 font-mono relative z-10">Загрузка графика...</span>
            </div>
          ) : !klines.length ? (
            <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
              Нет данных для отображения
            </div>
          ) : (
            <TradingChart
              symbol={symbol}
              interval={interval}
              initialData={klines}
              lastKline={lastKline}
              onCrosshairMove={setCrosshair}
              onChartReady={handleChartReady}
              onCandleSeriesReady={handleCandleSeriesReady}
              onVolumeSeriesReady={handleVolumeSeriesReady}
            />
          )}
        </div>

        {/* Side panel - hidden in fullscreen & mobile */}
        {!isFullscreen && (
          <div className="hidden xl:flex flex-col gap-3 w-64">
            {/* Сигнал */}
            <Card className="border-white/5 bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-accent/0 via-brand-accent/60 to-brand-accent/0" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium uppercase tracking-wider">
                  <Radio className="h-3 w-3" />
                  Signal
                </div>
                {latestSignal ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {latestSignal.direction === 'long' ? (
                        <ArrowUpRight className="h-4 w-4 text-brand-profit" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-brand-loss" />
                      )}
                      <span
                        className={`font-mono text-sm font-bold ${
                          latestSignal.direction === 'long' ? 'text-brand-profit' : 'text-brand-loss'
                        }`}
                      >
                        {latestSignal.direction === 'long' ? 'LONG' : 'SHORT'}
                      </span>
                      {latestSignal.wasExecuted && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-brand-premium/30 text-brand-premium">
                          Executed
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-xs">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Target className="h-3 w-3" /> Entry
                      </span>
                      <span className="text-white text-right">{Number(latestSignal.entryPrice).toFixed(4)}</span>
                      {latestSignal.stopLoss !== null && (
                        <>
                          <span className="text-gray-500 flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" /> SL
                          </span>
                          <span className="text-brand-loss text-right">{Number(latestSignal.stopLoss).toFixed(4)}</span>
                        </>
                      )}
                      {latestSignal.tp1Price !== null && (
                        <>
                          <span className="text-gray-500">TP1</span>
                          <span className="text-brand-profit text-right">{Number(latestSignal.tp1Price).toFixed(4)}</span>
                        </>
                      )}
                      {latestSignal.tp2Price !== null && (
                        <>
                          <span className="text-gray-500">TP2</span>
                          <span className="text-brand-profit text-right">{Number(latestSignal.tp2Price).toFixed(4)}</span>
                        </>
                      )}
                      {latestSignal.takeProfit !== null && latestSignal.tp1Price === null && (
                        <>
                          <span className="text-gray-500">TP</span>
                          <span className="text-brand-profit text-right">{Number(latestSignal.takeProfit).toFixed(4)}</span>
                        </>
                      )}
                    </div>
                    {signalsCount > 0 && (
                      <div className="text-[10px] text-gray-500 font-mono pt-1 border-t border-white/5">
                        Total signals: {signalsCount}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-gray-600 animate-pulse" />
                    <span className="text-sm text-gray-500">No active signals</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* OHLCV */}
            <Card className="border-white/5 bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-premium/0 via-brand-premium/40 to-brand-premium/0" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium uppercase tracking-wider">
                  <BarChart3 className="h-3 w-3" />
                  OHLCV
                </div>
                {crosshair.price !== null ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-xs">
                    <span className="text-gray-500">Price</span>
                    <span className="text-white text-right">{crosshair.price?.toFixed(4)}</span>
                    <span className="text-gray-500">Volume</span>
                    <span className="text-white text-right">{crosshair.volume?.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                  </div>
                ) : (
                  <div className="font-mono text-sm text-gray-600">Hover chart to inspect</div>
                )}
              </CardContent>
            </Card>

            {/* KNN класс */}
            <Card className="border-white/5 bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-profit/0 via-brand-profit/40 to-brand-profit/0" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium uppercase tracking-wider">
                  <Brain className="h-3 w-3" />
                  KNN Class
                </div>
                {latestSignal ? (
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-brand-accent" />
                    <span className="font-mono text-lg font-bold text-white">{latestSignal.knnClass}</span>
                    <span className="font-mono text-xs text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                      {Number(latestSignal.knnConfidence).toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <div className="font-mono text-lg text-gray-600">--</div>
                )}
              </CardContent>
            </Card>

            {/* Confluence Score */}
            <Card className="border-white/5 bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-loss/0 via-brand-premium/50 to-brand-profit/0" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium uppercase tracking-wider">
                  <Gauge className="h-3 w-3" />
                  Confluence
                </div>
                {latestSignal ? (
                  <>
                    <div className="font-mono text-lg font-bold text-white">
                      {Math.round(latestSignal.signalStrength)}
                      <span className="text-xs font-normal text-gray-500 ml-1">/ 100</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.min(latestSignal.signalStrength, 100)}%`,
                          backgroundColor:
                            latestSignal.signalStrength >= 70
                              ? '#00E676'
                              : latestSignal.signalStrength >= 40
                                ? '#FFD700'
                                : '#FF1744',
                          boxShadow:
                            latestSignal.signalStrength >= 70
                              ? '0 0 8px rgba(0, 230, 118, 0.4)'
                              : latestSignal.signalStrength >= 40
                                ? '0 0 8px rgba(255, 215, 0, 0.4)'
                                : '0 0 8px rgba(255, 23, 68, 0.4)',
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-mono text-lg text-gray-600">--</div>
                    <div className="w-full bg-white/5 rounded-full h-1.5">
                      <div className="bg-white/10 h-1.5 rounded-full" style={{ width: '0%' }} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Volume (24h) */}
            <Card className="border-white/5 bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium uppercase tracking-wider">
                  <BarChart2 className="h-3 w-3" />
                  Volume (24h)
                </div>
                <div className="font-mono text-sm text-gray-600">--</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/** Компактная stats-полоска бэктеста */
function BacktestStatsBar({ metrics, error }: { metrics: BacktestMetrics; error: string | null }) {
  const wr = Number(metrics.winRate);
  const pnl = Number(metrics.totalPnl);
  const dd = Number(metrics.maxDrawdown);
  const sr = Number(metrics.sharpeRatio);
  const pf = Number(metrics.profitFactor);
  const stats = [
    { label: 'TRADES', value: String(metrics.totalTrades), color: 'text-white' },
    { label: 'WR', value: `${wr.toFixed(1)}%`, color: wr >= 50 ? 'text-brand-profit' : 'text-brand-loss' },
    { label: 'PnL', value: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`, color: pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss' },
    { label: 'DD', value: `${dd.toFixed(1)}%`, color: 'text-brand-loss' },
    { label: 'SHARPE', value: sr.toFixed(2), color: sr >= 1 ? 'text-brand-profit' : 'text-gray-300' },
    { label: 'PF', value: pf.toFixed(2), color: pf >= 1.5 ? 'text-brand-profit' : 'text-gray-300' },
  ];

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-brand-premium/10 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-brand-premium/0 via-brand-premium/30 to-brand-premium/0" />
      <span className="text-[10px] uppercase tracking-widest text-brand-premium font-semibold flex items-center gap-1.5 shrink-0">
        <Activity className="h-3 w-3" />
        Backtest
      </span>
      <div className="h-4 w-px bg-white/10" />
      <div className="flex items-center gap-2 flex-1 flex-wrap">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]"
          >
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</span>
            <span className={`text-xs font-mono font-semibold ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>
      {error && <span className="text-[10px] text-brand-loss shrink-0">{error}</span>}
    </div>
  );
}

/**
 * Генерация демо-данных для отображения графика при недоступном API.
 * Возвращает 500 свечей (5-мин) с реалистичным OHLCV.
 */
function generateDemoKlines(symbol: string): KlineData[] {
  const now = Math.floor(Date.now() / 1000);
  const step = 300; // 5 min
  const count = 500;

  let price =
    symbol.startsWith('BTC')
      ? 65000
      : symbol.startsWith('ETH')
        ? 3500
        : symbol.startsWith('SOL')
          ? 140
          : symbol.startsWith('BNB')
            ? 550
            : symbol.startsWith('XRP')
              ? 0.62
              : 0.045;

  const data: KlineData[] = [];
  for (let i = 0; i < count; i++) {
    const volatility = price * 0.003;
    const open = price;
    const change1 = (Math.random() - 0.48) * volatility;
    const change2 = (Math.random() - 0.48) * volatility;
    const high = Math.max(open, open + change1, open + change2) + Math.random() * volatility * 0.5;
    const low = Math.min(open, open + change1, open + change2) - Math.random() * volatility * 0.5;
    const close = open + (Math.random() - 0.48) * volatility;
    price = close;
    data.push({
      time: now - (count - i) * step,
      open: +open.toFixed(6),
      high: +high.toFixed(6),
      low: +low.toFixed(6),
      close: +close.toFixed(6),
      volume: +(Math.random() * 1000 + 100).toFixed(2),
    });
  }
  return data;
}
