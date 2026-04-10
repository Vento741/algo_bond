/**
 * Автоматическая авторизация через Telegram WebApp initData.
 * Оборачивает приложение - при открытии в Telegram авторизует через initData
 * и перенаправляет на /dashboard. Оригинальный сайт работает как есть.
 */

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

export function TelegramAuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      const twa = (window as any).Telegram?.WebApp;
      if (!twa) {
        // Не в Telegram - пропускаем
        setReady(true);
        return;
      }

      // Инициализация Telegram WebApp
      twa.ready();
      twa.expand();

      // Уже есть JWT - проверяем валидность
      if (localStorage.getItem("access_token")) {
        try {
          await api.get("/auth/me");
          useAuthStore.setState({ isAuthenticated: true });
          setReady(true);
          return;
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
        }
      }

      // Auth через initData
      const initData = twa.initData;
      if (initData && initData.length > 0) {
        try {
          const { data } = await api.post("/telegram/webapp/auth", {
            init_data: initData,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          useAuthStore.setState({ isAuthenticated: true });
        } catch {
          // Auth failed - пользователь увидит страницу логина
        }
      }

      setReady(true);
    };

    init();
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d1a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
