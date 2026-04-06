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
  Crosshair,
  ArrowDownRight,
  Wifi,
  WifiOff,
  Target,
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
const REFRESH_INTERVAL_SSE_MS = 60_000;

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
  debug: { icon: Bug, color: 'text-gray-400', label: 'Debug' },
};

/* ---- SSE connection status ---- */

type SseStatus = 'disconnected' | 'connecting' | 'connected';

/* ---- SSE event payload types ---- */

interface PositionUpdatePayload {
  bot_id: string;
  position_id: string;
  symbol: string;
  side: string;
  size: string;
  unrealized_pnl: string;
  mark_price: string;
  closed: boolean;
  entry_price: string;
  quantity: string;
  stop_loss: string;
  take_profit: string;
  trailing_stop: string | null;
  max_pnl: string;
  min_pnl: string;
  max_price: string | null;
  min_price: string | null;
  bot_ids: string[];
  realized_pnl?: string;
}

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

function formatDuration(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (diffMs < 0) return '0м';
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${mins}м`;
  return `${mins}м`;
}

function formatUptime(startedAt: string | null): string {
  if (!startedAt) return 'Остановлен';
  return formatDuration(startedAt);
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

function formatPct(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  const prefix = n >= 0 ? '+' : '';
  return `${prefix}${n.toFixed(2)}%`;
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

  // SSE state
  const [sseStatus, setSseStatus] = useState<SseStatus>('disconnected');
  const sseAbortRef = useRef<AbortController | null>(null);
  const sseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ordersRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const fetchSignals = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setSignalsLoading(true);
      try {
        const { data } = await api.get<TradeSignalResponse[]>(
          `/trading/bots/${id}/signals`,
        );
        setSignals(data);
      } catch {
        if (!silent) setSignals([]);
      } finally {
        setSignalsLoading(false);
      }
    },
    [id],
  );

  const fetchOrders = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setOrdersLoading(true);
      try {
        const { data } = await api.get<OrderResponse[]>(
          `/trading/bots/${id}/orders`,
        );
        setOrders(data);
      } catch {
        if (!silent) setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    },
    [id],
  );

  const fetchPositions = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setPositionsLoading(true);
      try {
        const { data } = await api.get<PositionResponse[]>(
          `/trading/bots/${id}/positions`,
        );
        setPositions(data);
      } catch {
        if (!silent) setPositions([]);
      } finally {
        setPositionsLoading(false);
      }
    },
    [id],
  );

  const fetchLogs = useCallback(
    async (page = 0, append = false, silent = false) => {
      if (!id) return;
      if (!silent) setLogsLoading(true);
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
        if (!append && !silent) setLogs([]);
        setLogHasMore(false);
      } finally {
        setLogsLoading(false);
      }
    },
    [id],
  );

  const refreshAll = useCallback(
    (silent = false) => {
      fetchBot();
      fetchSignals(silent);
      fetchOrders(silent);
      fetchPositions(silent);
      fetchLogs(0, false, silent);
      setLogPage(0);
      setLastRefresh(new Date());
    },
    [fetchBot, fetchSignals, fetchOrders, fetchPositions, fetchLogs],
  );

  /* ---- SSE Connection ---- */

  function cleanupSse() {
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
      sseAbortRef.current = null;
    }
    if (sseReconnectRef.current) {
      clearTimeout(sseReconnectRef.current);
      sseReconnectRef.current = null;
    }
    if (ordersRefreshTimerRef.current) {
      clearTimeout(ordersRefreshTimerRef.current);
      ordersRefreshTimerRef.current = null;
    }
  }

  const connectSse = useCallback(() => {
    if (!id) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    cleanupSse();

    const abort = new AbortController();
    sseAbortRef.current = abort;
    setSseStatus('connecting');

    const baseUrl = api.defaults.baseURL ?? '/api';
    const url = `${baseUrl}/trading/bots/${id}/stream`;

    (async () => {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: abort.signal,
        });

        if (!response.ok || !response.body) {
          setSseStatus('disconnected');
          scheduleReconnect();
          return;
        }

        setSseStatus('connected');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in buffer
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          let currentData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);
            } else if (line === '' && currentEvent && currentData) {
              // End of event block — dispatch
              handleSseEvent(currentEvent, currentData);
              currentEvent = '';
              currentData = '';
            }
            // heartbeat lines (": heartbeat") are ignored automatically
          }
        }

        // Stream ended — reconnect
        setSseStatus('disconnected');
        scheduleReconnect();
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Intentional disconnect
          return;
        }
        setSseStatus('disconnected');
        scheduleReconnect();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function scheduleReconnect() {
    if (sseReconnectRef.current) {
      clearTimeout(sseReconnectRef.current);
    }
    sseReconnectRef.current = setTimeout(() => {
      connectSse();
    }, 5_000);
  }

  function handleSseEvent(eventType: string, rawData: string) {
    try {
      const data: unknown = JSON.parse(rawData);

      switch (eventType) {
        case 'position_update':
          handlePositionUpdate(data as PositionUpdatePayload);
          break;
        case 'order_update':
        case 'execution':
          debouncedOrdersRefresh();
          break;
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  function handlePositionUpdate(payload: PositionUpdatePayload) {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== payload.position_id) return p;

        if (payload.closed) {
          return {
            ...p,
            status: 'closed' as const,
            unrealized_pnl: 0,
            realized_pnl: payload.realized_pnl
              ? Number(payload.realized_pnl)
              : p.realized_pnl,
            current_price: payload.mark_price
              ? Number(payload.mark_price)
              : p.current_price,
          };
        }

        return {
          ...p,
          unrealized_pnl: Number(payload.unrealized_pnl),
          current_price: payload.mark_price
            ? Number(payload.mark_price)
            : p.current_price,
          quantity: Number(payload.quantity),
          stop_loss: Number(payload.stop_loss),
          take_profit: Number(payload.take_profit),
          trailing_stop: payload.trailing_stop
            ? Number(payload.trailing_stop)
            : p.trailing_stop,
          max_pnl: Number(payload.max_pnl),
          min_pnl: Number(payload.min_pnl),
          max_price: payload.max_price
            ? Number(payload.max_price)
            : p.max_price,
          min_price: payload.min_price
            ? Number(payload.min_price)
            : p.min_price,
        };
      }),
    );
  }

  /** Debounced orders refresh — avoids duplicate fetches when order_update
   *  and execution events arrive in quick succession. */
  function debouncedOrdersRefresh() {
    if (ordersRefreshTimerRef.current) return;
    ordersRefreshTimerRef.current = setTimeout(() => {
      ordersRefreshTimerRef.current = null;
      fetchOrders(true);
    }, 500);
  }

  /* ---- Effects ---- */

  useEffect(() => {
    refreshAll(false);
  }, [refreshAll]);

  // Auto-refresh — reduce interval when SSE is active
  useEffect(() => {
    if (bot?.status === 'running') {
      const interval =
        sseStatus === 'connected'
          ? REFRESH_INTERVAL_SSE_MS
          : REFRESH_INTERVAL_MS;
      refreshTimerRef.current = setInterval(
        () => refreshAll(true),
        interval,
      );
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [bot?.status, sseStatus, refreshAll]);

  // SSE connect/disconnect lifecycle
  useEffect(() => {
    if (bot?.status === 'running') {
      connectSse();
    } else {
      cleanupSse();
      setSseStatus('disconnected');
    }
    return () => cleanupSse();
  }, [bot?.status, connectSse]);

  /* ---- Actions ---- */

  function toggleBot() {
    if (!bot) return;
    const action = bot.status === 'running' ? 'stop' : 'start';
    setToggling(true);
    api
      .post(`/trading/bots/${bot.id}/${action}`)
      .then(() => fetchBot())
      .catch(() => {
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

  const openPosition = useMemo(
    () => positions.find((p) => p.status === 'open') ?? null,
    [positions],
  );

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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-lg" />
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
            <p className="text-xs text-gray-400 mt-1">
              Создан {formatDatetime(bot.created_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* SSE Connection indicator */}
          {bot.status === 'running' && (
            <SseIndicator status={sseStatus} />
          )}
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
            onClick={() => refreshAll(true)}
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

      {/* ---- Stats Grid (6 cards: 3 cols x 2 rows) ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 1. Total P&L */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {Number(bot.total_pnl) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-brand-profit" />
              ) : (
                <TrendingDown className="h-4 w-4 text-brand-loss" />
              )}
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                P&L
              </p>
            </div>
            <p
              className={`text-2xl font-bold font-mono ${
                Number(bot.total_pnl) >= 0
                  ? 'text-brand-profit'
                  : 'text-brand-loss'
              }`}
            >
              {formatPnl(bot.total_pnl)}
            </p>
            <p className="text-[10px] text-gray-600 font-mono mt-1">
              пик: {formatPnl(bot.max_pnl)}
            </p>
          </CardContent>
        </Card>

        {/* 2. Unrealized P&L (from open position) */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Crosshair className="h-4 w-4 text-brand-accent" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Нереализ. P&L
              </p>
            </div>
            {openPosition ? (
              <>
                <p
                  className={`text-2xl font-bold font-mono ${
                    Number(openPosition.unrealized_pnl) >= 0
                      ? 'text-brand-profit'
                      : 'text-brand-loss'
                  }`}
                >
                  {formatPnl(openPosition.unrealized_pnl)}
                </p>
                <p className="text-[10px] text-gray-600 font-mono mt-1">
                  <span className="text-brand-profit/60">
                    max {formatPnl(openPosition.max_pnl)}
                  </span>
                  {' / '}
                  <span className="text-brand-loss/60">
                    min {formatPnl(openPosition.min_pnl)}
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold font-mono text-gray-600">
                  —
                </p>
                <p className="text-[10px] text-gray-600 mt-1">
                  нет открытых позиций
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 3. Win Rate */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-brand-premium" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Win Rate
              </p>
            </div>
            <p className="text-2xl font-bold font-mono text-white">
              {Number(bot.win_rate).toFixed(1)}%
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-premium transition-all duration-500"
                style={{
                  width: `${Math.min(Number(bot.win_rate), 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* 4. Total Trades */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="h-4 w-4 text-brand-accent" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Сделки
              </p>
            </div>
            <p className="text-2xl font-bold font-mono text-white">
              {bot.total_trades}
            </p>
          </CardContent>
        </Card>

        {/* 5. Max Drawdown */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="h-4 w-4 text-brand-loss" />
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Макс. просадка
              </p>
            </div>
            <p className="text-2xl font-bold font-mono text-brand-loss">
              {Number(bot.max_drawdown) !== 0
                ? `-$${Math.abs(Number(bot.max_drawdown)).toFixed(2)}`
                : '$0.00'}
            </p>
          </CardContent>
        </Card>

        {/* 6. Uptime */}
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

      {/* ---- Live Position Card ---- */}
      {openPosition && (
        <LivePositionCard position={openPosition} />
      )}

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
            <div className="space-y-2">
              {positions.map((p) => (
                <PositionExpandableCard key={p.id} position={p} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Logs Tab ---- */}
        <TabsContent value="logs">
          {/* Log filter bar */}
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-gray-400 mr-1">Фильтр:</span>
            {(['all', 'info', 'warn', 'error', 'debug'] as const).map(
              (level) => (
                <button
                  key={level}
                  onClick={() => setLogFilter(level)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                    logFilter === level
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-gray-300'
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
                          className="text-gray-400 hover:text-gray-300 transition-colors shrink-0"
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
                        <pre className="text-[11px] text-gray-400 font-mono bg-black/20 rounded-md p-3 overflow-x-auto max-h-60">
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

/** SSE connection status indicator */
function SseIndicator({ status }: { status: SseStatus }) {
  const config: Record<
    SseStatus,
    { color: string; pulse: boolean; label: string; Icon: typeof Wifi }
  > = {
    connected: {
      color: 'text-brand-profit',
      pulse: false,
      label: 'Live',
      Icon: Wifi,
    },
    connecting: {
      color: 'text-yellow-400',
      pulse: true,
      label: 'Подключение...',
      Icon: Wifi,
    },
    disconnected: {
      color: 'text-gray-600',
      pulse: false,
      label: 'Отключено',
      Icon: WifiOff,
    },
  };

  const c = config[status];
  const IconComponent = c.Icon;

  return (
    <div
      className={`flex items-center gap-1.5 mr-2 ${c.color}`}
      title={c.label}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${
          c.pulse ? 'animate-pulse' : ''
        }`}
      />
      <IconComponent className="h-3.5 w-3.5" />
      <span className="text-[10px] font-medium hidden sm:inline">
        {c.label}
      </span>
    </div>
  );
}

/** Expandable position card — click to see all details */
function PositionExpandableCard({ position: p }: { position: PositionResponse }) {
  const [expanded, setExpanded] = useState(false);
  const isClosed = p.status === 'closed';
  const pnlValue = isClosed ? Number(p.realized_pnl ?? 0) : Number(p.unrealized_pnl ?? 0);
  const pnlColor = pnlValue >= 0 ? 'text-brand-profit' : 'text-brand-loss';
  const duration = p.opened_at && p.closed_at
    ? (() => {
        const ms = new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? `${h}ч ${m}м` : `${m}м`;
      })()
    : null;

  return (
    <Card
      className={`border-white/5 bg-white/[0.02] overflow-hidden cursor-pointer transition-all hover:border-white/10 ${
        expanded ? 'ring-1 ring-brand-premium/20' : ''
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Summary row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge variant={p.side === 'long' ? 'profit' : 'loss'}>
            {p.side === 'long' ? 'LONG' : 'SHORT'}
          </Badge>
          <span className="font-mono text-white font-medium">{p.symbol}</span>
          <span className="text-xs text-gray-400">qty {formatQty(p.original_quantity && Number(p.original_quantity) !== Number(p.quantity) ? p.original_quantity : p.quantity)}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`font-mono font-bold ${pnlColor}`}>{formatPnl(pnlValue)}</span>
          {isClosed ? (
            <Badge variant="default">Закрыта</Badge>
          ) : (
            <Badge variant="profit">Открыта</Badge>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Entry */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Цена входа</p>
              <p className="font-mono text-white">{formatPrice(p.entry_price)}</p>
            </div>
            {/* Exit / Current */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">
                {isClosed ? 'Цена закрытия' : 'Текущая цена'}
              </p>
              <p className="font-mono text-white">
                {p.current_price ? formatPrice(p.current_price) : '—'}
              </p>
            </div>
            {/* SL */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Stop Loss</p>
              <p className="font-mono text-brand-loss">{formatPrice(p.stop_loss)}</p>
            </div>
            {/* TP */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">
                {p.tp1_price ? (p.tp1_hit ? (isClosed ? 'TP2 (исполнен)' : 'TP2 (активен)') : 'TP1') : 'Take Profit'}
              </p>
              <p className="font-mono text-brand-profit">{formatPrice(p.take_profit)}</p>
              {p.tp1_price && (
                <p className={`text-[10px] mt-0.5 ${p.tp1_hit ? 'text-brand-profit/50 line-through' : 'text-gray-400'}`}>
                  TP1: {formatPrice(p.tp1_price)} {p.tp1_hit ? '(исполнен)' : ''}
                </p>
              )}
            </div>
            {/* Trailing */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Trailing Stop</p>
              <p className="font-mono text-white">
                {p.trailing_stop ? formatPrice(p.trailing_stop) : '—'}
              </p>
            </div>
            {/* Qty */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Количество</p>
              <p className="font-mono text-white">{formatQty(p.original_quantity && Number(p.original_quantity) !== Number(p.quantity) ? p.original_quantity : p.quantity)}</p>
              {p.original_quantity && Number(p.original_quantity) !== Number(p.quantity) && (
                <p className="text-[10px] text-gray-400">
                  Остаток: {formatQty(p.quantity)}
                </p>
              )}
            </div>
            {/* Realized PnL */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Реализ. P&L</p>
              <p className={`font-mono font-bold ${(Number(p.realized_pnl ?? 0)) >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                {p.realized_pnl != null && Number(p.realized_pnl) !== 0
                  ? formatPnl(p.realized_pnl)
                  : isClosed ? formatPnl(0) : '—'}
              </p>
              {!isClosed && p.tp1_hit && p.realized_pnl != null && Number(p.realized_pnl) !== 0 && (
                <p className="text-[10px] text-brand-profit/50">от TP1</p>
              )}
            </div>
            {/* Unrealized PnL */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Нереализ. P&L</p>
              <p className={`font-mono ${Number(p.unrealized_pnl) >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                {formatPnl(p.unrealized_pnl)}
              </p>
            </div>
          </div>

          {/* Second row: peaks and times */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/5">
            {/* Max PnL */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Пик P&L</p>
              <p className="font-mono text-brand-profit">{formatPnl(p.max_pnl)}</p>
            </div>
            {/* Min PnL */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Мин P&L</p>
              <p className="font-mono text-brand-loss">{formatPnl(p.min_pnl)}</p>
            </div>
            {/* Max Price */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Макс. цена</p>
              <p className="font-mono text-white">{p.max_price ? formatPrice(p.max_price) : '—'}</p>
            </div>
            {/* Min Price */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Мин. цена</p>
              <p className="font-mono text-white">{p.min_price ? formatPrice(p.min_price) : '—'}</p>
            </div>
            {/* Opened */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Открыта</p>
              <p className="text-xs text-white">{formatDatetime(p.opened_at)}</p>
            </div>
            {/* Closed */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Закрыта</p>
              <p className="text-xs text-white">{p.closed_at ? formatDatetime(p.closed_at) : '—'}</p>
            </div>
            {/* Duration */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">Длительность</p>
              <p className="text-xs text-white font-mono">{duration ?? '—'}</p>
            </div>
            {/* Position ID */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase mb-1">ID</p>
              <p className="text-[10px] text-gray-400 font-mono">{p.id.slice(0, 8)}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Live position card — prominent display of the open position */
function LivePositionCard({ position }: { position: PositionResponse }) {
  const entryPrice = Number(position.entry_price);
  const currentPrice = Number(position.current_price ?? entryPrice);
  const stopLoss = Number(position.stop_loss);
  const rawTp = Number(position.take_profit);
  const tp1Price = position.tp1_price ? Number(position.tp1_price) : null;
  const tp2Price = position.tp2_price ? Number(position.tp2_price) : null;
  // Эффективный TP для бара: если take_profit=0 (Partial mode), используем tp1 или tp2
  const takeProfit = rawTp > 0 ? rawTp
    : position.tp1_hit ? (tp2Price ?? tp1Price ?? entryPrice)
    : (tp1Price ?? tp2Price ?? entryPrice);
  // Какой TP сейчас активен
  const activeTpLabel = !tp1Price ? 'TP'
    : position.tp1_hit ? 'TP2' : 'TP1';
  const unrealizedPnl = Number(position.unrealized_pnl);
  const maxPnl = Number(position.max_pnl);
  const minPnl = Number(position.min_pnl);
  const quantity = Number(position.quantity);
  const originalQty = Number(position.original_quantity ?? position.quantity);
  const trailingStop = position.trailing_stop
    ? Number(position.trailing_stop)
    : null;

  // Change percentage
  const changePct =
    entryPrice !== 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
  // For shorts, invert the percentage for ROI display
  const roiPct = position.side === 'short' ? -changePct : changePct;

  // Visual SL — Entry — TP bar calculation
  // Map the range [SL, TP] to [0%, 100%]
  const rangeTotal = takeProfit - stopLoss;
  const entryPct =
    rangeTotal !== 0
      ? ((entryPrice - stopLoss) / rangeTotal) * 100
      : 50;
  const currentPct =
    rangeTotal !== 0
      ? ((currentPrice - stopLoss) / rangeTotal) * 100
      : 50;
  // TP1 position on bar (if exists and different from TP2)
  const tp1Pct = tp1Price && rangeTotal !== 0
    ? ((tp1Price - stopLoss) / rangeTotal) * 100
    : null;

  // Clamp for visual display
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const entryPctClamped = clamp(entryPct, 2, 98);
  const currentPctClamped = clamp(currentPct, 0, 100);

  const isProfit = unrealizedPnl >= 0;

  return (
    <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
      <CardContent className="p-0">
        {/* Top accent line */}
        <div
          className={`h-0.5 ${
            isProfit ? 'bg-brand-profit' : 'bg-brand-loss'
          }`}
        />

        <div className="p-5 space-y-4">
          {/* Row 1: Symbol + Side + Duration */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-brand-accent" />
              <span className="text-lg font-bold font-mono text-white">
                {position.symbol}
              </span>
              <Badge variant={position.side === 'long' ? 'profit' : 'loss'}>
                {position.side === 'long' ? 'LONG' : 'SHORT'}
              </Badge>
            </div>
            <span className="text-xs text-gray-400">
              Открыта {formatDuration(position.opened_at)}
            </span>
          </div>

          {/* Row 2: Prices */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Вход
              </p>
              <p className="text-sm font-mono text-white font-medium">
                {formatPrice(entryPrice)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Текущая
              </p>
              <p
                className={`text-sm font-mono font-medium ${
                  isProfit ? 'text-brand-profit' : 'text-brand-loss'
                }`}
              >
                {formatPrice(currentPrice)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Изменение
              </p>
              <p
                className={`text-sm font-mono font-medium ${
                  isProfit ? 'text-brand-profit' : 'text-brand-loss'
                }`}
              >
                {formatPct(changePct)}
              </p>
            </div>
          </div>

          {/* Row 3: SL — Entry — TP visual bar */}
          <div className="space-y-2">
            <div className="relative h-8 rounded-md bg-white/[0.03] border border-white/5 overflow-hidden">
              {/* Loss zone (SL to Entry) */}
              <div
                className="absolute top-0 bottom-0 bg-brand-loss/8 border-r border-brand-loss/20"
                style={{
                  left: '0%',
                  width: `${entryPctClamped}%`,
                }}
              />
              {/* Profit zone (Entry to TP) */}
              <div
                className="absolute top-0 bottom-0 bg-brand-profit/8"
                style={{
                  left: `${entryPctClamped}%`,
                  width: `${100 - entryPctClamped}%`,
                }}
              />

              {/* Current price marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 z-10 transition-all duration-300"
                style={{
                  left: `${currentPctClamped}%`,
                  backgroundColor: isProfit ? '#00E676' : '#FF1744',
                }}
              >
                <div
                  className={`absolute -top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${
                    isProfit ? 'bg-brand-profit' : 'bg-brand-loss'
                  }`}
                />
              </div>

              {/* Entry marker */}
              <div
                className="absolute top-0 bottom-0 w-px bg-white/30 z-[5]"
                style={{ left: `${entryPctClamped}%` }}
              />

              {/* TP1 marker on bar (if TP1 exists and is between SL and TP2) */}
              {tp1Pct != null && position.tp1_hit && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-brand-profit/30 z-[3]"
                  style={{ left: `${clamp(tp1Pct, 1, 99)}%` }}
                >
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[7px] font-mono text-brand-profit/40">
                    TP1
                  </span>
                </div>
              )}

              {/* Labels on the bar */}
              <div className="absolute inset-0 flex items-center justify-between px-3">
                <span className="text-[9px] font-mono text-brand-loss/70 z-[1]">
                  SL {formatPrice(stopLoss)}
                </span>
                <span className="text-[9px] font-mono text-white/40 z-[1]">
                  {formatPrice(entryPrice)}
                </span>
                <span className="text-[9px] font-mono text-brand-profit/70 z-[1]">
                  {activeTpLabel} {formatPrice(takeProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Row 4: P&L details + position info */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Нереализ. P&L
              </p>
              <p
                className={`text-sm font-mono font-bold ${
                  isProfit ? 'text-brand-profit' : 'text-brand-loss'
                }`}
              >
                {formatPnl(unrealizedPnl)}
              </p>
              <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                <span className="text-brand-profit/50">
                  пик {formatPnl(maxPnl)}
                </span>
                {' / '}
                <span className="text-brand-loss/50">
                  дно {formatPnl(minPnl)}
                </span>
              </p>
            </div>
            {position.realized_pnl != null && Number(position.realized_pnl) !== 0 && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                  Реализ. P&L
                </p>
                <p
                  className={`text-sm font-mono font-bold ${
                    Number(position.realized_pnl) >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                  }`}
                >
                  {formatPnl(position.realized_pnl)}
                </p>
                {position.tp1_hit && (
                  <p className="text-[10px] text-brand-profit/50 mt-0.5">TP1 исполнен</p>
                )}
              </div>
            )}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Размер
              </p>
              <p className="text-sm font-mono text-white">
                {formatQty(quantity)}
                {originalQty !== quantity && (
                  <span className="text-gray-400">
                    {' / '}
                    {formatQty(originalQty)}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Trail
              </p>
              <p className="text-sm font-mono text-white">
                {trailingStop !== null ? formatPrice(trailingStop) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                ROI
              </p>
              <p
                className={`text-sm font-mono font-bold ${
                  roiPct >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                }`}
              >
                {formatPct(roiPct)}
              </p>
            </div>
          </div>

          {/* Row 5: TP levels (if multi-TP) */}
          {tp1Price && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                  TP1 {position.tp1_hit ? '(исполнен)' : '(активен)'}
                </p>
                <p className={`text-sm font-mono ${position.tp1_hit ? 'text-brand-profit/50 line-through' : 'text-brand-accent'}`}>
                  {formatPrice(tp1Price)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                  TP2 {position.tp1_hit ? '(активен)' : '(следующий)'}
                </p>
                <p className={`text-sm font-mono ${position.tp1_hit ? 'text-brand-accent' : 'text-gray-400'}`}>
                  {tp2Price ? formatPrice(tp2Price) : '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

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
        <p className="text-gray-400 text-sm">{message}</p>
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
