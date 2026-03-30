import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Play,
  Square,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Filter,
  Info,
  AlertTriangle,
  XCircle,
  Bug,
  Loader2,
  AlertCircle,
  Hash,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import api from '@/lib/api';
import type {
  BotResponse,
  BotStatus,
  BotMode,
  StrategyConfig,
  TradeSignalResponse,
  OrderResponse,
  PositionResponse,
  BotLogResponse,
  BotLogLevel,
} from '@/types/api';

/* ---- Constants ---- */

const REFRESH_INTERVAL_MS = 30_000;

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

const MODE_BADGE_STYLES: Record<BotMode, string> = {
  demo: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
  live: 'bg-brand-loss/10 text-brand-loss ring-brand-loss/20',
  paper: 'bg-gray-500/10 text-gray-400 ring-gray-500/20',
};

const LOG_LEVEL_CONFIG: Record<
  BotLogLevel,
  { icon: typeof Info; color: string; label: string }
> = {
  info: { icon: Info, color: 'text-blue-400', label: 'Info' },
  warn: { icon: AlertTriangle, color: 'text-yellow-400', label: 'Warn' },
  error: { icon: XCircle, color: 'text-brand-loss', label: 'Error' },
  debug: { icon: Bug, color: 'text-gray-500', label: 'Debug' },
};

/* ---- Helpers ---- */

function formatDatetime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatUptime(startedAt: string | null): string {
  if (!startedAt) return 'Остановлен';
  const diffMs = Date.now() - new Date(startedAt).getTime();
  if (diffMs < 0) return '0м';
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${mins}м`;
  return `${mins}м`;
}

function formatPrice(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n);
  const maxFrac = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  });
}

function formatQty(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n);
  const maxFrac = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

function formatPnl(value: number | string): string {
  const n = Number(value);
  const prefix = n >= 0 ? '+' : '';
  return `${prefix}$${n.toFixed(2)}`;
}

/* ---- Main Component ---- */

export function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [bot, setBot] = useState<BotResponse | null>(null);
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  // Tab data
  const [signals, setSignals] = useState<TradeSignalResponse[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [positions, setPositions] = useState<PositionResponse[]>([]);
  const [logs, setLogs] = useState<BotLogResponse[]>([]);
  const [logFilter, setLogFilter] = useState<BotLogLevel | 'all'>('all');
  const [logPage, setLogPage] = useState(0);
  const [logHasMore, setLogHasMore] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Loading states per tab
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- Data fetching ---- */

  const fetchBot = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<BotResponse>(`/trading/bots/${id}`);
      setBot(data);
      setError(null);

      // Fetch strategy config for name display
      try {
        const { data: cfgData } = await api.get<StrategyConfig>(
          `/strategies/configs/${data.strategy_config_id}`,
        );
        setConfig(cfgData);
      } catch {
        // Config may be inaccessible, not critical
      }
    } catch {
      setError('Не удалось загрузить бота');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchSignals = useCallback(async () => {
    if (!id) return;
    setSignalsLoading(true);
    try {
      const { data } = await api.get<TradeSignalResponse[]>(
        `/trading/bots/${id}/signals`,
      );
      setSignals(data);
    } catch {
      setSignals([]);
    } finally {
      setSignalsLoading(false);
    }
  }, [id]);

  const fetchOrders = useCallback(async () => {
    if (!id) return;
    setOrdersLoading(true);
    try {
      const { data } = await api.get<OrderResponse[]>(
        `/trading/bots/${id}/orders`,
      );
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [id]);

  const fetchPositions = useCallback(async () => {
    if (!id) return;
    setPositionsLoading(true);
    try {
      const { data } = await api.get<PositionResponse[]>(
        `/trading/bots/${id}/positions`,
      );
      setPositions(data);
    } catch {
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, [id]);

  const fetchLogs = useCallback(
    async (page = 0, append = false) => {
      if (!id) return;
      setLogsLoading(true);
      try {
        const { data } = await api.get<BotLogResponse[]>(
          `/trading/bots/${id}/logs`,
          { params: { skip: page * 50, limit: 50 } },
        );
        if (append) {
          setLogs((prev) => [...prev, ...data]);
        } else {
          setLogs(data);
        }
        setLogHasMore(data.length === 50);
      } catch {
        // Endpoint may not exist yet (404) — handle gracefully
        if (!append) setLogs([]);
        setLogHasMore(false);
      } finally {
        setLogsLoading(false);
      }
    },
    [id],
  );

  const refreshAll = useCallback(() => {
    fetchBot();
    fetchSignals();
    fetchOrders();
    fetchPositions();
    fetchLogs(0);
    setLogPage(0);
    setLastRefresh(new Date());
  }, [fetchBot, fetchSignals, fetchOrders, fetchPositions, fetchLogs]);

  /* ---- Effects ---- */

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh when bot is running
  useEffect(() => {
    if (bot?.status === 'running') {
      refreshTimerRef.current = setInterval(refreshAll, REFRESH_INTERVAL_MS);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [bot?.status, refreshAll]);

  /* ---- Actions ---- */

  function toggleBot() {
    if (!bot) return;
    const action = bot.status === 'running' ? 'stop' : 'start';
    setToggling(true);
    api
      .post(`/trading/bots/${bot.id}/${action}`)
      .then(() => fetchBot())
      .catch(() => {
        // Fallback: toggle locally
        setBot((prev) =>
          prev
            ? {
                ...prev,
                status: (prev.status === 'running'
                  ? 'stopped'
                  : 'running') as BotStatus,
              }
            : prev,
        );
      })
      .finally(() => setToggling(false));
  }

  function toggleLogExpand(logId: string) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }

  function loadMoreLogs() {
    const nextPage = logPage + 1;
    setLogPage(nextPage);
    fetchLogs(nextPage, true);
  }

  const filteredLogs = useMemo(
    () =>
      logFilter === 'all'
        ? logs
        : logs.filter((l) => l.level === logFilter),
    [logs, logFilter],
  );

  /* ---- Derived ---- */

  const botName = config
    ? `${config.name} — ${config.symbol} ${config.timeframe}`
    : bot
      ? `Бот ${bot.id.slice(0, 8)}`
      : 'Загрузка...';

  /* ---- Loading state ---- */

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  /* ---- Error state ---- */

  if (error || !bot) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-brand-loss mb-4" />
        <p className="text-gray-400 text-lg">
          {error ?? 'Бот не найден'}
        </p>
        <Button
          variant="ghost"
          className="mt-4 text-gray-400"
          onClick={() => navigate('/bots')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Вернуться к ботам
        </Button>
      </div>
    );
  }

  const status = STATUS_CONFIG[bot.status];

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/bots')}
            className="text-gray-400 hover:text-white shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-premium/10 shrink-0">
            <Bot className="h-5 w-5 text-brand-premium" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white truncate">
                {botName}
              </h1>
              <Badge
                variant={status.variant}
                className="flex items-center gap-1.5 shrink-0"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${status.dot} ${
                    bot.status === 'running' ? 'animate-pulse' : ''
                  }`}
                />
                {status.label}
              </Badge>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 ring-inset shrink-0 ${MODE_BADGE_STYLES[bot.mode]}`}
              >
                {MODE_LABELS[bot.mode]}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Создан {formatDatetime(bot.created_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-600 mr-2 hidden sm:inline">
            Обновлено{' '}
            {lastRefresh.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={refreshAll}
            className="text-gray-400 hover:text-white"
            title="Обновить"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {bot.status === 'running' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleBot}
              disabled={toggling}
              className="border-brand-loss/30 text-brand-loss hover:bg-brand-loss/10 hover:text-brand-loss"
            >
              {toggling ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="mr-1.5 h-3.5 w-3.5" />
              )}
              Остановить
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleBot}
              disabled={toggling}
              className="border-brand-profit/30 text-brand-profit hover:bg-brand-profit/10 hover:text-brand-profit"
            >
              {toggling ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Запустить
            </Button>
          )}
        </div>
      </div>

      {/* ---- Stats Row ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total P&L */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {Number(bot.total_pnl) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-brand-profit" />
              ) : (
                <TrendingDown className="h-4 w-4 text-brand-loss" />
              )}
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Общий P&L
              </p>
            </div>
            <p
              className={`text-2xl font-bold font-mono ${
                Number(bot.total_pnl) >= 0 ? 'text-brand-profit' : 'text-brand-loss'
              }`}
            >
              {formatPnl(bot.total_pnl)}
            </p>
          </CardContent>
        </Card>

        {/* Total Trades */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="h-4 w-4 text-brand-accent" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Всего сделок
              </p>
            </div>
            <p className="text-2xl font-bold font-mono text-white">
              {bot.total_trades}
            </p>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-brand-premium" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Win Rate
              </p>
            </div>
            <p className="text-2xl font-bold font-mono text-white">
              {(Number(bot.win_rate) * 100).toFixed(1)}%
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-premium transition-all duration-500"
                style={{ width: `${Math.min(Number(bot.win_rate) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Аптайм
              </p>
            </div>
            <p className="text-2xl font-bold font-mono text-white">
              {bot.status === 'running'
                ? formatUptime(bot.started_at)
                : 'Остановлен'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Tabs ---- */}
      <Tabs defaultValue="signals">
        <TabsList className="flex-wrap">
          <TabsTrigger value="signals">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Сигналы
          </TabsTrigger>
          <TabsTrigger value="orders">Ордера</TabsTrigger>
          <TabsTrigger value="positions">Позиции</TabsTrigger>
          <TabsTrigger value="logs">Логи</TabsTrigger>
        </TabsList>

        {/* ---- Signals Tab ---- */}
        <TabsContent value="signals">
          {signalsLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : signals.length === 0 ? (
            <EmptyState message="Нет сигналов" />
          ) : (
            <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Направление</TableHead>
                    <TableHead>Сила</TableHead>
                    <TableHead>KNN класс</TableHead>
                    <TableHead>KNN уверенность</TableHead>
                    <TableHead>Confluence</TableHead>
                    <TableHead>Исполнен</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signals.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDatetime(s.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.direction === 'long' ? 'profit' : 'loss'
                          }
                        >
                          {s.direction === 'long' ? 'LONG' : 'SHORT'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {Number(s.signal_strength).toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {s.knn_class}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">
                          {Number(s.knn_confidence).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand-accent transition-all"
                              style={{
                                width: `${Math.min((Math.abs(Number(s.signal_strength)) / 5.5) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs">
                            {Number(s.signal_strength).toFixed(2)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.was_executed ? (
                          <Badge variant="profit">Да</Badge>
                        ) : (
                          <Badge variant="default">Нет</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ---- Orders Tab ---- */}
        <TabsContent value="orders">
          {ordersLoading ? (
            <TableSkeleton rows={5} cols={8} />
          ) : orders.length === 0 ? (
            <EmptyState message="Нет ордеров" />
          ) : (
            <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Символ</TableHead>
                    <TableHead>Сторона</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Количество</TableHead>
                    <TableHead>Цена</TableHead>
                    <TableHead>Цена исполнения</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDatetime(o.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-white font-medium">
                        {o.symbol}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={o.side === 'buy' ? 'profit' : 'loss'}
                        >
                          {o.side === 'buy' ? 'BUY' : 'SELL'}
                        </Badge>
                      </TableCell>
                      <TableCell className="uppercase text-xs">
                        {o.type}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatQty(o.quantity)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatPrice(o.price)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatPrice(o.filled_price)}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={o.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ---- Positions Tab ---- */}
        <TabsContent value="positions">
          {positionsLoading ? (
            <TableSkeleton rows={3} cols={8} />
          ) : positions.length === 0 ? (
            <EmptyState message="Нет позиций" />
          ) : (
            <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Символ</TableHead>
                    <TableHead>Сторона</TableHead>
                    <TableHead>Цена входа</TableHead>
                    <TableHead>Количество</TableHead>
                    <TableHead>SL / TP</TableHead>
                    <TableHead>Нереализ. P&L</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Открыта</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-white font-medium">
                        {p.symbol}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.side === 'long' ? 'profit' : 'loss'}
                        >
                          {p.side === 'long' ? 'LONG' : 'SHORT'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatPrice(p.entry_price)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatQty(p.quantity)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span className="text-brand-loss">
                          {formatPrice(p.stop_loss)}
                        </span>
                        {' / '}
                        <span className="text-brand-profit">
                          {formatPrice(p.take_profit)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-mono font-medium ${
                            Number(p.unrealized_pnl) >= 0
                              ? 'text-brand-profit'
                              : 'text-brand-loss'
                          }`}
                        >
                          {formatPnl(p.unrealized_pnl)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {p.status === 'open' ? (
                          <Badge variant="profit">Открыта</Badge>
                        ) : (
                          <Badge variant="default">Закрыта</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDatetime(p.opened_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ---- Logs Tab ---- */}
        <TabsContent value="logs">
          {/* Log filter bar */}
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs text-gray-500 mr-1">Фильтр:</span>
            {(['all', 'info', 'warn', 'error', 'debug'] as const).map(
              (level) => (
                <button
                  key={level}
                  onClick={() => setLogFilter(level)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                    logFilter === level
                      ? 'bg-white/10 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {level === 'all'
                    ? 'Все'
                    : level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ),
            )}
          </div>

          {logsLoading && logs.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState message="Нет логов" />
          ) : (
            <div className="space-y-1.5">
              {filteredLogs.map((log) => {
                const levelCfg = LOG_LEVEL_CONFIG[log.level];
                const LevelIcon = levelCfg.icon;
                const isExpanded = expandedLogs.has(log.id);

                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <LevelIcon
                        className={`h-4 w-4 mt-0.5 shrink-0 ${levelCfg.color}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 break-words">
                          {log.message}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          {formatDatetime(log.created_at)}
                        </p>
                      </div>
                      {log.details && (
                        <button
                          onClick={() => toggleLogExpand(log.id)}
                          className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Expandable details */}
                    {isExpanded && log.details && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <pre className="text-[11px] text-gray-500 font-mono bg-black/20 rounded-md p-3 overflow-x-auto max-h-60">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Load more */}
              {logHasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadMoreLogs}
                    disabled={logsLoading}
                    className="text-gray-400 hover:text-white"
                  >
                    {logsLoading ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Загрузить ещё
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---- Sub-components ---- */

function OrderStatusBadge({
  status,
}: {
  status: OrderResponse['status'];
}) {
  const config: Record<
    OrderResponse['status'],
    { variant: 'profit' | 'default' | 'loss' | 'premium'; label: string }
  > = {
    open: { variant: 'premium', label: 'Открыт' },
    filled: { variant: 'profit', label: 'Исполнен' },
    cancelled: { variant: 'default', label: 'Отменён' },
    error: { variant: 'loss', label: 'Ошибка' },
  };
  const c = config[status];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-white/5 bg-white/[0.02]">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Activity className="h-8 w-8 text-gray-600 mb-3" />
        <p className="text-gray-500 text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="flex gap-4">
            {Array.from({ length: cols }).map((_, ci) => (
              <Skeleton key={ci} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
