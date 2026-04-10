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
    const twa = getTelegramWebApp();
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[#0d0d1a] px-6 text-center">
        <div className="rounded-2xl bg-[#1a1a2e] p-8">
          <p className="text-lg font-semibold text-white">
            Аккаунт не привязан
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            Чтобы использовать Mini App, привяжите Telegram в личном кабинете:
          </p>
          <p className="mt-2 text-sm text-[#FFD700]">
            Настройки → Telegram → Привязать
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => {
                if (twa) {
                  twa.openLink("https://algo.dev-james.bond/settings");
                } else {
                  window.open("https://algo.dev-james.bond/settings", "_blank");
                }
              }}
              className="rounded-lg bg-[#FFD700] px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#FFC107]"
            >
              Открыть настройки
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("access_token");
                localStorage.removeItem("refresh_token");
                if (twa) {
                  twa.close();
                } else {
                  window.location.href = "/tg";
                }
              }}
              className="rounded-lg border border-gray-600 px-6 py-2.5 text-sm text-gray-300 transition-colors hover:border-gray-400"
            >
              Закрыть
            </button>
          </div>
        </div>
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
