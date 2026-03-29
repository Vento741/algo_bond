import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Maximize2,
  Minimize2,
  Loader2,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { TradingChart, type KlineData } from '@/components/charts/TradingChart';
import { useMarketStream } from '@/hooks/useMarketStream';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

/** Доступные символы */
const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'RIVERUSDT', label: 'RIVER/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
];

/** Доступные интервалы */
const INTERVALS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
  { value: 'D', label: '1D' },
];

export function Chart() {
  const { symbol: paramSymbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();

  const [symbol, setSymbol] = useState(paramSymbol || 'BTCUSDT');
  const [interval, setInterval] = useState('5');
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [crosshair, setCrosshair] = useState<{
    time: number | null;
    price: number | null;
    volume: number | null;
  }>({ time: null, price: null, volume: null });

  const { lastPrice, lastKline, isConnected } = useMarketStream(symbol, interval);

  // Загрузка исторических данных
  useEffect(() => {
    setLoading(true);
    api
      .get(`/market/klines/${symbol}`, {
        params: { interval, limit: 500 },
      })
      .then(({ data }) => {
        const mapped: KlineData[] = (data as Record<string, unknown>[]).map(
          (d: Record<string, unknown>) => {
            // Bybit отдаёт timestamp в миллисекундах, lightweight-charts ожидает секунды
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
      })
      .finally(() => setLoading(false));
  }, [symbol, interval]);

  // lastKline передаётся напрямую в TradingChart через prop (без setKlines)

  const handleSymbolChange = useCallback(
    (val: string) => {
      setSymbol(val);
      navigate(`/chart/${val}`, { replace: true });
    },
    [navigate],
  );

  const displayPrice = crosshair.price ?? lastPrice ?? klines[klines.length - 1]?.close ?? null;
  const prevClose = klines.length >= 2 ? klines[klines.length - 2].close : null;
  const priceChange =
    displayPrice && prevClose ? ((displayPrice - prevClose) / prevClose) * 100 : null;

  const toggleFullscreen = () => setIsFullscreen((v) => !v);

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-brand-bg p-2' : 'space-y-4'}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          options={SYMBOLS}
          value={symbol}
          onChange={handleSymbolChange}
          className="w-40"
        />
        <div className="flex items-center rounded-lg bg-white/5 p-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              onClick={() => setInterval(iv.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                interval === iv.value
                  ? 'bg-brand-premium/10 text-brand-premium'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {/* Connection indicator */}
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

        <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-gray-400 hover:text-white h-8 w-8">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* Price display */}
      <div className="flex items-center gap-4">
        <div className="font-mono text-2xl font-bold text-white">
          {displayPrice !== null ? `$${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : '--'}
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
      <div className="flex gap-4" style={{ height: isFullscreen ? 'calc(100vh - 130px)' : '65vh' }}>
        {/* Chart */}
        <div className="flex-1 rounded-lg border border-white/5 overflow-hidden bg-brand-bg">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
            </div>
          ) : (
            <TradingChart
              symbol={symbol}
              interval={interval}
              initialData={klines}
              lastKline={lastKline}
              onCrosshairMove={setCrosshair}
            />
          )}
        </div>

        {/* Side panel — hidden in fullscreen & mobile */}
        {!isFullscreen && (
          <div className="hidden xl:flex flex-col gap-3 w-64">
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4 space-y-3">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Сигнал
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-brand-profit animate-pulse" />
                  <span className="text-sm text-gray-300">Нет активных сигналов</span>
                </div>
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

  // Стартовая цена зависит от символа
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
