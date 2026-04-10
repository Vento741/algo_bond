/**
 * Список стратегий (read-only) для Telegram Mini App
 */

import { useEffect, useState } from 'react';
import { BarChart3, Lock } from 'lucide-react';
import api from '@/lib/api';
import { TgHeader } from '@/components/tg/TgHeader';
import { TgCard } from '@/components/tg/TgCard';
import type { Strategy } from '@/types/api';

export default function TgStrategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Strategy[]>('/strategies')
      .then(({ data }) => setStrategies(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <TgHeader title="Strategies" />
      <div className="space-y-2 p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
          </div>
        ) : strategies.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No strategies available</p>
        ) : (
          strategies.map((s) => (
            <TgCard key={s.id}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFD700]/10">
                  <BarChart3 className="h-4 w-4 text-[#FFD700]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    {!s.is_public && <Lock className="h-3 w-3 text-gray-500" />}
                  </div>
                  <p className="text-[11px] text-gray-400">{s.engine_type} &bull; v{s.version}</p>
                  {s.description && (
                    <p className="mt-1 text-[11px] text-gray-500 line-clamp-2">{s.description}</p>
                  )}
                </div>
              </div>
            </TgCard>
          ))
        )}
      </div>
    </>
  );
}
