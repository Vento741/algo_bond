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
      const inTelegram = !!window.Telegram?.WebApp;
      const hasInitData = isTelegramWebApp();

      if (!inTelegram) {
        // Не в Telegram - проверяем JWT напрямую (может быть открыт через браузер)
        const token = localStorage.getItem("access_token");
        if (token) {
          try {
            const { default: api } = await import("@/lib/api");
            await api.get("/auth/me");
            useTelegramStore.setState({ isAuthenticated: true });
          } catch {
            // noop
          }
        }
        setIsLoading(false);
        return;
      }

      // В Telegram
      setIsTelegram(true);
      applyTelegramTheme();

      // Приоритет 1: существующий JWT
      const existingToken = localStorage.getItem("access_token");
      if (existingToken) {
        try {
          const { default: api } = await import("@/lib/api");
          await api.get("/auth/me");
          useTelegramStore.setState({ isAuthenticated: true });
          setIsLoading(false);
          return;
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
        }
      }

      // Приоритет 2: initData аутентификация
      if (hasInitData) {
        const initData = getTelegramInitData();
        if (initData) {
          setInitData(initData);
          try {
            await authenticate();
            setIsLoading(false);
            return;
          } catch {
            // fall through to error
          }
        }
      }

      setError("Привяжите аккаунт в ЛК: Настройки → Telegram");
      setIsLoading(false);
    };

    init();
  }, [setIsTelegram, setInitData, authenticate]);

  return { isLoading, isAuthenticated, error };
}
