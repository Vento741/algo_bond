import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { IChartApi } from 'lightweight-charts';
import { TradingChart } from '@/components/charts/TradingChart';
import { ChartToolbar } from '@/components/charts/ChartToolbar';
import { useMarketStream } from '@/hooks/useMarketStream';
import { useIndicators } from '@/hooks/useIndicators';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/lib/api';
import type { KlineData } from '@/lib/chart-types';

export function Chart() {
  const { symbol: paramSymbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();

  const [symbol, setSymbol] = useState(paramSymbol || 'BTCUSDT');
  const [interval, setInterval] = useState('5');
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [crosshair, setCrosshair] = useState<{
    time: number | null;
    price: number | null;
    volume: number | null;
  }>({ time: null, price: null, volume: null });

  const { lastPrice, lastKline, isConnected } = useMarketStream(symbol, interval);

  // Chart API для индикаторов - state чтобы хук перерисовывался при создании chart
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);

  // Callback вызывается из TradingChart при создании chart
  const handleChartReady = useCallback((chart: IChartApi | null) => {
    chartApiRef.current = chart;
    setChartApi(chart);
  }, []);

  // Индикаторы
  useIndicators({ chart: chartApi, klines });

  // Загрузка исторических данных
  useEffect(() => {
    setLoading(true);
    setIsDemo(false);
    api
      .get(`/market/klines/${symbol}`, {
        params: { interval, limit: 500 },
      })
      .then(({ data }) => {
        const mapped: KlineData[] = (data as Record<string, unknown>[]).map(
          (d: Record<string, unknown>) => {
            const rawTs = Number(d.timestamp ?? d.time ?? d.open_time ?? d.t);
            const timeSec = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
            return {
              time: timeSec,
              open: Number(d.open ?? d.o),
              high: Number(d.high ?? d.h),
              low: Number(d.low ?? d.l),
              close: Number(d.close ?? d.c),
              volume: Number(d.volume ?? d.v ?? 0),
            };
          },
        );
        setKlines(mapped);
      })
      .catch(() => {
        // Генерируем демо-данные если API недоступен
        setKlines(generateDemoKlines(symbol));
        setIsDemo(true);
      })
      .finally(() => setLoading(false));
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

  const displayPrice = crosshair.price ?? lastPrice ?? klines[klines.length - 1]?.close ?? null;
  const prevClose = klines.length >= 2 ? klines[klines.length - 2].close : null;
  const priceChange =
    displayPrice && prevClose ? ((displayPrice - prevClose) / prevClose) * 100 : null;

  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);

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
      />

      {/* Price display */}
      <div className="flex items-center gap-4">
        <div className="font-mono text-lg sm:text-2xl font-bold text-white">
          {displayPrice !== null
            ? `$${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
            : '--'}
        </div>
        {priceChange !== null && (
          <Badge variant={priceChange >= 0 ? 'profit' : 'loss'} className="flex items-center gap-1">
            {priceChange >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span className="font-mono">{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%</span>
          </Badge>
        )}
      </div>

      {/* Chart + Side panel */}
      <div className="flex gap-4 flex-1" style={{ height: isFullscreen ? 'calc(100vh - 130px)' : 'calc(100vh - 260px)', minHeight: '400px' }}>
        {/* Chart */}
        <div className="relative flex-1 rounded-lg border border-white/5 overflow-hidden bg-brand-bg">
          {/* Demo data warning */}
          {isDemo && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 px-3 py-1 rounded text-sm font-mono">
              Demo data - API unavailable
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
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
            />
          )}
        </div>

        {/* Side panel - hidden in fullscreen & mobile */}
        {!isFullscreen && (
          <div className="hidden xl:flex flex-col gap-3 w-64">
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4 space-y-3">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Сигнал
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-gray-500" />
                  <span className="text-sm text-gray-300">Нет активных сигналов</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4 space-y-3">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  OHLCV
                </div>
                {crosshair.price !== null ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
                    <span className="text-gray-500">Цена</span>
                    <span className="text-white text-right">{crosshair.price?.toFixed(4)}</span>
                    <span className="text-gray-500">Объем</span>
                    <span className="text-white text-right">{crosshair.volume?.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="font-mono text-sm text-gray-500">--</div>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4 space-y-3">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  KNN класс
                </div>
                <div className="font-mono text-lg text-white">--</div>
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4 space-y-3">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Confluence Score
                </div>
                <div className="font-mono text-lg text-white">--</div>
                <div className="w-full bg-white/5 rounded-full h-1.5">
                  <div className="bg-brand-premium h-1.5 rounded-full" style={{ width: '0%' }} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4 space-y-3">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Volume (24h)
                </div>
                <div className="font-mono text-sm text-gray-300">--</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
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
