/**
 * Layout для Telegram Mini App - без сайдбара, с нижней навигацией
 */

import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { getTelegramWebApp } from '@/lib/telegram';
import { TgBottomNav } from '@/components/tg/TgBottomNav';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';

export default function TelegramLayout() {
  const { isLoading } = useTelegramAuth();

  useEffect(() => {
    const twa = getTelegramWebApp();
    if (twa) {
      twa.ready();
      twa.expand();
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d1a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0d0d1a] text-white">
      {/* Контент страницы, с отступом снизу для нижнего навбара */}
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>
      <TgBottomNav />
    </div>
  );
}
