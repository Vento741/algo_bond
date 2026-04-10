/**
 * Упрощённый чарт для Telegram Mini App (lightweight-charts)
 */

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, type IChartApi } from 'lightweight-charts';
import api from '@/lib/api';
import { TgHeader } from '@/components/tg/TgHeader';
import { TgCard } from '@/components/tg/TgCard';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const TIMEFRAMES = ['15', '60', '240', 'D'];

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function TgChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('60');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstanceRef.current = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a2e' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#ffffff08' },
        horzLines: { color: '#ffffff08' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#ffffff10' },
      timeScale: { borderColor: '#ffffff10', timeVisible: true },
      width: chartRef.current.clientWidth,
      height: 280,
    });

    return () => {
      chartInstanceRef.current?.remove();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartInstanceRef.current) return;
    setLoading(true);

    api.get<Candle[]>(`/market/klines?symbol=${symbol}&interval=${timeframe}&limit=200`)
      .then(({ data }) => {
        if (!chartInstanceRef.current || !data.length) return;
        const series = chartInstanceRef.current.addSeries(CandlestickSeries, {
          upColor: '#00E676',
          downColor: '#FF1744',
          borderVisible: false,
          wickUpColor: '#00E676',
          wickDownColor: '#FF1744',
        });
        const sorted = [...data].sort((a, b) => a.time - b.time);
        series.setData(sorted.map((c) => ({
          time: c.time as unknown as import('lightweight-charts').Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })));
        chartInstanceRef.current.timeScale().fitContent();
      })
      .finally(() => setLoading(false));
  }, [symbol, timeframe]);

  return (
    <>
      <TgHeader title="Chart" />
      <div className="p-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                symbol === s
                  ? 'bg-[#FFD700] text-black'
                  : 'bg-white/[0.06] text-gray-400 hover:text-white'
              }`}
            >
              {s.replace('USDT', '')}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-white/20 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tf === 'D' ? '1D' : tf === '240' ? '4H' : tf === '60' ? '1H' : '15M'}
            </button>
          ))}
        </div>

        <TgCard className="p-0 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1a1a2e]/80">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
            </div>
          )}
          <div ref={chartRef} className="relative w-full" />
        </TgCard>
      </div>
    </>
  );
}
