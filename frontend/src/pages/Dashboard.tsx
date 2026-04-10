import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Brain,
  TrendingUp,
  Activity,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import type { Strategy, BotResponse } from '@/types/api';

export function Dashboard() {
  const { user } = useAuthStore();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(true);
  const [bots, setBots] = useState<BotResponse[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);

  useEffect(() => {
    api
      .get('/strategies')
      .then(({ data }) => setStrategies(data))
      .catch(() => {
        /* нет стратегий — не критично */
      })
      .finally(() => setLoadingStrategies(false));

    api
      .get('/trading/bots')
      .then(({ data }) => setBots(data))
      .catch(() => {
        /* нет ботов — не критично */
      })
      .finally(() => setLoadingBots(false));
  }, []);

  const liveBots = bots.filter((b) => b.mode === 'live');
  const activeBots = liveBots.filter((b) => b.status === 'running').length;
  const totalPnl = liveBots.reduce((sum, b) => sum + Number(b.total_pnl), 0);
  const totalTrades = liveBots.reduce((sum, b) => sum + b.total_trades, 0);

  const pnlFormatted = `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}`;
  const pnlColor = totalPnl > 0 ? 'text-brand-profit' : totalPnl < 0 ? 'text-brand-loss' : 'text-gray-400';
  const pnlBg = totalPnl > 0 ? 'bg-brand-profit/10' : totalPnl < 0 ? 'bg-brand-loss/10' : 'bg-gray-500/10';

  const quickStats = [
    {
      title: 'Стратегии',
      value: loadingStrategies ? '...' : String(strategies.length),
      icon: Brain,
      color: 'text-brand-accent',
      bgColor: 'bg-brand-accent/10',
    },
    {
      title: 'Активные боты',
      value: loadingBots ? '...' : String(activeBots),
      icon: Bot,
      color: 'text-brand-profit',
      bgColor: 'bg-brand-profit/10',
    },
    {
      title: 'Общий P&L',
      value: loadingBots ? '...' : pnlFormatted,
      icon: TrendingUp,
      color: loadingBots ? 'text-gray-400' : pnlColor,
      bgColor: loadingBots ? 'bg-gray-500/10' : pnlBg,
    },
    {
      title: 'Всего сделок',
      value: loadingBots ? '...' : String(totalTrades),
      icon: Activity,
      color: 'text-brand-premium',
      bgColor: 'bg-brand-premium/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-white font-heading tracking-tight">
          Панель управления
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {user?.username ? `${user.username} — ` : ''}обзор торговой активности
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat) => (
          <Card
            key={stat.title}
            className="border-white/5 bg-white/[0.02]"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold font-data text-white mt-1">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-lg ${stat.bgColor}`}
                >
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategies list */}
        <div className="lg:col-span-2">
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base text-white">
                Доступные стратегии
              </CardTitle>
              <Link to="/strategies">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  Все стратегии
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loadingStrategies ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : strategies.length === 0 ? (
                <div className="text-center py-8">
                  <Brain className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">
                    Стратегии пока не добавлены
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {strategies.slice(0, 5).map((strategy) => (
                    <Link
                      key={strategy.id}
                      to={`/strategies/${strategy.slug}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-brand-premium/20 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10">
                          <Brain className="h-4 w-4 text-brand-premium" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-brand-premium transition-colors">
                            {strategy.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {strategy.engine_type} v{strategy.version}
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-gray-600 group-hover:text-brand-premium transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="space-y-6">
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">
                Быстрые действия
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/strategies" className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/5 text-gray-300 hover:text-white hover:border-brand-premium/20"
                >
                  <Brain className="mr-2 h-4 w-4 text-brand-premium" />
                  Выбрать стратегию
                </Button>
              </Link>
              <Link to="/bots" className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/5 text-gray-300 hover:text-white hover:border-brand-profit/20"
                >
                  <Bot className="mr-2 h-4 w-4 text-brand-profit" />
                  Создать бота
                </Button>
              </Link>
              <Link to="/backtest" className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/5 text-gray-300 hover:text-white hover:border-brand-accent/20"
                >
                  <Activity className="mr-2 h-4 w-4 text-brand-accent" />
                  Запустить бэктест
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Account info */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">Аккаунт</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Email</span>
                <span className="text-gray-300 font-data text-xs">
                  {user?.email}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Роль</span>
                <span className="text-gray-300">{user?.role}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Статус</span>
                <span className={user?.is_active ? 'text-brand-profit' : 'text-brand-loss'}>
                  {user?.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
