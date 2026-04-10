/**
 * Хук для аутентификации в Telegram WebApp
 */

import { useEffect, useState } from "react";
import {
  isTelegramWebApp,
  getTelegramInitData,
  applyTelegramTheme,
} from "@/lib/telegram";
import { useTelegramStore } from "@/stores/telegram";

interface UseTelegramAuthResult {
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export function useTelegramAuth(): UseTelegramAuthResult {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, setIsTelegram, setInitData, authenticate } =
    useTelegramStore();

  useEffect(() => {
    const init = async () => {
      if (!isTelegramWebApp()) {
        setIsLoading(false);
        return;
      }

      setIsTelegram(true);
      applyTelegramTheme();

      // Если JWT уже есть - проверяем валидность простым API вызовом
      const existingToken = localStorage.getItem("access_token");
      if (existingToken) {
        try {
          const { default: api } = await import("@/lib/api");
          await api.get("/auth/me");
          useTelegramStore.setState({ isAuthenticated: true });
          setIsLoading(false);
          return;
        } catch {
          // JWT expired и refresh не помог - очищаем и пробуем initData
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
        }
      }

      // Аутентифицируемся через initData
      const initData = getTelegramInitData();
      if (!initData) {
        setError("Сессия истекла. Закройте и откройте приложение заново.");
        setIsLoading(false);
        return;
      }

      setInitData(initData);

      try {
        await authenticate();
      } catch {
        setError("Ошибка аутентификации Telegram");
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [setIsTelegram, setInitData, authenticate]);

  return { isLoading, isAuthenticated, error };
}
