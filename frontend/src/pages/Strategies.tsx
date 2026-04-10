import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain,
  ChevronRight,
  Search,
  X,
  Globe,
  Lock,
  Cpu,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import type { Strategy } from '@/types/api';

/** Склонение слова "стратегия" */
function pluralStrategies(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'стратегия';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'стратегии';
  return 'стратегий';
}

export function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get('/strategies')
      .then(({ data }) => setStrategies(data))
      .catch(() => {
        /* API may not be available */
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = strategies.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.engine_type.toLowerCase().includes(search.toLowerCase()) ||
      (s.description?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  return (
    <div className="space-y-8">
      {/* --- Page Header --- */}
      <div className="relative">
        <div className="absolute -inset-x-4 -top-4 h-32 bg-gradient-to-b from-brand-accent/[0.03] to-transparent rounded-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-accent/20 to-brand-premium/10 border border-brand-accent/20 shadow-lg shadow-brand-accent/5">
                <Brain className="h-6 w-6 text-brand-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight font-[Tektur]">
                  Стратегии
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {strategies.length > 0
                    ? `${strategies.length} ${pluralStrategies(strategies.length)} - ML-алгоритмы для анализа рынка`
                    : 'ML-алгоритмы для анализа рынка и генерации сигналов'}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Поиск стратегий..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-500 focus:border-brand-accent/30 focus:ring-brand-accent/10"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label="Очистить поиск"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-5 h-px bg-gradient-to-r from-brand-accent/30 via-brand-premium/10 to-transparent" />
        </div>
      </div>

      {/* --- Content --- */}
      {loading ? (
        /* Skeleton Loading */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card
              key={i}
              className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden"
            >
              <div className="h-1 bg-gradient-to-r from-white/[0.04] to-transparent" />
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/[0.04] animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-4 w-28 rounded bg-white/[0.06] animate-pulse" />
                      <div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" />
                    </div>
                  </div>
                  <div className="h-6 w-20 rounded-full bg-white/[0.04] animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-white/[0.04] animate-pulse" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-14 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-5 w-10 rounded bg-white/[0.04] animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty State */
        <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="relative mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-accent/10 to-brand-premium/5 border border-brand-accent/10 flex items-center justify-center">
                <Brain className="h-9 w-9 text-brand-accent/40" />
              </div>
              <div className="absolute -top-3 -right-3 w-10 h-10 rounded-xl bg-brand-premium/5 border border-brand-premium/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-brand-premium/30" />
              </div>
              <div className="absolute -bottom-2 -left-3 w-9 h-9 rounded-lg bg-brand-profit/5 border border-brand-profit/10 flex items-center justify-center">
                <Cpu className="h-3.5 w-3.5 text-brand-profit/30" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-white font-[Tektur] tracking-tight">
              {search ? 'Стратегии не найдены' : 'Стратегии пока не добавлены'}
            </h3>
            <p className="text-sm text-gray-500 mt-2 text-center max-w-sm leading-relaxed">
              {search
                ? 'Попробуйте изменить поисковый запрос'
                : 'Администратор скоро добавит первые ML-стратегии для анализа рынка'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-4 text-sm text-brand-accent hover:text-brand-accent/80 transition-colors"
              >
                Сбросить поиск
              </button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Strategy Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((strategy) => (
            <Link key={strategy.id} to={`/strategies/${strategy.slug}`}>
              <Card
                className="
                  relative overflow-hidden group h-full
                  border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]
                  transition-all duration-200
                  hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20
                "
              >
                {/* Top gradient accent */}
                <div className="h-[2px] bg-gradient-to-r from-brand-accent/40 via-brand-premium/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

                <CardContent className="p-5">
                  {/* Top row: icon + name + engine badge */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-accent/10 border border-brand-accent/15 group-hover:bg-brand-accent/15 transition-colors flex-shrink-0">
                        <Brain className="h-5 w-5 text-brand-accent" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white group-hover:text-brand-accent transition-colors truncate">
                          {strategy.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {strategy.is_public ? (
                            <Globe className="h-3 w-3 text-brand-profit/60" />
                          ) : (
                            <Lock className="h-3 w-3 text-gray-500" />
                          )}
                          <span className="text-[11px] text-gray-500">
                            {strategy.is_public ? 'Публичная' : 'Приватная'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Engine type badge */}
                    <span className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20 uppercase tracking-wider">
                      {strategy.engine_type}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-400 leading-relaxed line-clamp-2 mb-4 min-h-[2.5rem]">
                    {strategy.description || 'Без описания'}
                  </p>

                  {/* Bottom row: version + arrow */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-mono bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.06]">
                      v{strategy.version}
                    </span>
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-gray-500 group-hover:bg-brand-accent/10 group-hover:border-brand-accent/20 group-hover:text-brand-accent transition-all">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
