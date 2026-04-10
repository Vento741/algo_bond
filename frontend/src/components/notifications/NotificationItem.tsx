import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useNotificationStore } from '@/stores/notifications';
import type { NotificationItem as NotificationItemType } from '@/types/api';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<string, string> = {
  position_opened: '📈', position_closed: '📈', tp_hit: '🎯', sl_hit: '🛑',
  bot_started: '🤖', bot_stopped: '🤖', bot_error: '⚠️', bot_emergency: '🚨',
  order_filled: '📋', order_cancelled: '📋', order_error: '📋',
  backtest_completed: '📊', backtest_failed: '📊',
  connection_lost: '🔌', connection_restored: '🔌', system_error: '⚙️',
  subscription_expiring: '💳', payment_success: '💳', payment_failed: '💳',
};

const PRIORITY_BG: Record<string, string> = {
  low: 'bg-white/5', medium: 'bg-brand-accent/15',
  high: 'bg-brand-premium/15', critical: 'bg-brand-loss/15',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} д назад`;
}

interface Props {
  notification: NotificationItemType;
}

export function NotificationItem({ notification }: Props) {
  const navigate = useNavigate();
  const { markRead, deleteNotification } = useNotificationStore();

  const handleClick = () => {
    if (!notification.is_read) {
      markRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      useNotificationStore.getState().setOpen(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNotification(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group',
        notification.is_read
          ? 'opacity-50 hover:opacity-70 border-l-[3px] border-transparent'
          : 'bg-brand-accent/[0.04] border-l-[3px] border-brand-accent hover:bg-brand-accent/[0.08]',
      )}
    >
      <div className={cn('w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-sm', PRIORITY_BG[notification.priority] || 'bg-white/5')}>
        {TYPE_ICONS[notification.type] || '🔔'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white truncate">{notification.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[11px] text-gray-600 mt-1">{timeAgo(notification.created_at)}</p>
      </div>
      <button onClick={handleDelete} className="text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity self-start mt-0.5">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
