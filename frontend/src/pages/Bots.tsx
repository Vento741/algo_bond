import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bot,
  Play,
  Square,
  Plus,
  Loader2,
  Settings,
  Zap,
  ExternalLink,
  Trash2,
  TrendingUp,
  Activity,
  BarChart3,
  ArrowDownRight,
  Percent,
  Hash,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import api from '@/lib/api';
import type {
  BotResponse,
  BotCreate,
  BotStatus,
  BotMode,
  StrategyConfig,
  ExchangeAccount,
} from '@/types/api';

const STATUS_CONFIG: Record<
  BotStatus,
  { variant: 'profit' | 'default' | 'loss'; label: string; dot: string }
> = {
  idle: { variant: 'default', label: 'Ожидание', dot: 'bg-gray-500' },
  running: { variant: 'profit', label: 'Работает', dot: 'bg-brand-profit' },
  stopped: { variant: 'default', label: 'Остановлен', dot: 'bg-gray-500' },
  error: { variant: 'loss', label: 'Ошибка', dot: 'bg-brand-loss' },
};

const MODE_LABELS: Record<BotMode, string> = {
  demo: 'Демо',
  live: 'Live',
  paper: 'Paper',
};

const MODE_COLORS: Record<BotMode, string> = {
  demo: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  live: 'bg-brand-premium/10 text-brand-premium border-brand-premium/20',
  paper: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export function Bots() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<BotResponse[]>([]);
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [pnlIncludeDemo, setPnlIncludeDemo] = useState(true);

  /** Словарь config_id -> StrategyConfig для быстрого доступа */
  const configMap = useMemo(() => {
    const map = new Map<string, StrategyConfig>();
    for (const c of configs) {
      map.set(c.id, c);
    }
    return map;
  }, [configs]);

  // Keyboard shortcut: Space toggles selected bot
  const handleToggleBot = useCallback(() => {
    if (!selectedBot) return;
    const bot = bots.find((b) => b.id === selectedBot);
    if (bot) {
      toggleBot(bot.id, bot.status);
    }
  }, [selectedBot, bots, toggleBot]);

  useKeyboardShortcuts(handleToggleBot);

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    setLoading(true);

    const botsReq = api
      .get<BotResponse[]>('/trading/bots')
      .then(({ data }) => data)
      .catch(() => [] as BotResponse[]);

    const configsReq = api
      .get<StrategyConfig[]>('/strategies/configs/my')
      .then(({ data }) => data)
      .catch(() => [] as StrategyConfig[]);

    Promise.all([botsReq, configsReq])
      .then(([botsData, configsData]) => {
        setBots(botsData);
        setConfigs(configsData);
      })
      .finally(() => setLoading(false));
  }

  function toggleBot(id: string, currentStatus: BotStatus) {
    const action = currentStatus === 'running' ? 'stop' : 'start';
    api
      .post(`/trading/bots/${id}/${action}`)
      .then(() => loadData())
      .catch(() => {
        // Fallback: toggle locally
        setBots((prev) =>
          prev.map((b) =>
            b.id === id
              ? { ...b, status: (currentStatus === 'running' ? 'stopped' : 'running') as BotStatus }
              : b,
          ),
        );
      });
  }

  function deleteBot(id: string) {
    if (!confirm('Удалить бота? Все ордера, позиции и логи будут удалены.')) return;
    api
      .delete(`/trading/bots/${id}`)
      .then(() => loadData())
      .catch((err) => {
        alert(err?.response?.data?.detail || 'Ошибка удаления');
      });
  }

  /** Боты для расчета P&L (с учетом фильтра demo/live) */
  const pnlBots = useMemo(
    () => (pnlIncludeDemo ? bots : bots.filter((b) => b.mode !== 'demo')),
    [bots, pnlIncludeDemo],
  );

  /** Суммарный P&L (total_pnl приходит как string от Decimal) */
  const totalPnl = pnlBots.reduce((s, b) => s + Number(b.total_pnl ?? 0), 0);

  const activeBots = bots.filter((b) => b.status === 'running').length;
  const demoBots = bots.filter((b) => b.mode === 'demo').length;
  const liveBots = bots.filter((b) => b.mode !== 'demo').length;

  return (
    <div className="space-y-8">
      {/* --- Page Header --- */}
      <div className="relative">
        <div className="absolute -inset-x-4 -top-4 h-32 bg-gradient-to-b from-brand-premium/[0.03] to-transparent rounded-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-premium/20 to-brand-accent/10 border border-brand-premium/20 shadow-lg shadow-brand-premium/5">
                <Bot className="h-6 w-6 text-brand-premium" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight font-[Tektur]">
                  Боты
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {bots.length > 0
                    ? `${bots.length} ${(() => { const n = bots.length % 100; const n10 = n % 10; if (n > 10 && n < 20) return 'ботов'; if (n10 === 1) return 'бот'; if (n10 >= 2 && n10 <= 4) return 'бота'; return 'ботов'; })()} - управление автоматической торговлей`
                    : 'Управление автоматической торговлей'}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-brand-premium text-brand-bg hover:bg-brand-premium/90 font-semibold shadow-lg shadow-brand-premium/10"
            >
              <Plus className="mr-2 h-4 w-4" />
              Создать бота
            </Button>
          </div>
          <div className="mt-5 h-px bg-gradient-to-r from-brand-premium/30 via-brand-accent/10 to-transparent" />
        </div>
      </div>

      {/* --- Stats Row --- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Bots */}
        <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] hover:border-white/[0.1] transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Всего ботов</p>
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-accent/10 border border-brand-accent/10">
                <Hash className="h-4 w-4 text-brand-accent" />
              </div>
            </div>
            <p className="text-3xl font-bold font-mono text-white">{bots.length}</p>
            <p className="text-xs text-gray-500 mt-1.5">
              {demoBots} demo / {liveBots} live
            </p>
          </CardContent>
        </Card>

        {/* Active */}
        <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] hover:border-white/[0.1] transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Активные</p>
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-profit/10 border border-brand-profit/10">
                <Activity className="h-4 w-4 text-brand-profit" />
              </div>
            </div>
            <p className="text-3xl font-bold font-mono text-brand-profit">{activeBots}</p>
            <p className="text-xs text-gray-500 mt-1.5">
              {activeBots > 0 ? 'Торговля ведется' : 'Нет активных'}
            </p>
          </CardContent>
        </Card>

        {/* P&L Card - Highlighted */}
        <Card className="border-brand-premium/10 bg-gradient-to-br from-brand-premium/[0.04] to-white/[0.01] hover:border-brand-premium/20 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Суммарный P&L</p>
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10 border border-brand-premium/10">
                <TrendingUp className="h-4 w-4 text-brand-premium" />
              </div>
            </div>
            <p
              className={`text-3xl font-bold font-mono ${
                totalPnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'
              }`}
            >
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </p>
            {/* Demo/Live toggle */}
            <div className="flex items-center gap-1 mt-2.5">
              <button
                onClick={() => setPnlIncludeDemo(true)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
                  pnlIncludeDemo
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-gray-500 hover:text-gray-400 border border-transparent'
                }`}
              >
                Все боты
              </button>
              <button
                onClick={() => setPnlIncludeDemo(false)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
                  !pnlIncludeDemo
                    ? 'bg-brand-premium/15 text-brand-premium border border-brand-premium/25'
                    : 'text-gray-500 hover:text-gray-400 border border-transparent'
                }`}
              >
                Только Live
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- Bot Grid --- */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
        </div>
      ) : bots.length === 0 ? (
        /* --- Empty State --- */
        <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="relative mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-premium/10 to-brand-accent/5 border border-brand-premium/10 flex items-center justify-center">
                <Bot className="h-9 w-9 text-brand-premium/40" />
              </div>
              <div className="absolute -top-3 -right-3 w-10 h-10 rounded-xl bg-brand-profit/5 border border-brand-profit/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-brand-profit/30" />
              </div>
              <div className="absolute -bottom-2 -left-3 w-9 h-9 rounded-lg bg-brand-accent/5 border border-brand-accent/10 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-brand-accent/30" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-white font-[Tektur] tracking-tight">
              Создайте первого бота
            </h3>
            <p className="text-sm text-gray-500 mt-2 text-center max-w-sm leading-relaxed">
              Автоматизируйте торговлю - бот будет выполнять стратегию 24/7, открывая и закрывая позиции по вашим правилам
            </p>
            <Button
              onClick={() => setShowCreate(true)}
              className="mt-6 bg-brand-premium text-brand-bg hover:bg-brand-premium/90 font-semibold shadow-lg shadow-brand-premium/10"
            >
              <Plus className="mr-2 h-4 w-4" />
              Создать бота
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bots.map((bot) => {
            const status = STATUS_CONFIG[bot.status];
            const config = configMap.get(bot.strategy_config_id);
            const isSelected = selectedBot === bot.id;
            const pnl = Number(bot.total_pnl ?? 0);
            const winRate = Number(bot.win_rate ?? 0);
            const drawdown = Math.abs(Number(bot.max_drawdown ?? 0));
            const isRunning = bot.status === 'running';
            const isError = bot.status === 'error';

            return (
              <Card
                key={bot.id}
                className={`
                  relative overflow-hidden
                  border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]
                  transition-all duration-200 cursor-pointer
                  hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20
                  ${isSelected ? 'ring-1 ring-brand-premium/30 border-brand-premium/20' : ''}
                  ${isRunning ? 'border-l-2 border-l-brand-profit/40' : ''}
                  ${isError ? 'border-l-2 border-l-brand-loss/40' : ''}
                `}
                onClick={() => setSelectedBot(bot.id)}
                onDoubleClick={() => navigate(`/bots/${bot.id}`)}
              >
                {/* Card Header */}
                <CardHeader className="flex flex-row items-start justify-between pb-2 pt-4 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                      isRunning
                        ? 'bg-brand-profit/10 border border-brand-profit/15'
                        : 'bg-brand-premium/10 border border-brand-premium/15'
                    }`}>
                      <Bot className={`h-5 w-5 ${isRunning ? 'text-brand-profit' : 'text-brand-premium'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm text-white truncate">
                          {config?.name ?? 'Конфигурация'}
                        </CardTitle>
                        <span
                          className={`inline-flex h-2 w-2 rounded-full flex-shrink-0 ${status.dot} ${
                            isRunning ? 'animate-pulse' : ''
                          }`}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {config
                          ? `${config.symbol} / ${config.timeframe}`
                          : bot.strategy_config_id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  {/* Mode badge - top right */}
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${MODE_COLORS[bot.mode]}`}
                  >
                    {MODE_LABELS[bot.mode]}
                  </span>
                </CardHeader>

                {/* Metrics Grid */}
                <CardContent className="px-4 pb-2 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    {/* P&L */}
                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="h-3 w-3 text-gray-600" />
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">P&L</span>
                      </div>
                      <p className={`text-base font-bold font-mono ${pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </p>
                    </div>

                    {/* Win Rate */}
                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Percent className="h-3 w-3 text-gray-600" />
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
                      </div>
                      <p className="text-base font-bold font-mono text-white">
                        {winRate.toFixed(1)}%
                      </p>
                      <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-profit/60 transition-all"
                          style={{ width: `${Math.min(winRate, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Trades */}
                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 className="h-3 w-3 text-gray-600" />
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Сделки</span>
                      </div>
                      <p className="text-base font-bold font-mono text-white">
                        {bot.total_trades}
                      </p>
                    </div>

                    {/* Drawdown */}
                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ArrowDownRight className="h-3 w-3 text-gray-600" />
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">DD</span>
                      </div>
                      <p className="text-base font-bold font-mono text-brand-loss">
                        {drawdown !== 0 ? `-$${drawdown.toFixed(2)}` : '$0.00'}
                      </p>
                    </div>
                  </div>
                </CardContent>

                {/* Status Bar + Actions */}
                <div className="px-4 pb-4 pt-2">
                  {/* Status label */}
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant={status.variant} className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${status.dot} ${
                          isRunning ? 'animate-pulse' : ''
                        }`}
                      />
                      {status.label}
                    </Badge>
                    {isError && (
                      <span className="text-[10px] text-brand-loss/70">Требуется внимание</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBot(bot.id, bot.status);
                        }}
                        className="flex-1 bg-brand-loss/10 text-brand-loss border border-brand-loss/20 hover:bg-brand-loss/20 hover:text-brand-loss"
                      >
                        <Square className="mr-1.5 h-3.5 w-3.5" />
                        Стоп
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBot(bot.id, bot.status);
                        }}
                        className="flex-1 bg-brand-profit/10 text-brand-profit border border-brand-profit/20 hover:bg-brand-profit/20 hover:text-brand-profit"
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Старт
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/bots/${bot.id}`);
                      }}
                      className="text-gray-500 hover:text-white hover:bg-white/[0.06]"
                      title="Подробнее"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {!isRunning && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBot(bot.id);
                        }}
                        className="text-gray-500 hover:text-brand-loss hover:bg-brand-loss/[0.06]"
                        title="Удалить бота"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create bot dialog */}
      <CreateBotDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          loadData();
        }}
      />
    </div>
  );
}

/* ---- Create Bot Dialog ---- */

interface ModeCardOption {
  value: BotMode;
  label: string;
  description: string;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Shield;
}

const MODE_OPTIONS: ModeCardOption[] = [
  {
    value: 'demo',
    label: 'Демо',
    description: 'Виртуальные сделки без риска',
    iconColor: 'text-blue-400',
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/20',
    icon: Shield,
  },
  {
    value: 'paper',
    label: 'Paper',
    description: 'Симуляция на реальных данных',
    iconColor: 'text-purple-400',
    bgColor: 'bg-purple-500/5',
    borderColor: 'border-purple-500/20',
    icon: BarChart3,
  },
  {
    value: 'live',
    label: 'Live',
    description: 'Реальная торговля',
    iconColor: 'text-brand-premium',
    bgColor: 'bg-brand-premium/5',
    borderColor: 'border-brand-premium/20',
    icon: Zap,
  },
];

function CreateBotDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [strategyConfigId, setStrategyConfigId] = useState('');
  const [exchangeAccountId, setExchangeAccountId] = useState('');
  const [mode, setMode] = useState<BotMode>('demo');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingData(true);

    const configsReq = api
      .get<StrategyConfig[]>('/strategies/configs/my')
      .then(({ data }) => data)
      .catch(() => [] as StrategyConfig[]);

    const accountsReq = api
      .get<ExchangeAccount[]>('/auth/exchange-accounts')
      .then(({ data }) => data)
      .catch(() => [] as ExchangeAccount[]);

    Promise.all([configsReq, accountsReq])
      .then(([configsData, accountsData]) => {
        setConfigs(configsData);
        setAccounts(accountsData);
        // Автовыбор первого элемента если есть
        if (configsData.length > 0 && !strategyConfigId) {
          setStrategyConfigId(configsData[0].id);
        }
        if (accountsData.length > 0 && !exchangeAccountId) {
          setExchangeAccountId(accountsData[0].id);
        }
      })
      .finally(() => setLoadingData(false));
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!strategyConfigId || !exchangeAccountId) return;

    setSubmitting(true);
    const payload: BotCreate = {
      strategy_config_id: strategyConfigId,
      exchange_account_id: exchangeAccountId,
      mode,
    };

    api
      .post('/trading/bots', payload)
      .then(() => {
        onCreated();
        resetForm();
      })
      .catch(() => {
        // Fallback: close anyway
        onCreated();
      })
      .finally(() => setSubmitting(false));
  };

  function resetForm() {
    setStrategyConfigId('');
    setExchangeAccountId('');
    setMode('demo');
  }

  const canSubmit = strategyConfigId && exchangeAccountId && !submitting;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader onClose={onClose}>
          <DialogTitle>Создать бота</DialogTitle>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Strategy config selector */}
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-2">
                Конфигурация стратегии
              </label>
              {configs.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10 flex-shrink-0">
                    <Settings className="h-4 w-4 text-brand-premium/60" />
                  </div>
                  <p className="text-sm text-gray-400">
                    Сначала создайте конфигурацию{' '}
                    <Link
                      to="/strategies"
                      className="text-brand-premium hover:text-brand-premium/80 underline"
                    >
                      на странице стратегий
                    </Link>
                  </p>
                </div>
              ) : (
                <Select
                  value={strategyConfigId}
                  onChange={setStrategyConfigId}
                  options={configs.map((c) => ({
                    value: c.id,
                    label: `${c.name} - ${c.symbol} ${c.timeframe}`,
                  }))}
                  className="w-full"
                />
              )}
            </div>

            {/* Exchange account selector */}
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-2">
                Аккаунт биржи
              </label>
              {accounts.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-accent/10 flex-shrink-0">
                    <Zap className="h-4 w-4 text-brand-accent/60" />
                  </div>
                  <p className="text-sm text-gray-400">
                    Добавьте API ключи{' '}
                    <Link
                      to="/settings"
                      className="text-brand-premium hover:text-brand-premium/80 underline"
                    >
                      в настройках
                    </Link>
                  </p>
                </div>
              ) : (
                <Select
                  value={exchangeAccountId}
                  onChange={setExchangeAccountId}
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: `${a.label} (${a.exchange}${a.is_testnet ? ' demo' : ''})`,
                  }))}
                  className="w-full"
                />
              )}
            </div>

            {/* Mode selector - visual cards */}
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-2">
                Режим торговли
              </label>
              <div className="grid grid-cols-3 gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMode(opt.value)}
                      className={`
                        relative p-3 rounded-xl border text-left transition-all duration-200
                        ${isActive
                          ? `${opt.bgColor} ${opt.borderColor} ring-1 ${opt.borderColor.replace('border-', 'ring-')}`
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.03]'
                        }
                      `}
                    >
                      <Icon className={`h-4 w-4 mb-2 ${isActive ? opt.iconColor : 'text-gray-500'}`} />
                      <p className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Warning for live mode */}
            {mode === 'live' && (
              <div className="p-4 rounded-xl border border-brand-loss/20 bg-brand-loss/[0.04]">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-loss/10 flex-shrink-0 mt-0.5">
                    <AlertTriangle className="h-4.5 w-4.5 text-brand-loss" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-loss mb-1">
                      Реальные средства
                    </p>
                    <p className="text-xs text-brand-loss/70 leading-relaxed">
                      Режим Live использует реальные средства. Убедитесь в корректности
                      стратегии перед запуском. Протестируйте сначала в Demo.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1 text-gray-400"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="flex-1 bg-brand-premium text-brand-bg hover:bg-brand-premium/90 font-semibold"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Создать'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
