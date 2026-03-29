import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Brain, ArrowLeft, Loader2, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import type { StrategyDetail as StrategyDetailType } from '@/types/api';

export function StrategyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [strategy, setStrategy] = useState<StrategyDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api
      .get(`/strategies/${slug}`)
      .then(({ data }) => setStrategy(data))
      .catch((err) => {
        setError(
          err.response?.status === 404
            ? 'Стратегия не найдена'
            : 'Ошибка загрузки',
        );
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleCopyConfig = () => {
    if (!strategy) return;
    navigator.clipboard.writeText(
      JSON.stringify(strategy.default_config, null, 2),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="space-y-4">
        <Link to="/strategies">
          <Button variant="ghost" size="sm" className="text-gray-400">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к стратегиям
          </Button>
        </Link>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="h-12 w-12 text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">{error || 'Не найдено'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/strategies">
        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад к стратегиям
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-brand-premium/10">
          <Brain className="h-7 w-7 text-brand-premium" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{strategy.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="px-2 py-0.5 rounded-md bg-brand-accent/10 text-brand-accent text-xs font-medium">
              {strategy.engine_type}
            </span>
            <span className="text-gray-500 text-xs font-mono">
              v{strategy.version}
            </span>
            {strategy.is_public && (
              <span className="px-2 py-0.5 rounded-md bg-brand-profit/10 text-brand-profit text-xs font-medium">
                Public
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Description */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader>
              <CardTitle className="text-base text-white">Описание</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 leading-relaxed">
                {strategy.description || 'Описание не указано'}
              </p>
            </CardContent>
          </Card>

          {/* Default config */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base text-white">
                Конфигурация по умолчанию
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyConfig}
                className="text-gray-400 hover:text-white"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5 text-brand-profit" />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Копировать
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 rounded-lg bg-black/30 text-sm font-mono text-gray-300 overflow-x-auto">
                {JSON.stringify(strategy.default_config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">Информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">ID</span>
                <span className="text-gray-300 font-mono text-xs truncate max-w-[140px]">
                  {strategy.id}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Slug</span>
                <span className="text-gray-300 font-mono text-xs">
                  {strategy.slug}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Движок</span>
                <span className="text-gray-300">{strategy.engine_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Версия</span>
                <span className="text-gray-300 font-mono">
                  {strategy.version}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Создана</span>
                <span className="text-gray-300 text-xs">
                  {new Date(strategy.created_at).toLocaleDateString('ru-RU')}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
