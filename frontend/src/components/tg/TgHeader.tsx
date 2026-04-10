/**
 * Компактный заголовок для Telegram Mini App с поддержкой BackButton
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTelegramWebApp } from '@/lib/telegram';

interface TgHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function TgHeader({ title, showBack = false, onBack }: TgHeaderProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const twa = getTelegramWebApp();
    if (!twa) return;

    const handleBack = onBack || (() => navigate(-1));

    if (showBack) {
      twa.BackButton.show();
      twa.BackButton.onClick(handleBack);
    } else {
      twa.BackButton.hide();
    }

    return () => {
      twa.BackButton.offClick(handleBack);
      twa.BackButton.hide();
    };
  }, [showBack, onBack, navigate]);

  return (
    <header className="sticky top-0 z-40 flex h-11 items-center border-b border-white/10 bg-[#0d0d1a]/95 px-4 backdrop-blur-sm">
      <h1 className="font-['Tektur'] text-sm font-semibold tracking-wider text-white uppercase">
        {title}
      </h1>
    </header>
  );
}
