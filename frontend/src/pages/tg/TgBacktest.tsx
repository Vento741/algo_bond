/**
 * Запуск и результаты бэктеста для Telegram Mini App
 */

import { useEffect, useState, useCallback } from 'react';
import { FlaskConical, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api from '@/lib/api';
import { TgHeader } from '@/components/tg/TgHeader';
import { TgCard } from '@/components/tg/TgCard';
import type { BacktestRunResponse, StrategyConfig } from '@/types/api';
import { cn } from '@/lib/utils';

export default function TgBacktest() {
  const [runs, setRuns] = useState<BacktestRunResponse[]>([]);
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState('');
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: r }, { data: c }] = await Promise.all([
        api.get<BacktestRunResponse[]>('/backtest/runs?limit=10'),
        api.get<StrategyConfig[]>('/strategies/configs'),
      ]);
      setRuns(r);
      setConfigs(c);
      if (c.length && !selectedConfig) setSelectedConfig(c[0].id);
    } finally {
      setLoading(false);
    }
  }, [selectedConfig]);

  useEffect(() => { load(); }, [load]);

  const startBacktest = async () => {
    if (!selectedConfig) return;
    setRunning(true);
    try {
      await api.post('/backtest/runs', {
        strategy_config_id: selectedConfig,
        start_date: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        initial_capital: 1000,
      });
      await load();
    } finally {
      setRunning(false);
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-[#00E676]" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-[#FF1744]" />;
    return <Clock className="h-4 w-4 animate-pulse text-[#FFD700]" />;
  };

  return (
    <>
      <TgHeader title="Backtest" />
      <div className="space-y-3 p-4">
        <TgCard>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Quick Run (30 days)
          </p>
          {configs.length > 0 && (
            <select
              value={selectedConfig}
              onChange={(e) => setSelectedConfig(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none"
            >
              {configs.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#1a1a2e]">
                  {c.name} ({c.symbol} {c.timeframe})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={startBacktest}
            disabled={running || !selectedConfig}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors',
              'bg-[#FFD700] text-black hover:bg-[#FFD700]/90',
              (running || !selectedConfig) && 'opacity-50',
            )}
          >
            {running ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            {running ? 'Running...' : 'Run Backtest'}
          </button>
        </TgCard>

        {!loading && runs.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Recent Runs
            </p>
            <div className="space-y-2">
              {runs.map((run) => (
                <TgCard key={run.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={run.status} />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {run.symbol} {run.timeframe}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {run.start_date} - {run.end_date}
                        </p>
                      </div>
                    </div>
                    {run.status === 'running' && (
                      <div className="text-right">
                        <p className="font-['JetBrains_Mono'] text-sm text-[#FFD700]">
                          {run.progress}%
                        </p>
                      </div>
                    )}
                  </div>
                </TgCard>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
          </div>
        )}
      </div>
    </>
  );
}
