import { useEffect, useState, useCallback } from 'react';
import {
  Bot,
  Play,
  Square,
  Plus,
  Loader2,
  AlertCircle,
  MoreVertical,
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import api from '@/lib/api';

interface BotRecord {
  id: string;
  name: string;
  strategy_name?: string;
  symbol: string;
  timeframe: string;
  status: 'running' | 'stopped' | 'error';
  pnl?: number;
  created_at: string;
}

const STATUS_CONFIG = {
  running: { variant: 'profit' as const, label: 'Работает', dot: 'bg-brand-profit' },
  stopped: { variant: 'default' as const, label: 'Остановлен', dot: 'bg-gray-500' },
  error: { variant: 'loss' as const, label: 'Ошибка', dot: 'bg-brand-loss' },
};

export function Bots() {
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);

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
    loadBots();
  }, []);

  function loadBots() {
    setLoading(true);
    api
      .get('/trading/bots')
      .then(({ data }) => setBots(data as BotRecord[]))
      .catch(() => {
        // Demo data fallback
        setBots(getDemoBots());
      })
      .finally(() => setLoading(false));
  }

  function toggleBot(id: string, currentStatus: string) {
    const action = currentStatus === 'running' ? 'stop' : 'start';
    api
      .post(`/trading/bots/${id}/${action}`)
      .then(() => loadBots())
      .catch(() => {
        // Fallback: toggle locally
        setBots((prev) =>
          prev.map((b) =>
            b.id === id
              ? { ...b, status: currentStatus === 'running' ? 'stopped' : 'running' }
              : b,
          ),
        );
      });
  }

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
                (bots.reduce((s, b) => s + (b.pnl ?? 0), 0)) >= 0
                  ? 'text-brand-profit'
                  : 'text-brand-loss'
              }`}
            >
              ${bots.reduce((s, b) => s + (b.pnl ?? 0), 0).toFixed(2)}
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
            const isSelected = selectedBot === bot.id;
            return (
              <Card
                key={bot.id}
                className={`border-white/5 bg-white/[0.02] transition-all cursor-pointer hover:border-brand-premium/20 ${
                  isSelected ? 'ring-1 ring-brand-premium/30' : ''
                }`}
                onClick={() => setSelectedBot(bot.id)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-premium/10">
                      <Bot className="h-5 w-5 text-brand-premium" />
                    </div>
                    <div>
                      <CardTitle className="text-sm text-white">{bot.name}</CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {bot.strategy_name ?? 'Lorentzian KNN'}
                      </p>
                    </div>
                  </div>
                  <button className="text-gray-500 hover:text-white transition-colors">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Пара</span>
                    <span className="text-xs text-white font-mono">{bot.symbol}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Таймфрейм</span>
                    <span className="text-xs text-white font-mono">{bot.timeframe}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">P&L</span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        (bot.pnl ?? 0) >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                      }`}
                    >
                      {(bot.pnl ?? 0) >= 0 ? '+' : ''}${(bot.pnl ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Статус</span>
                    <Badge variant={status.variant} className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${bot.status === 'running' ? 'animate-pulse' : ''}`} />
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
          loadBots();
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
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    api
      .post('/trading/bots', { name, symbol, timeframe })
      .then(() => {
        onCreated();
        setName('');
      })
      .catch(() => {
        // Fallback: close anyway
        onCreated();
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader onClose={onClose}>
          <DialogTitle>Создать бота</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Название</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Мой бот BTC"
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Торговая пара</label>
            <Select
              value={symbol}
              onChange={setSymbol}
              options={[
                { value: 'BTCUSDT', label: 'BTC/USDT' },
                { value: 'ETHUSDT', label: 'ETH/USDT' },
                { value: 'SOLUSDT', label: 'SOL/USDT' },
                { value: 'RIVERUSDT', label: 'RIVER/USDT' },
              ]}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Таймфрейм</label>
            <Select
              value={timeframe}
              onChange={setTimeframe}
              options={[
                { value: '1m', label: '1 минута' },
                { value: '5m', label: '5 минут' },
                { value: '15m', label: '15 минут' },
                { value: '1h', label: '1 час' },
                { value: '4h', label: '4 часа' },
              ]}
              className="w-full"
            />
          </div>
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
              disabled={!name.trim() || submitting}
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
      </DialogContent>
    </Dialog>
  );
}

/* ---- Demo data ---- */

function getDemoBots(): BotRecord[] {
  return [
    {
      id: 'demo-1',
      name: 'RIVER Hunter',
      strategy_name: 'Lorentzian KNN',
      symbol: 'RIVERUSDT',
      timeframe: '5m',
      status: 'running',
      pnl: 1247.83,
      created_at: '2026-03-20T12:00:00Z',
    },
    {
      id: 'demo-2',
      name: 'BTC Scalper',
      strategy_name: 'Lorentzian KNN',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      status: 'stopped',
      pnl: -42.1,
      created_at: '2026-03-22T08:00:00Z',
    },
    {
      id: 'demo-3',
      name: 'ETH Momentum',
      strategy_name: 'Lorentzian KNN',
      symbol: 'ETHUSDT',
      timeframe: '1h',
      status: 'error',
      pnl: 0,
      created_at: '2026-03-28T15:00:00Z',
    },
  ];
}
