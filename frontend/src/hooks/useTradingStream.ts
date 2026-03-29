import { useEffect, useRef, useCallback } from 'react';
import { useTradingStore } from '@/stores/trading';

/** Сообщение из приватного WebSocket потока */
interface TradingMessage {
  type: 'order_update' | 'position_update' | 'execution' | 'error';
  data: Record<string, unknown>;
}

/** Задержка переподключения: экспоненциальный backoff */
function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

/**
 * Хук для подключения к приватному WebSocket потоку торговли.
 * ws://host/ws/trading?token=JWT
 */
export function useTradingStream(): { isConnected: boolean } {
  const {
    isConnected,
    setConnected,
    addOrder,
    updatePosition,
    addExecution,
  } = useTradingStore();

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws/trading?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      setConnected(true);
      attemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const msg: TradingMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'order_update':
            addOrder(msg.data);
            break;
          case 'position_update':
            updatePosition(msg.data);
            break;
          case 'execution':
            addExecution(msg.data);
            break;
        }
      } catch {
        // Некорректное сообщение
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setConnected(false);
      wsRef.current = null;
      const delay = getReconnectDelay(attemptRef.current);
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setConnected, addOrder, updatePosition, addExecution]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [connect, setConnected]);

  return { isConnected };
}
