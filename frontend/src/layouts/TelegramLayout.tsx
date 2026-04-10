/**
 * Layout для Telegram Mini App - без сайдбара, с нижней навигацией
 */

import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { getTelegramWebApp } from "@/lib/telegram";
import { TgBottomNav } from "@/components/tg/TgBottomNav";
import { useTelegramAuth } from "@/hooks/useTelegramAuth";

export default function TelegramLayout() {
  const { isLoading, isAuthenticated, error } = useTelegramAuth();

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

  if (!isAuthenticated || error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0d0d1a] px-6 text-center">
        <p className="text-lg font-semibold text-white">
          Требуется авторизация
        </p>
        <p className="text-sm text-gray-400">
          {error || "Сессия истекла. Закройте и откройте приложение заново."}
        </p>
        <button
          onClick={() => {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            window.location.reload();
          }}
          className="rounded-lg bg-[#FFD700] px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#FFC107]"
        >
          Повторить вход
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0d0d1a] text-white">
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>
      <TgBottomNav />
    </div>
  );
}
