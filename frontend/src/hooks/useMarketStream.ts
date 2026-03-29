import { useEffect, useRef, useState, useCallback } from 'react';
import type { KlineData } from '@/components/charts/TradingChart';

/** Сообщение из WebSocket потока маркет-данных */
interface MarketMessage {
  type: 'kline' | 'ticker';
  data: Record<string, unknown>;
}

interface MarketStreamResult {
  lastPrice: number | null;
  lastKline: KlineData | null;
  isConnected: boolean;
}

/** Задержка переподключения: экспоненциальный backoff */
function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

/**
 * Хук для подключения к WebSocket потоку маркет-данных.
 * ws://host/ws/market/{symbol}?interval={interval}
 */
export function useMarketStream(
  symbol: string | null,
  interval: string = '5',
): MarketStreamResult {
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastKline, setLastKline] = useState<KlineData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!symbol || unmountedRef.current) return;

    // Определяем WS URL
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws/market/${symbol}?interval=${interval}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      setIsConnected(true);
      attemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const msg: MarketMessage = JSON.parse(event.data);
        if (msg.type === 'kline') {
          const d = msg.data;
          // Bybit WS может отдавать timestamp в ms — конвертируем в секунды
          const rawTs = Number(d.timestamp ?? d.time ?? d.start);
          const timeSec = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
          const kline: KlineData = {
            time: timeSec,
            open: Number(d.open),
            high: Number(d.high),
            low: Number(d.low),
            close: Number(d.close),
            volume: Number(d.volume),
          };
          setLastKline(kline);
          setLastPrice(kline.close);
        } else if (msg.type === 'ticker') {
          const d = msg.data;
          setLastPrice(Number(d.last_price ?? d.price ?? 0));
        }
      } catch {
        // Некорректное сообщение — игнорируем
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;
      // Reconnect с backoff
      const delay = getReconnectDelay(attemptRef.current);
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [symbol, interval]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { lastPrice, lastKline, isConnected };
}
