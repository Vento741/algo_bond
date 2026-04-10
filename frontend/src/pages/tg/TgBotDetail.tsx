/**
 * Детальная страница бота с позициями для Telegram Mini App
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Play, Square } from "lucide-react";
import api from "@/lib/api";
import { TgHeader } from "@/components/tg/TgHeader";
import { TgCard } from "@/components/tg/TgCard";
import { TgPnlWidget } from "@/components/tg/TgPnlWidget";
import type { BotResponse, PositionResponse } from "@/types/api";
import { cn } from "@/lib/utils";

export default function TgBotDetail() {
  const { id } = useParams<{ id: string }>();
  const [bot, setBot] = useState<BotResponse | null>(null);
  const [positions, setPositions] = useState<PositionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [{ data: b }, { data: pos }] = await Promise.all([
        api.get<BotResponse>(`/trading/bots/${id}`),
        api.get<PositionResponse[]>(
          `/trading/bots/${id}/positions?status=open`,
        ),
      ]);
      setBot(b);
      setPositions(pos);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async () => {
    if (!bot) return;
    setToggling(true);
    try {
      if (bot.status === "running") {
        await api.post(`/trading/bots/${bot.id}/stop`);
      } else {
        await api.post(`/trading/bots/${bot.id}/start`);
      }
      await load();
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <>
        <TgHeader title="Bot" showBack />
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
        </div>
      </>
    );
  }

  if (!bot) {
    return (
      <>
        <TgHeader title="Bot" showBack />
        <p className="py-8 text-center text-sm text-gray-500">Bot not found</p>
      </>
    );
  }

  return (
    <>
      <TgHeader title={`${bot.mode.toUpperCase()} Bot`} showBack />
      <div className="space-y-3 p-4">
        <TgPnlWidget
          totalPnl={bot.total_pnl}
          winRate={bot.win_rate}
          totalTrades={bot.total_trades}
        />

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
            <span className="text-sm capitalize text-gray-300">
              {bot.status}
            </span>
          </div>
          <button
            onClick={toggle}
            disabled={toggling}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              bot.status === "running"
                ? "bg-[#FF1744]/20 text-[#FF1744] hover:bg-[#FF1744]/30"
                : "bg-[#00E676]/20 text-[#00E676] hover:bg-[#00E676]/30",
              toggling && "opacity-50",
            )}
          >
            {toggling ? (
              <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" />
            ) : bot.status === "running" ? (
              <>
                <Square className="h-4 w-4" /> Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Start
              </>
            )}
          </button>
        </div>

        {positions.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Open Positions
            </p>
            <div className="space-y-2">
              {positions.map((pos) => (
                <TgCard key={pos.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {pos.symbol}
                      </p>
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          pos.side === "long"
                            ? "text-[#00E676]"
                            : "text-[#FF1744]",
                        )}
                      >
                        {pos.side.toUpperCase()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          'font-["JetBrains_Mono"] text-sm font-semibold',
                          Number(pos.unrealized_pnl) >= 0
                            ? "text-[#00E676]"
                            : "text-[#FF1744]",
                        )}
                      >
                        {Number(pos.unrealized_pnl) >= 0 ? "+" : ""}$
                        {Number(pos.unrealized_pnl || 0).toFixed(2)}
                      </p>
                      <p className="font-['JetBrains_Mono'] text-[11px] text-gray-400">
                        @ ${Number(pos.entry_price || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </TgCard>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <TgCard>
            <p className="text-[10px] text-gray-500">Max PnL</p>
            <p className="font-['JetBrains_Mono'] text-sm font-semibold text-[#00E676]">
              +${Number(bot.max_pnl || 0).toFixed(2)}
            </p>
          </TgCard>
          <TgCard>
            <p className="text-[10px] text-gray-500">Max Drawdown</p>
            <p className="font-['JetBrains_Mono'] text-sm font-semibold text-[#FF1744]">
              -{Number(bot.max_drawdown || 0).toFixed(2)}%
            </p>
          </TgCard>
        </div>
      </div>
    </>
  );
}
