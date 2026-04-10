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

  return (
    <div className="w-[380px] max-h-[480px] flex flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-semibold text-white">Уведомления</span>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-brand-accent hover:text-brand-accent/80 transition-colors">
            Прочитать все
          </button>
        )}
      </div>
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto scrollbar-none">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              filter === opt.value ? 'bg-brand-accent text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <span className="text-2xl mb-2">🔔</span>
            <p className="text-xs">Нет уведомлений</p>
          </div>
        ) : (
          notifications.map((n) => <NotificationItem key={n.id} notification={n} />)
        )}
      </div>
      <div className="border-t border-white/5 px-4 py-2.5 text-center">
        <button
          onClick={() => {
            useNotificationStore.getState().setOpen(false);
            window.location.pathname = '/settings';
          }}
          className="text-xs text-brand-accent hover:text-brand-accent/80 transition-colors"
        >
          ⚙ Настройки уведомлений
        </button>
      </div>
    </div>
  );
}
