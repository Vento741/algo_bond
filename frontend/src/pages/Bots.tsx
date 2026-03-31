import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bot,
  Play,
  Square,
  Plus,
  Loader2,
  AlertCircle,
  MoreVertical,
  Settings,
  Zap,
  ExternalLink,
  Trash2,
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
  }, [selectedBot, bots]);

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

  /** Суммарный P&L всех ботов (total_pnl приходит как string от Decimal) */
  const totalPnl = bots.reduce((s, b) => s + Number(b.total_pnl ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Торговые боты</h1>
          <p className="text-gray-400 text-sm mt-1">
            Управление автоматической торговлей
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-brand-premium text-brand-bg hover:bg-brand-premium/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Создать бота
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Всего ботов</p>
            <p className="text-2xl font-bold font-mono text-white mt-1">{bots.length}</p>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Активные</p>
            <p className="text-2xl font-bold font-mono text-brand-profit mt-1">
              {bots.filter((b) => b.status === 'running').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Суммарный P&L</p>
            <p
              className={`text-2xl font-bold font-mono mt-1 ${
                totalPnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'
              }`}
            >
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bot list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
        </div>
      ) : bots.length === 0 ? (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bot className="h-12 w-12 text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg font-medium">Боты не созданы</p>
            <p className="text-gray-500 text-sm mt-1">
              Создайте первого бота для автоматической торговли
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bots.map((bot) => {
            const status = STATUS_CONFIG[bot.status];
            const config = configMap.get(bot.strategy_config_id);
            const isSelected = selectedBot === bot.id;
            return (
              <Card
                key={bot.id}
                className={`border-white/5 bg-white/[0.02] transition-all cursor-pointer hover:border-brand-premium/20 ${
                  isSelected ? 'ring-1 ring-brand-premium/30' : ''
                }`}
                onClick={() => setSelectedBot(bot.id)}
                onDoubleClick={() => navigate(`/bots/${bot.id}`)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-premium/10">
                      <Bot className="h-5 w-5 text-brand-premium" />
                    </div>
                    <div>
                      <CardTitle className="text-sm text-white">
                        {config?.name ?? 'Конфигурация'}
                      </CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {config
                          ? `${config.symbol} / ${config.timeframe}`
                          : bot.strategy_config_id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-gray-500 hover:text-white transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/bots/${bot.id}`);
                    }}
                    title="Подробнее"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Режим</span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${MODE_COLORS[bot.mode]}`}
                    >
                      {MODE_LABELS[bot.mode]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Сделки</span>
                    <span className="text-xs text-white font-mono">{bot.total_trades}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Win Rate</span>
                    <span className="text-xs text-white font-mono">
                      {Number(bot.win_rate).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">P&L</span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        bot.total_pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                      }`}
                    >
                      {Number(bot.total_pnl) >= 0 ? '+' : ''}${Number(bot.total_pnl).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Статус</span>
                    <Badge variant={status.variant} className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${status.dot} ${
                          bot.status === 'running' ? 'animate-pulse' : ''
                        }`}
                      />
                      {status.label}
                    </Badge>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    {bot.status === 'running' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBot(bot.id, bot.status);
                        }}
                        className="flex-1 border-brand-loss/30 text-brand-loss hover:bg-brand-loss/10 hover:text-brand-loss"
                      >
                        <Square className="mr-1.5 h-3 w-3" />
                        Стоп
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBot(bot.id, bot.status);
                        }}
                        className="flex-1 border-brand-profit/30 text-brand-profit hover:bg-brand-profit/10 hover:text-brand-profit"
                      >
                        <Play className="mr-1.5 h-3 w-3" />
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
                      className="text-gray-400 hover:text-white"
                      title="Подробнее"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {bot.status !== 'running' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBot(bot.id);
                        }}
                        className="text-gray-500 hover:text-brand-loss"
                        title="Удалить бота"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {bot.status === 'error' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-brand-loss"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Strategy config selector */}
            <div>
              <label className="text-sm text-gray-400 block mb-1.5">Конфигурация стратегии</label>
              {configs.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-md border border-white/10 bg-white/5">
                  <Settings className="h-4 w-4 text-gray-500 shrink-0" />
                  <p className="text-sm text-gray-400">
                    Сначала создайте конфигурацию стратегии{' '}
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
                    label: `${c.name} \u2014 ${c.symbol} ${c.timeframe}`,
                  }))}
                  className="w-full"
                />
              )}
            </div>

            {/* Exchange account selector */}
            <div>
              <label className="text-sm text-gray-400 block mb-1.5">Аккаунт биржи</label>
              {accounts.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-md border border-white/10 bg-white/5">
                  <Zap className="h-4 w-4 text-gray-500 shrink-0" />
                  <p className="text-sm text-gray-400">
                    Добавьте API ключи биржи{' '}
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

            {/* Mode selector */}
            <div>
              <label className="text-sm text-gray-400 block mb-1.5">Режим торговли</label>
              <Select
                value={mode}
                onChange={(v) => setMode(v as BotMode)}
                options={[
                  { value: 'demo', label: 'Демо \u2014 виртуальные сделки' },
                  { value: 'paper', label: 'Paper \u2014 симуляция на реальных данных' },
                  { value: 'live', label: 'Live \u2014 реальная торговля' },
                ]}
                className="w-full"
              />
            </div>

            {/* Warning for live mode */}
            {mode === 'live' && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-brand-loss/20 bg-brand-loss/5">
                <AlertCircle className="h-4 w-4 text-brand-loss shrink-0 mt-0.5" />
                <p className="text-xs text-brand-loss/80">
                  Режим Live использует реальные средства. Убедитесь в корректности
                  стратегии перед запуском.
                </p>
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
                className="flex-1 bg-brand-premium text-brand-bg hover:bg-brand-premium/90"
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

