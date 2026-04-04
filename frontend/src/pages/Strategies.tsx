import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ArrowUpRight, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import type { Strategy } from '@/types/api';

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Стратегии</h1>
          <p className="text-gray-400 text-sm mt-1">
            ML-алгоритмы для анализа рынка и генерации сигналов
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Поиск стратегий..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="h-12 w-12 text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg font-medium">
              {search
                ? 'Стратегии не найдены'
                : 'Стратегии пока не добавлены'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {search
                ? 'Попробуйте изменить поисковый запрос'
                : 'Администратор скоро добавит первые стратегии'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((strategy) => (
            <Link key={strategy.id} to={`/strategies/${strategy.slug}`}>
              <Card className="border-white/5 bg-white/[0.02] hover:border-brand-premium/20 transition-all group h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-premium/10 group-hover:bg-brand-premium/20 transition-colors">
                      <Brain className="h-5 w-5 text-brand-premium" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-gray-600 group-hover:text-brand-premium transition-colors" />
                  </div>
                  <CardTitle className="text-base text-white group-hover:text-brand-premium transition-colors mt-3">
                    {strategy.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-400 leading-relaxed mb-4 line-clamp-2">
                    {strategy.description || 'Без описания'}
                  </p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-1 rounded-md bg-brand-accent/10 text-brand-accent font-medium">
                      {strategy.engine_type}
                    </span>
                    <span className="text-gray-400 font-mono">
                      v{strategy.version}
                    </span>
                    {strategy.is_public && (
                      <span className="px-2 py-1 rounded-md bg-brand-profit/10 text-brand-profit font-medium">
                        Public
                      </span>
                    )}
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
