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
    <div className="w-[92vw] max-w-[440px] max-h-[60vh] sm:max-h-[520px] flex flex-col">
      {/* Header */}
      <div className="relative px-4 pt-4 pb-3">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand-accent/0 via-brand-accent/60 to-brand-accent/0 rounded-t" />
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-white">Уведомления</span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-brand-accent hover:text-brand-accent/80 transition-colors font-medium">
              Прочитать все
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all duration-200 ${
              filter === opt.value
                ? 'bg-brand-accent text-white'
                : 'bg-white/[0.05] text-gray-400 hover:bg-white/10 hover:text-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="mx-4 h-px bg-white/[0.06]" />

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
              <BellOff className="h-5 w-5 text-gray-600" />
            </div>
            <p className="text-sm text-gray-400 font-medium">Нет уведомлений</p>
            <p className="text-xs text-gray-600 mt-1">Здесь будут ваши оповещения</p>
          </div>
        ) : (
          notifications.map((n) => <NotificationItem key={n.id} notification={n} />)
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-4 py-3 text-center">
        <button
          onClick={() => {
            useNotificationStore.getState().setOpen(false);
            navigate('/settings');
          }}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand-accent transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Настройки уведомлений
        </button>
      </div>
    </div>
  );
}
