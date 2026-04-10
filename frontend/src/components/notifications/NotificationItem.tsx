import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  TrendingUp,
  Target,
  OctagonX,
  Bot,
  AlertTriangle,
  Siren,
  FileText,
  BarChart3,
  Wifi,
  WifiOff,
  Settings,
  CreditCard,
  Bell,
} from 'lucide-react';
import { useNotificationStore } from '@/stores/notifications';
import type { NotificationItem as NotificationItemType, NotificationType } from '@/types/api';
import { cn } from '@/lib/utils';

/** Маппинг типов уведомлений на lucide-react иконки */
const TYPE_ICONS: Record<NotificationType, ReactNode> = {
  position_opened: <TrendingUp className="h-4 w-4 text-brand-profit" />,
  position_closed: <TrendingUp className="h-4 w-4 text-gray-400" />,
  tp_hit: <Target className="h-4 w-4 text-brand-profit" />,
  sl_hit: <OctagonX className="h-4 w-4 text-brand-loss" />,
  bot_started: <Bot className="h-4 w-4 text-brand-profit" />,
  bot_stopped: <Bot className="h-4 w-4 text-gray-400" />,
  bot_error: <AlertTriangle className="h-4 w-4 text-brand-premium" />,
  bot_emergency: <Siren className="h-4 w-4 text-brand-loss" />,
  order_filled: <FileText className="h-4 w-4 text-brand-accent" />,
  order_cancelled: <FileText className="h-4 w-4 text-gray-400" />,
  order_error: <FileText className="h-4 w-4 text-brand-loss" />,
  backtest_completed: <BarChart3 className="h-4 w-4 text-brand-accent" />,
  backtest_failed: <BarChart3 className="h-4 w-4 text-brand-loss" />,
  connection_lost: <WifiOff className="h-4 w-4 text-brand-loss" />,
  connection_restored: <Wifi className="h-4 w-4 text-brand-profit" />,
  system_error: <Settings className="h-4 w-4 text-brand-loss" />,
  subscription_expiring: <CreditCard className="h-4 w-4 text-brand-premium" />,
  payment_success: <CreditCard className="h-4 w-4 text-brand-profit" />,
  payment_failed: <CreditCard className="h-4 w-4 text-brand-loss" />,
};

const PRIORITY_BG: Record<string, string> = {
  low: 'bg-white/5',
  medium: 'bg-brand-accent/15',
  high: 'bg-brand-premium/15',
  critical: 'bg-brand-loss/15',
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

/** Подсветка P&L сумм в сообщении: +$123.45 зелёным, -$123.45 красным */
function highlightPnl(message: string): ReactNode {
  const parts = message.split(/([+-]\$[\d,.]+)/g);
  if (parts.length === 1) return message;
  return parts.map((part, i) => {
    if (/^\+\$/.test(part)) {
      return <span key={i} className="text-brand-profit font-mono font-medium">{part}</span>;
    }
    if (/^-\$/.test(part)) {
      return <span key={i} className="text-brand-loss font-mono font-medium">{part}</span>;
    }
    return part;
  });
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

  const icon = TYPE_ICONS[notification.type] ?? <Bell className="h-4 w-4 text-gray-400" />;

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 group animate-notif-fade-in',
        notification.is_read
          ? 'opacity-45 hover:opacity-65 hover:bg-white/[0.02]'
          : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1]',
      )}
    >
      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
        PRIORITY_BG[notification.priority] || 'bg-white/5',
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white leading-tight">{notification.title}</p>
        <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{highlightPnl(notification.message)}</p>
        <p className="text-[11px] text-gray-500 mt-1.5">{timeAgo(notification.created_at)}</p>
      </div>
      <button
        onClick={handleDelete}
        className="text-gray-600 hover:text-gray-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-start p-1 -m-1 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md hover:bg-white/[0.06]"
        aria-label="Удалить уведомление"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
