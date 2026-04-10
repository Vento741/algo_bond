import { useNavigate } from 'react-router-dom';
import { BellOff, Settings } from 'lucide-react';
import { useNotificationStore } from '@/stores/notifications';
import { NotificationItem } from './NotificationItem';
import type { NotificationCategory } from '@/types/api';

const FILTER_OPTIONS: { value: NotificationCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'positions', label: 'Позиции' },
  { value: 'bots', label: 'Боты' },
  { value: 'orders', label: 'Ордера' },
  { value: 'backtest', label: 'Бэктесты' },
  { value: 'system', label: 'Система' },
  { value: 'billing', label: 'Биллинг' },
];

export function NotificationDropdown() {
  const { notifications, unreadCount, filter, setFilter, markAllRead } = useNotificationStore();
  const navigate = useNavigate();

  return (
    <div className="w-[90vw] max-w-[380px] max-h-[60vh] sm:max-h-[480px] flex flex-col">
      {/* Header with accent gradient border */}
      <div className="relative px-4 pt-3 pb-2">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand-accent/0 via-brand-accent/60 to-brand-accent/0 rounded-t" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Уведомления</span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-brand-accent hover:text-brand-accent/80 transition-colors">
              Прочитать все
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto scrollbar-none touch-pan-x">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 ${
              filter === opt.value
                ? 'bg-brand-accent text-white shadow-[0_0_8px_rgba(68,136,255,0.3)]'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Notification list with styled scrollbar */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 divide-y divide-white/[0.04] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <BellOff className="h-5 w-5 text-gray-600" />
            </div>
            <p className="text-xs text-gray-500">Нет уведомлений</p>
            <p className="text-[11px] text-gray-600 mt-0.5">Здесь будут ваши оповещения</p>
          </div>
        ) : (
          notifications.map((n) => <NotificationItem key={n.id} notification={n} />)
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 px-4 py-2.5 text-center">
        <button
          onClick={() => {
            useNotificationStore.getState().setOpen(false);
            navigate('/settings');
          }}
          className="inline-flex items-center gap-1.5 text-xs text-brand-accent hover:text-brand-accent/80 transition-colors"
        >
          <Settings className="h-3 w-3" />
          Настройки уведомлений
        </button>
      </div>
    </div>
  );
}
