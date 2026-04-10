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

      // Если JWT уже есть в localStorage - считаем авторизованным
      const existingToken = localStorage.getItem("access_token");
      if (existingToken) {
        useTelegramStore.setState({ isAuthenticated: true });
        setIsLoading(false);
        return;
      }

      // Иначе аутентифицируемся через initData
      const initData = getTelegramInitData();
      if (!initData) {
        setError("Не удалось получить данные Telegram");
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
