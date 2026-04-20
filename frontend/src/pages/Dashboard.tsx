import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Brain,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  Loader2,
  Trophy,
  Zap,
  BarChart3,
  CircleDot,
  LayoutDashboard,
  Wallet,
  Crown,
  Flame,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBalance, type BalanceData } from '@/hooks/useBalance';
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

/** Форматирование USD баланса с разделителями тысяч */
function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** localStorage baseline для расчёта изменений за сутки */
interface DayBaseline {
  date: string; // YYYY-MM-DD
  equity: number;
  totalPnl: number;
  ts: number;
}

const BASELINE_KEY_PREFIX = 'algobond:dashboard:baseline:';

function readBaseline(date: string): DayBaseline | null {
  try {
    const raw = localStorage.getItem(BASELINE_KEY_PREFIX + date);
    if (!raw) return null;
    return JSON.parse(raw) as DayBaseline;
  } catch {
    return null;
  }
}

function writeBaseline(b: DayBaseline): void {
  try {
    localStorage.setItem(BASELINE_KEY_PREFIX + b.date, JSON.stringify(b));
  } catch {
    /* quota — игнорируем */
  }
}

function pruneOldBaselines(): void {
  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(BASELINE_KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const b = JSON.parse(raw) as DayBaseline;
        if (b.ts < cutoff) localStorage.removeItem(k);
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

/** Хук: фиксирует первый замер equity/totalPnl за день, возвращает изменения */
function useDayBaseline(equity: number | null, totalPnl: number) {
  const [baseline, setBaseline] = useState<DayBaseline | null>(null);

  useEffect(() => {
    if (equity === null || equity === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const existing = readBaseline(today);
    if (existing) {
      setBaseline(existing);
      return;
    }
    const fresh: DayBaseline = { date: today, equity, totalPnl, ts: Date.now() };
    writeBaseline(fresh);
    setBaseline(fresh);
    pruneOldBaselines();
  }, [equity, totalPnl]);

  return baseline;
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

  const { balance, isLoading: balanceLoading } = useBalance();

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
  const maxDrawdown = liveBots.length > 0 ? Math.max(...liveBots.map((b) => Math.abs(Number(b.max_drawdown)))) : 0;

  // Топ-перформер за всё время (самый прибыльный live бот)
  const topBot = useMemo(() => {
    if (liveBots.length === 0) return null;
    return liveBots.reduce((best, b) => (Number(b.total_pnl) > Number(best.total_pnl) ? b : best));
  }, [liveBots]);

  // Дневной baseline через localStorage — изменения за сутки
  const baseline = useDayBaseline(balance?.equity ?? null, totalPnl);
  const equityChange = balance && baseline ? balance.equity - baseline.equity : 0;
  const equityChangePct = baseline?.equity ? (equityChange / baseline.equity) * 100 : 0;
  const pnlChangeToday = baseline ? totalPnl - baseline.totalPnl : 0;

  // ROI = накопленный P&L относительно текущего equity
  const roiPct = balance?.equity && balance.equity > 0 ? (totalPnl / balance.equity) * 100 : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ---- Header ---- */}
      <div className="relative">
        <div className="absolute -inset-x-4 -top-4 h-32 bg-gradient-to-b from-brand-accent/[0.03] to-transparent rounded-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-accent/20 to-brand-premium/10 border border-brand-accent/20 shadow-lg shadow-brand-accent/5 flex-shrink-0">
                <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6 text-brand-accent" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-[Tektur] truncate">
                  Панель управления
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">
                  {user?.username ? `${user.username} - ` : ''}обзор торговой активности
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 font-data flex-shrink-0">
              <CircleDot className="h-3 w-3 text-brand-profit animate-pulse" />
              <span>{activeBots} live</span>
            </div>
          </div>
          <div className="mt-4 sm:mt-5 h-px bg-gradient-to-r from-brand-accent/30 via-brand-premium/10 to-transparent" />
        </div>
      </div>

      {/* ---- Balance + Daily Change (mobile приоритет) ---- */}
      <BalanceCard
        balance={balance}
        loading={balanceLoading}
        equityChange={equityChange}
        equityChangePct={equityChangePct}
        pnlChangeToday={pnlChangeToday}
        roiPct={roiPct}
        baselineExists={baseline !== null}
      />

      {/* ---- Hero P&L Card ---- */}
      <div
        className="relative overflow-hidden rounded-xl border border-white/[0.08] p-4 sm:p-6 md:p-8"
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
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-heading mb-2">Общий P&L (Live)</p>
            <p className={`text-3xl sm:text-4xl md:text-5xl font-bold font-data tracking-tight break-all ${pnlColor}`}>
              {loadingBots ? <span className="text-gray-600">---</span> : pnlFormatted}
            </p>
            <p className="text-xs text-gray-600 font-data mt-2">
              {loadingBots ? '...' : `${totalTrades} сделок по ${liveBots.length} ботам`}
            </p>
          </div>

          <div className="flex gap-4 sm:gap-8 justify-between sm:justify-end">
            <div className="text-left sm:text-right">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-heading">Win Rate</p>
              <p className="text-base sm:text-lg font-bold font-data text-white mt-0.5">
                {loadingBots ? '---' : formatPercent(avgWinRate)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-heading">Max DD</p>
              <p className="text-base sm:text-lg font-bold font-data text-brand-loss mt-0.5">
                {loadingBots ? '---' : `-$${maxDrawdown.toFixed(2)}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Stat Cards: 2x2 на мобиле (плотнее), 4x1 на lg ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
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

      {/* ---- Top Performer (mobile only — на десктопе уже виден через Live боты) ---- */}
      {topBot && Number(topBot.total_pnl) !== 0 && (
        <Link
          to={`/bots/${topBot.id}`}
          className="lg:hidden flex items-center justify-between gap-3 p-3 rounded-xl border border-brand-premium/15 bg-gradient-to-r from-brand-premium/[0.06] to-transparent hover:border-brand-premium/30 transition-all min-h-[56px] cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10 flex-shrink-0">
              <Crown className="h-4 w-4 text-brand-premium" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-brand-premium uppercase tracking-widest font-heading">Лидер</p>
              <p className="text-xs text-gray-300 font-data truncate">
                BOT-{shortenId(topBot.id)} · WR {formatPercent(Number(topBot.win_rate))}
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p
              className={`text-base font-bold font-data ${
                Number(topBot.total_pnl) > 0 ? 'text-brand-profit' : 'text-brand-loss'
              }`}
            >
              {formatPnl(Number(topBot.total_pnl))}
            </p>
            <p className="text-[10px] text-gray-600 font-data">{topBot.total_trades} сделок</p>
          </div>
        </Link>
      )}

      {/* ---- Main Grid ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ---- Left: Strategies + Live Bots ---- */}
        <div className="lg:col-span-2 space-y-4">
          {/* Live Bots */}
          <Card className="border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-white font-heading flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-profit" />
                Live боты
              </CardTitle>
              <Link to="/bots">
                <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white text-xs cursor-pointer">
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
                <div className="text-center py-8">
                  <div className="relative inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-profit/10 to-brand-profit/[0.03] border border-brand-profit/10 mx-auto mb-3">
                    <Bot className="h-5 w-5 text-brand-profit/40" />
                  </div>
                  <p className="text-xs text-gray-500">Нет live ботов</p>
                  <p className="text-[10px] text-gray-600 mt-1">Создайте бота для автоматической торговли</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {liveBots.map((bot) => {
                    const st = STATUS_MAP[bot.status] ?? STATUS_MAP.idle;
                    const botPnl = Number(bot.total_pnl);
                    return (
                      <Link
                        key={bot.id}
                        to={`/bots/${bot.id}`}
                        className="flex items-center justify-between gap-3 p-3 min-h-[44px] rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.1] transition-all duration-200 group cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                            {bot.status === 'running' && (
                              <div
                                className={`absolute inset-0 w-2 h-2 rounded-full ${st.dot} animate-ping opacity-50`}
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-300 font-data group-hover:text-white transition-colors truncate">
                              BOT-{shortenId(bot.id)}
                            </p>
                            <p className="text-[10px] text-gray-600 truncate">
                              {st.label} / {bot.total_trades} сделок
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`text-sm font-bold font-data ${
                              botPnl > 0 ? 'text-brand-profit' : botPnl < 0 ? 'text-brand-loss' : 'text-gray-500'
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
          <Card className="border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-white font-heading flex items-center gap-2">
                <Brain className="h-4 w-4 text-brand-accent" />
                Доступные стратегии
              </CardTitle>
              <Link to="/strategies">
                <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white text-xs cursor-pointer">
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
                <div className="text-center py-8">
                  <div className="relative inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-accent/10 to-brand-accent/[0.03] border border-brand-accent/10 mx-auto mb-3">
                    <Brain className="h-5 w-5 text-brand-accent/40" />
                  </div>
                  <p className="text-xs text-gray-500">Стратегии пока не добавлены</p>
                  <p className="text-[10px] text-gray-600 mt-1">Добавьте алгоритм для начала торговли</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {strategies.slice(0, 5).map((strategy) => (
                    <Link
                      key={strategy.id}
                      to={`/strategies/${strategy.slug}`}
                      className="flex items-center justify-between gap-3 p-3 min-h-[44px] rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-brand-premium/20 transition-all duration-200 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0.03) 100%)',
                          }}
                        >
                          <Brain className="h-3.5 w-3.5 text-brand-premium" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-300 group-hover:text-brand-premium transition-colors truncate">
                            {strategy.name}
                          </p>
                          <p className="text-[10px] text-gray-600 font-data truncate">
                            {strategy.engine_type} v{strategy.version}
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-gray-700 group-hover:text-brand-premium transition-colors flex-shrink-0" />
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
          <Card className="border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] transition-all duration-300">
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
          <Card className="border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white font-heading">Аккаунт</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center gap-2 text-xs">
                <span className="text-gray-500 uppercase tracking-wider flex-shrink-0">Email</span>
                <span className="text-gray-400 font-data truncate min-w-0">{user?.email}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500 uppercase tracking-wider">Роль</span>
                <span className="text-gray-400 font-data">{user?.role}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500 uppercase tracking-wider">Статус</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${user?.is_active ? 'bg-brand-profit' : 'bg-brand-loss'}`}
                  />
                  <span className={`font-data ${user?.is_active ? 'text-brand-profit' : 'text-brand-loss'}`}>
                    {user?.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Performance Summary */}
          <Card className="border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white font-heading flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand-accent" />
                Метрики
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MetricRow
                label="Лучший P&L"
                value={loadingBots ? '---' : `+$${Math.max(0, ...liveBots.map((b) => Number(b.max_pnl))).toFixed(2)}`}
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
              <MetricRow
                label="ROI"
                value={balanceLoading || balance === null ? '---' : formatPercent(roiPct)}
                color={roiPct >= 0 ? 'text-brand-profit' : 'text-brand-loss'}
                loading={balanceLoading}
              />
              <MetricRow
                label="Сегодня"
                value={!baseline ? '---' : `${pnlChangeToday >= 0 ? '+' : ''}$${pnlChangeToday.toFixed(2)}`}
                color={pnlChangeToday >= 0 ? 'text-brand-profit' : 'text-brand-loss'}
                loading={!baseline}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BalanceCard — компактная карточка с балансом и изменениями        */
/* ------------------------------------------------------------------ */

interface BalanceCardProps {
  balance: BalanceData | null;
  loading: boolean;
  equityChange: number;
  equityChangePct: number;
  pnlChangeToday: number;
  roiPct: number;
  baselineExists: boolean;
}

function BalanceCard({
  balance,
  loading,
  equityChange,
  equityChangePct,
  pnlChangeToday,
  roiPct,
  baselineExists,
}: BalanceCardProps) {
  // Не привязан Bybit-аккаунт — карточку прячем целиком
  if (!loading && balance === null) return null;

  const isUp = equityChange >= 0;
  const upnl = balance?.unrealized_pnl ?? 0;
  const upnlPositive = upnl >= 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/[0.08] p-3 sm:p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(68,136,255,0.05) 0%, rgba(13,13,26,1) 70%)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(68,136,255,0.5), transparent)',
        }}
      />

      <div className="flex items-start justify-between gap-3">
        {/* Left: Balance */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wallet className="h-3 w-3 text-brand-accent flex-shrink-0" />
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-heading">
              Баланс {balance?.is_demo && <span className="text-brand-premium/70">· demo</span>}
            </span>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-bold font-data text-white tracking-tight">
              {loading ? <span className="text-gray-700">---</span> : `$${formatUsd(balance?.equity ?? 0)}`}
            </span>
            {!loading && balance && baselineExists && Math.abs(equityChange) >= 0.01 && (
              <span
                className={`flex items-center gap-0.5 text-xs font-data font-semibold ${
                  isUp ? 'text-brand-profit' : 'text-brand-loss'
                }`}
              >
                {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {isUp ? '+' : ''}
                {equityChangePct.toFixed(2)}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-600 font-data mt-1">
            {loading ? '...' : `Доступно $${formatUsd(balance?.available ?? 0)}`}
            {!loading && baselineExists && Math.abs(equityChange) >= 0.01 && (
              <span className={`ml-2 ${isUp ? 'text-brand-profit/70' : 'text-brand-loss/70'}`}>
                {isUp ? '+' : ''}${equityChange.toFixed(2)} сегодня
              </span>
            )}
          </p>
        </div>

        {/* Right: Unrealized PnL + ROI mini-stack */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-gray-600 uppercase tracking-wider font-heading">uPnL</p>
            <p
              className={`text-sm sm:text-base font-bold font-data ${
                upnl === 0 ? 'text-gray-500' : upnlPositive ? 'text-brand-profit' : 'text-brand-loss'
              }`}
            >
              {loading ? '---' : `${upnlPositive ? '+' : ''}$${upnl.toFixed(2)}`}
            </p>
          </div>
          {!loading && balance && balance.equity > 0 && (
            <div className="text-right">
              <p className="text-[9px] text-gray-600 uppercase tracking-wider font-heading">ROI</p>
              <p
                className={`text-xs sm:text-sm font-bold font-data ${
                  roiPct >= 0 ? 'text-brand-profit/80' : 'text-brand-loss/80'
                }`}
              >
                {roiPct >= 0 ? '+' : ''}
                {roiPct.toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile inline P&L change today */}
      {!loading && baselineExists && Math.abs(pnlChangeToday) >= 0.01 && (
        <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between text-[10px] sm:text-xs">
          <span className="text-gray-500 uppercase tracking-wider font-heading flex items-center gap-1.5">
            <Flame className="h-3 w-3 text-brand-premium/60" />
            P&L за сутки
          </span>
          <span className={`font-data font-semibold ${pnlChangeToday >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
            {pnlChangeToday >= 0 ? '+' : ''}${pnlChangeToday.toFixed(2)}
          </span>
        </div>
      )}
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
    <Card className="border-white/[0.06] bg-white/[0.015] overflow-hidden relative group hover:border-white/[0.1] transition-all duration-300">
      <div
        className="absolute top-0 left-0 right-0 h-[1px] opacity-40 group-hover:opacity-70 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-600 font-heading uppercase tracking-widest">{title}</p>
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
      <span className="text-gray-500">{label}</span>
      <span className={`font-data font-medium ${loading ? 'text-gray-700' : color}`}>{value}</span>
    </div>
  );
}
