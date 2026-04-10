import { useEffect, useRef, useCallback } from 'react';
import { useNotificationStore } from '@/stores/notifications';
import { useToast } from '@/components/ui/toast';
import type { NotificationItem } from '@/types/api';

interface NotificationMessage {
  type: 'new_notification';
  data: NotificationItem;
}

function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

/**
 * Хук для подключения к WebSocket стриму уведомлений.
 * ws://host/ws/notifications?token=JWT
 */
export function useNotificationStream(): void {
  const { addNotification, fetchNotifications, fetchUnreadCount } = useNotificationStore();
  const { toast } = useToast();

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws/notifications?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      attemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const msg: NotificationMessage = JSON.parse(event.data);
        if (msg.type === 'new_notification') {
          addNotification(msg.data);
          // Toast для high/critical
          if (msg.data.priority === 'critical' || msg.data.priority === 'high') {
            toastRef.current(
              msg.data.title,
              msg.data.priority === 'critical' ? 'error' : 'default',
            );
          }
        }
      } catch {
        // Некорректное сообщение
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      wsRef.current = null;
      const delay = getReconnectDelay(attemptRef.current);
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [addNotification]);

  useEffect(() => {
    unmountedRef.current = false;
    fetchNotifications();
    fetchUnreadCount();
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, fetchNotifications, fetchUnreadCount]);
}
