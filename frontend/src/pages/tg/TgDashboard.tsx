/**
 * Компактный дашборд для Telegram Mini App
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, TrendingUp, Activity } from "lucide-react";
import api from "@/lib/api";
import { TgHeader } from "@/components/tg/TgHeader";
import { TgCard } from "@/components/tg/TgCard";
import { TgPnlWidget } from "@/components/tg/TgPnlWidget";
import type { BotResponse } from "@/types/api";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  activeBots: number;
}

export default function TgDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalPnl: 0,
    winRate: 0,
    totalTrades: 0,
    activeBots: 0,
  });
  const [recentBots, setRecentBots] = useState<BotResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: bots } = await api.get<BotResponse[]>("/trading/bots");
      const running = bots.filter((b) => b.status === "running");
      const totalPnl = bots.reduce((s, b) => s + Number(b.total_pnl || 0), 0);
      const totalTrades = bots.reduce(
        (s, b) => s + Number(b.total_trades || 0),
        0,
      );
      const winRates = bots
        .filter((b) => Number(b.total_trades) > 0)
        .map((b) => Number(b.win_rate || 0));
      const winRate = winRates.length
        ? winRates.reduce((s, v) => s + v, 0) / winRates.length
        : 0;

      setStats({ totalPnl, winRate, totalTrades, activeBots: running.length });
      setRecentBots(bots.slice(0, 3));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <TgHeader title="AlgoBond" />
      <div className="space-y-3 p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
          </div>
        ) : (
          <>
            <TgPnlWidget
              totalPnl={stats.totalPnl}
              winRate={stats.winRate}
              totalTrades={stats.totalTrades}
            />

            <div className="grid grid-cols-2 gap-3">
              <TgCard>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[#FFD700]" />
                  <span className="text-[11px] text-gray-400">Active bots</span>
                </div>
                <p className="mt-1 font-['JetBrains_Mono'] text-2xl font-bold text-white">
                  {stats.activeBots}
                </p>
              </TgCard>
              <TgCard>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#00E676]" />
                  <span className="text-[11px] text-gray-400">
                    Total trades
                  </span>
                </div>
                <p className="mt-1 font-['JetBrains_Mono'] text-2xl font-bold text-white">
                  {stats.totalTrades}
                </p>
              </TgCard>
            </div>

            {recentBots.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Recent Bots
                </p>
                <div className="space-y-2">
                  {recentBots.map((bot) => (
                    <TgCard
                      key={bot.id}
                      onClick={() => navigate(`/tg/bots/${bot.id}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              bot.status === "running"
                                ? "bg-[#00E676]"
                                : bot.status === "error"
                                  ? "bg-[#FF1744]"
                                  : "bg-gray-500",
                            )}
                          />
                          <span className="text-sm font-medium text-white">
                            {bot.mode.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingUp
                            className={cn(
                              "h-3.5 w-3.5",
                              Number(bot.total_pnl) >= 0
                                ? "text-[#00E676]"
                                : "text-[#FF1744]",
                            )}
                          />
                          <span
                            className={cn(
                              'font-["JetBrains_Mono"] text-sm font-semibold',
                              Number(bot.total_pnl) >= 0
                                ? "text-[#00E676]"
                                : "text-[#FF1744]",
                            )}
                          >
                            {Number(bot.total_pnl) >= 0 ? "+" : ""}$
                            {Number(bot.total_pnl || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </TgCard>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
