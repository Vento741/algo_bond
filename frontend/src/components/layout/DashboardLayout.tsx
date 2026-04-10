import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useTradingStream } from '@/hooks/useTradingStream';
import { useNotificationStream } from '@/hooks/useNotificationStream';
import { useAppStore } from '@/stores/app';

export function DashboardLayout() {
  // Подключаемся к приватному WebSocket потоку торговли
  // isConnected обновляет store - Topbar отображает статус
  useTradingStream();
  useNotificationStream();

  const fetchVersion = useAppStore((s) => s.fetchVersion);
  useEffect(() => { fetchVersion(); }, [fetchVersion]);

  return (
    <div className="min-h-screen bg-brand-bg">
      <Sidebar />
      {/* ml-0 on mobile (sidebar is overlay), ml-64 on desktop */}
      <div className="md:ml-64">
        <Topbar />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
