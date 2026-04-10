/**
 * Список ботов для Telegram Mini App
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Square, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { TgHeader } from '@/components/tg/TgHeader';
import { TgCard } from '@/components/tg/TgCard';
import type { BotResponse } from '@/types/api';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  running: 'text-[#00E676]',
  stopped: 'text-gray-400',
  idle: 'text-gray-400',
  error: 'text-[#FF1744]',
};

export default function TgBots() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<BotResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<BotResponse[]>('/trading/bots');
      setBots(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (bot: BotResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionId(bot.id);
    try {
      if (bot.status === 'running') {
        await api.post(`/trading/bots/${bot.id}/stop`);
      } else {
        await api.post(`/trading/bots/${bot.id}/start`);
      }
      await load();
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <TgHeader title="Bots" />
      <div className="space-y-2 p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
          </div>
        ) : bots.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No bots found</p>
        ) : (
          bots.map((bot) => (
            <TgCard key={bot.id} onClick={() => navigate(`/tg/bots/${bot.id}`)}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  bot.status === 'running' ? 'bg-[#00E676]' :
                  bot.status === 'error' ? 'bg-[#FF1744]' : 'bg-gray-500',
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white capitalize">{bot.mode} bot</p>
                  <p className={cn('text-[11px]', STATUS_COLORS[bot.status] || 'text-gray-400')}>
                    {bot.status} &bull; {bot.total_trades} trades
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-["JetBrains_Mono"] text-sm font-semibold',
                    bot.total_pnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]',
                  )}>
                    {bot.total_pnl >= 0 ? '+' : ''}${bot.total_pnl.toFixed(2)}
                  </span>
                  <button
                    onClick={(e) => toggle(bot, e)}
                    disabled={actionId === bot.id}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                      bot.status === 'running'
                        ? 'bg-[#FF1744]/20 text-[#FF1744] hover:bg-[#FF1744]/30'
                        : 'bg-[#00E676]/20 text-[#00E676] hover:bg-[#00E676]/30',
                      actionId === bot.id && 'opacity-50',
                    )}
                  >
                    {actionId === bot.id ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : bot.status === 'running' ? (
                      <Square className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </div>
              </div>
            </TgCard>
          ))
        )}
      </div>
    </>
  );
}
