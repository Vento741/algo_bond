/**
 * Touch-friendly карточка для Telegram Mini App
 */

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TgCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TgCard({ children, className, onClick }: TgCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-white/[0.08] bg-[#1a1a2e] p-4',
        onClick && 'cursor-pointer transition-colors active:bg-white/[0.06] hover:border-white/[0.14]',
        className,
      )}
    >
      {children}
    </div>
  );
}
