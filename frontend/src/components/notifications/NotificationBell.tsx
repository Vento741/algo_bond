import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotificationStore } from '@/stores/notifications';
import { NotificationDropdown } from './NotificationDropdown';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { unreadCount, isOpen, setOpen } = useNotificationStore();
  const prevCountRef = useRef(unreadCount);
  const [ringing, setRinging] = useState(false);

  /** Запуск анимации колокольчика при появлении новых уведомлений */
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setRinging(true);
      const timer = setTimeout(() => setRinging(false), 800);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-gray-400 hover:text-white h-8 w-8">
          <Bell className={cn('h-4 w-4 origin-top', ringing && 'animate-bell-ring')} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand-loss text-white text-[10px] font-bold font-mono leading-none animate-badge-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="w-auto p-0 border-white/10 bg-brand-card"
      >
        <NotificationDropdown />
      </PopoverContent>
    </Popover>
  );
}
