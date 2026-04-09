import { useEffect, useRef, useState } from 'react';
import type { KlineData } from '@/lib/chart-types';

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
 *
 * Исправлен баг ghost-соединений: при смене symbol/interval cancelled-флаг
 * предотвращает переподключение устаревшего WS.
 */
export function useMarketStream(
  symbol: string | null,
  interval: string = '5',
): MarketStreamResult {
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastKline, setLastKline] = useState<KlineData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Сброс состояния при смене символа/интервала
  useEffect(() => {
    setLastKline(null);
    setLastPrice(null);
  }, [symbol, interval]);

  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;
    let attempt = 0;
    let ws: WebSocket | null = null;

    function connect() {
      if (cancelled || !symbol) return;

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.host;
      const url = `${proto}://${host}/ws/market/${symbol}?interval=${interval}`;

      ws = new WebSocket(url);

      ws.onopen = () => {
        if (cancelled) return;
        setIsConnected(true);
        attempt = 0;
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg: MarketMessage = JSON.parse(event.data as string);
          if (msg.type === 'kline') {
            const d = msg.data;
            // Bybit WS может отдавать timestamp в ms - конвертируем в секунды
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
          // Некорректное сообщение - игнорируем
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setIsConnected(false);
        ws = null;
        // Reconnect с backoff
        const delay = getReconnectDelay(attempt);
        attempt += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.close();
      }
      ws = null;
    };
  }, [symbol, interval]);

  return { lastPrice, lastKline, isConnected };
}
