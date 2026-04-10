/**
 * Layout для Telegram Mini App - без сайдбара, с нижней навигацией
 */

import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { TgBottomNav } from "@/components/tg/TgBottomNav";

export default function TelegramLayout() {
  const [status, setStatus] = useState<string>("init");
  const [isReady, setIsReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const twa = (window as any).Telegram?.WebApp;
        const hasTg = !!twa;
        const hasInitData = !!(twa?.initData && twa.initData.length > 0);
        const hasJwt = !!localStorage.getItem("access_token");

        setDebugInfo(`tg=${hasTg} initData=${hasInitData} jwt=${hasJwt}`);

        if (twa) {
          twa.ready();
          twa.expand();
        }

        // Приоритет 1: JWT
        if (hasJwt) {
          try {
            const { default: api } = await import("@/lib/api");
            await api.get("/auth/me");
            setStatus("authenticated");
            setIsReady(true);
            return;
          } catch {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            setDebugInfo((prev) => prev + " | jwt_expired");
          }
        }

        // Приоритет 2: initData
        if (hasInitData) {
          try {
            const { default: api } = await import("@/lib/api");
            const { data } = await api.post("/telegram/webapp/auth", {
              init_data: twa.initData,
            });
            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("refresh_token", data.refresh_token);
            setStatus("authenticated");
            setIsReady(true);
            return;
          } catch (e: any) {
            setDebugInfo(
              (prev) =>
                prev + ` | initData_err=${e?.response?.status || e?.message}`,
            );
          }
        }

        setAuthError("Привяжите аккаунт в ЛК: Настройки → Telegram");
        setStatus("not_linked");
      } catch (e: any) {
        setAuthError(`Crash: ${e?.message}`);
        setStatus("error");
      }
    };

    init();
  }, []);

  if (status === "init") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d1a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
      </div>
    );
  }

  if (!isReady) {
    const twa = (window as any).Telegram?.WebApp;
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
          {authError && (
            <p className="mt-2 text-xs text-red-400">{authError}</p>
          )}
          <p className="mt-1 text-[10px] text-gray-600">{debugInfo}</p>
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
              onClick={() => window.location.reload()}
              className="rounded-lg border border-gray-600 px-6 py-2.5 text-sm text-gray-300 transition-colors hover:border-gray-400"
            >
              Повторить
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
