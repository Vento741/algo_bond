import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Brain,
  TrendingUp,
  Activity,
  ArrowUpRight,
  Loader2,
  Trophy,
  Zap,
  BarChart3,
  CircleDot,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import type { Strategy, BotResponse } from '@/types/api';

/* ------------------------------------------------------------------ */
/*  Утилиты                                                           */
/* ------------------------------------------------------------------ */

function formatPnl(value: number): string {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function shortenId(id: string): string {
  return id.slice(0, 6).toUpperCase();
}

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  running: { label: 'Работает', dot: 'bg-brand-profit' },
  idle: { label: 'Ожидает', dot: 'bg-gray-400' },
  stopped: { label: 'Остановлен', dot: 'bg-brand-premium' },
  error: { label: 'Ошибка', dot: 'bg-brand-loss' },
};

/* ------------------------------------------------------------------ */
/*  Dashboard                                                         */
/* ------------------------------------------------------------------ */

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
        /* нет стратегий - не критично */
      })
      .finally(() => setLoadingStrategies(false));

    api
      .get('/trading/bots')
      .then(({ data }) => setBots(data))
      .catch(() => {
        /* нет ботов - не критично */
      })
      .finally(() => setLoadingBots(false));
  }, []);

  const liveBots = bots.filter((b) => b.mode === 'live');
  const activeBots = liveBots.filter((b) => b.status === 'running').length;
  const totalPnl = liveBots.reduce((sum, b) => sum + Number(b.total_pnl), 0);
  const totalTrades = liveBots.reduce((sum, b) => sum + b.total_trades, 0);

  const pnlFormatted = formatPnl(totalPnl);
  const pnlColor = totalPnl > 0 ? 'text-brand-profit' : totalPnl < 0 ? 'text-brand-loss' : 'text-gray-400';

  // Win rate: средний по всем live ботам с трейдами
  const botsWithTrades = liveBots.filter((b) => b.total_trades > 0);
  const avgWinRate =
    botsWithTrades.length > 0
      ? botsWithTrades.reduce((sum, b) => sum + Number(b.win_rate), 0) / botsWithTrades.length
      : 0;

  // Max drawdown: максимальный из всех live ботов
  const maxDrawdown =
    liveBots.length > 0 ? Math.max(...liveBots.map((b) => Math.abs(Number(b.max_drawdown)))) : 0;

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading tracking-tight">
            Панель управления
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-data">
            {user?.username ? `${user.username} - ` : ''}обзор торговой активности
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-600 font-data">
          <CircleDot className="h-3 w-3 text-brand-profit animate-pulse" />
          <span>{activeBots} live</span>
        </div>
      </div>

      {/* ---- Hero P&L Card ---- */}
      <div
        className="relative overflow-hidden rounded-xl border border-white/[0.08] p-6 sm:p-8"
        style={{
          background:
            totalPnl > 0
              ? 'linear-gradient(135deg, rgba(0,230,118,0.06) 0%, rgba(13,13,26,1) 60%)'
              : totalPnl < 0
                ? 'linear-gradient(135deg, rgba(255,23,68,0.06) 0%, rgba(13,13,26,1) 60%)'
                : 'linear-gradient(135deg, rgba(68,136,255,0.04) 0%, rgba(13,13,26,1) 60%)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-[1px]"
          style={{
            background:
              totalPnl > 0
                ? 'linear-gradient(90deg, transparent, #00E676, transparent)'
                : totalPnl < 0
                  ? 'linear-gradient(90deg, transparent, #FF1744, transparent)'
                  : 'linear-gradient(90deg, transparent, #4488ff, transparent)',
          }}
        />

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-heading mb-2">
              Общий P&L (Live)
            </p>
            <p className={`text-4xl sm:text-5xl font-bold font-data tracking-tight ${pnlColor}`}>
              {loadingBots ? (
                <span className="text-gray-600">---</span>
              ) : (
                pnlFormatted
              )}
            </p>
            <p className="text-xs text-gray-600 font-data mt-2">
              {loadingBots ? '...' : `${totalTrades} сделок по ${liveBots.length} ботам`}
            </p>
          </div>

          <div className="flex gap-6 sm:gap-8">
            <div className="text-right">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-heading">
                Win Rate
              </p>
              <p className="text-lg font-bold font-data text-white mt-0.5">
                {loadingBots ? '---' : formatPercent(avgWinRate)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-heading">
                Max DD
              </p>
              <p className="text-lg font-bold font-data text-brand-loss mt-0.5">
                {loadingBots ? '---' : `-$${maxDrawdown.toFixed(2)}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Stat Cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Стратегии"
          value={loadingStrategies ? '...' : String(strategies.length)}
          icon={Brain}
          accentColor="#4488ff"
          loading={loadingStrategies}
        />
        <StatCard
          title="Активные боты"
          value={loadingBots ? '...' : String(activeBots)}
          icon={Bot}
          accentColor="#00E676"
          loading={loadingBots}
        />
        <StatCard
          title="Win Rate"
          value={loadingBots ? '...' : formatPercent(avgWinRate)}
          icon={Trophy}
          accentColor="#FFD700"
          loading={loadingBots}
        />
        <StatCard
          title="Всего сделок"
          value={loadingBots ? '...' : String(totalTrades)}
          icon={BarChart3}
          accentColor="#FFD700"
          loading={loadingBots}
        />
      </div>

      {/* ---- Main Grid ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ---- Left: Strategies + Live Bots ---- */}
        <div className="lg:col-span-2 space-y-4">
          {/* Live Bots */}
          <Card className="border-white/[0.06] bg-white/[0.015]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-white font-heading flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-profit" />
                Live боты
              </CardTitle>
              <Link to="/bots">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-white text-xs cursor-pointer"
                >
                  Все боты
                  <ArrowUpRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loadingBots ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                </div>
              ) : liveBots.length === 0 ? (
                <div className="text-center py-6">
                  <Bot className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-600 text-xs">Нет live ботов</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {liveBots.map((bot) => {
                    const st = STATUS_MAP[bot.status] ?? STATUS_MAP.idle;
                    const botPnl = Number(bot.total_pnl);
                    return (
                      <Link
                        key={bot.id}
                        to="/bots"
                        className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.1] transition-all duration-200 group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                            {bot.status === 'running' && (
                              <div className={`absolute inset-0 w-2 h-2 rounded-full ${st.dot} animate-ping opacity-50`} />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-300 font-data group-hover:text-white transition-colors">
                              BOT-{shortenId(bot.id)}
                            </p>
                            <p className="text-[10px] text-gray-600">
                              {st.label} / {bot.total_trades} сделок
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-bold font-data ${
                              botPnl > 0
                                ? 'text-brand-profit'
                                : botPnl < 0
                                  ? 'text-brand-loss'
                                  : 'text-gray-500'
                            }`}
                          >
                            {formatPnl(botPnl)}
                          </p>
                          <p className="text-[10px] text-gray-600 font-data">
                            WR {formatPercent(Number(bot.win_rate))}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Strategies */}
          <Card className="border-white/[0.06] bg-white/[0.015]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-white font-heading flex items-center gap-2">
                <Brain className="h-4 w-4 text-brand-accent" />
                Доступные стратегии
              </CardTitle>
              <Link to="/strategies">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-white text-xs cursor-pointer"
                >
                  Все стратегии
                  <ArrowUpRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loadingStrategies ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                </div>
              ) : strategies.length === 0 ? (
                <div className="text-center py-6">
                  <Brain className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-600 text-xs">Стратегии пока не добавлены</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {strategies.slice(0, 5).map((strategy) => (
                    <Link
                      key={strategy.id}
                      to={`/strategies/${strategy.slug}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-brand-premium/20 transition-all duration-200 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-lg"
                          style={{
                            background: 'linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0.03) 100%)',
                          }}
                        >
                          <Brain className="h-3.5 w-3.5 text-brand-premium" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-300 group-hover:text-brand-premium transition-colors">
                            {strategy.name}
                          </p>
                          <p className="text-[10px] text-gray-600 font-data">
                            {strategy.engine_type} v{strategy.version}
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-gray-700 group-hover:text-brand-premium transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---- Right Sidebar ---- */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <Card className="border-white/[0.06] bg-white/[0.015]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white font-heading flex items-center gap-2">
                <Zap className="h-4 w-4 text-brand-premium" />
                Быстрые действия
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/strategies" className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/[0.06] text-gray-400 hover:text-white hover:border-brand-premium/30 hover:bg-brand-premium/[0.04] transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-brand-premium/10 mr-3">
                    <Brain className="h-3.5 w-3.5 text-brand-premium" />
                  </div>
                  Выбрать стратегию
                </Button>
              </Link>
              <Link to="/bots" className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/[0.06] text-gray-400 hover:text-white hover:border-brand-profit/30 hover:bg-brand-profit/[0.04] transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-brand-profit/10 mr-3">
                    <Bot className="h-3.5 w-3.5 text-brand-profit" />
                  </div>
                  Создать бота
                </Button>
              </Link>
              <Link to="/backtest" className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/[0.06] text-gray-400 hover:text-white hover:border-brand-accent/30 hover:bg-brand-accent/[0.04] transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-brand-accent/10 mr-3">
                    <Activity className="h-3.5 w-3.5 text-brand-accent" />
                  </div>
                  Запустить бэктест
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Account Info */}
          <Card className="border-white/[0.06] bg-white/[0.015]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white font-heading">Аккаунт</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Email</span>
                <span className="text-gray-400 font-data truncate ml-2 max-w-[160px]">
                  {user?.email}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Роль</span>
                <span className="text-gray-400 font-data">{user?.role}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Статус</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${user?.is_active ? 'bg-brand-profit' : 'bg-brand-loss'}`}
                  />
                  <span
                    className={`font-data ${user?.is_active ? 'text-brand-profit' : 'text-brand-loss'}`}
                  >
                    {user?.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Performance Summary */}
          <Card className="border-white/[0.06] bg-white/[0.015]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white font-heading flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand-accent" />
                Метрики
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MetricRow
                label="Лучший P&L"
                value={
                  loadingBots
                    ? '---'
                    : `+$${Math.max(0, ...liveBots.map((b) => Number(b.max_pnl))).toFixed(2)}`
                }
                color="text-brand-profit"
                loading={loadingBots}
              />
              <MetricRow
                label="Max Drawdown"
                value={loadingBots ? '---' : `-$${maxDrawdown.toFixed(2)}`}
                color="text-brand-loss"
                loading={loadingBots}
              />
              <MetricRow
                label="Live ботов"
                value={loadingBots ? '---' : String(liveBots.length)}
                color="text-white"
                loading={loadingBots}
              />
              <MetricRow
                label="Avg Win Rate"
                value={loadingBots ? '---' : formatPercent(avgWinRate)}
                color="text-brand-premium"
                loading={loadingBots}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accentColor: string;
  loading: boolean;
}

function StatCard({ title, value, icon: Icon, accentColor, loading }: StatCardProps) {
  return (
    <Card className="border-white/[0.06] bg-white/[0.015] overflow-hidden relative group hover:border-white/[0.12] transition-all duration-200">
      <div
        className="absolute top-0 left-0 right-0 h-[1px] opacity-40 group-hover:opacity-70 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-600 font-heading uppercase tracking-widest">
              {title}
            </p>
            <p className="text-xl font-bold font-data text-white mt-1">
              {loading ? <span className="text-gray-700">---</span> : value}
            </p>
          </div>
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 100%)`,
            }}
          >
            <Icon className="h-4 w-4" style={{ color: accentColor }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricRowProps {
  label: string;
  value: string;
  color: string;
  loading: boolean;
}

function MetricRow({ label, value, color, loading }: MetricRowProps) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-gray-600">{label}</span>
      <span className={`font-data font-medium ${loading ? 'text-gray-700' : color}`}>
        {value}
      </span>
    </div>
  );
}
