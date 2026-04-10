/**
 * Компактный виджет P&L для Telegram Mini App
 */

import { cn } from "@/lib/utils";

interface TgPnlWidgetProps {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
}

function n(v: unknown): number {
  return Number(v) || 0;
}

function fmt(v: unknown): string {
  const num = n(v);
  const sign = num >= 0 ? "+" : "";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

export function TgPnlWidget({
  totalPnl,
  winRate,
  totalTrades,
}: TgPnlWidgetProps) {
  const isProfit = n(totalPnl) >= 0;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1a1a2e] to-[#0d0d1a] p-4">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-500">
        Total P&L
      </p>
      <p
        className={cn(
          'font-["JetBrains_Mono"] text-3xl font-bold tabular-nums',
          isProfit ? "text-[#00E676]" : "text-[#FF1744]",
        )}
      >
        {fmt(totalPnl)}
      </p>
      <div className="mt-3 flex gap-4">
        <div>
          <p className="text-[10px] text-gray-500">Win rate</p>
          <p className="font-['JetBrains_Mono'] text-sm font-semibold text-white">
            {(n(winRate) * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Trades</p>
          <p className="font-['JetBrains_Mono'] text-sm font-semibold text-white">
            {totalTrades}
          </p>
        </div>
      </div>
    </div>
  );
}
