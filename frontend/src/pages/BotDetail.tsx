import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Play,
  Square,
  TrendingUp,
  TrendingDown,
  Activity,
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
  Wifi,
  WifiOff,
  Target,
  LineChart,
  Shield,
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
import {
  createChart,
  AreaSeries,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import type {
  IChartApi,
  Time,
} from 'lightweight-charts';
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

const REFRESH_INTERVAL_MS = 10_000;
const REFRESH_INTERVAL_SSE_MS = 30_000;

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
        // Refresh data immediately on (re)connect
        refreshAll(true);

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

  const lastClosedPosition = useMemo(
    () => {
      const closed = positions
        .filter((p) => p.status === 'closed')
        .sort((a, b) => new Date(b.closed_at ?? 0).getTime() - new Date(a.closed_at ?? 0).getTime());
      return closed[0] ?? null;
    },
    [positions],
  );

  // Extract leverage from strategy config
  const leverage = useMemo(() => {
    if (!config?.config) return null;
    const live = (config.config as Record<string, unknown>).live as Record<string, unknown> | undefined;
    const bt = (config.config as Record<string, unknown>).backtest as Record<string, unknown> | undefined;
    const lev = live?.leverage ?? bt?.leverage;
    return typeof lev === 'number' ? lev : null;
  }, [config]);

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

      {/* ---- Stats Strip ---- */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="px-5 py-3">
          <div className="flex items-center justify-between gap-6">
            {/* P&L */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${Number(bot.total_pnl) >= 0 ? 'bg-brand-profit' : 'bg-brand-loss'} animate-pulse`} />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">P&L</span>
              </div>
              <span className={`text-lg font-bold font-mono ${Number(bot.total_pnl) >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                {formatPnl(bot.total_pnl)}
              </span>
              <span className="text-[10px] font-mono text-gray-600">| пик: {formatPnl(bot.max_pnl)}</span>
            </div>

            <div className="w-px h-8 bg-white/5" />

            {/* Unrealized P&L */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Unrealized</span>
              </div>
              {openPosition ? (
                <>
                  <span className={`text-lg font-bold font-mono ${Number(openPosition.unrealized_pnl) >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                    {formatPnl(openPosition.unrealized_pnl)}
                  </span>
                  <div className="flex gap-2 text-[10px] font-mono">
                    <span className="text-brand-profit/50">{formatPnl(openPosition.max_pnl)}</span>
                    <span className="text-brand-loss/50">{formatPnl(openPosition.min_pnl)}</span>
                  </div>
                </>
              ) : (
                <span className="text-lg font-bold font-mono text-gray-600">--</span>
              )}
            </div>

            <div className="w-px h-8 bg-white/5" />

            {/* Win Rate + mini bar */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-white">
                  {Number(bot.win_rate).toFixed(1)}%
                </span>
                <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-premium transition-all duration-500"
                    style={{ width: `${Math.min(Number(bot.win_rate), 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="w-px h-8 bg-white/5" />

            {/* Trades */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Trades</span>
              <span className="text-lg font-bold font-mono text-white">{bot.total_trades}</span>
            </div>

            <div className="w-px h-8 bg-white/5" />

            {/* Drawdown */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">DD</span>
              <span className="text-lg font-bold font-mono text-brand-loss">
                {Number(bot.max_drawdown) !== 0
                  ? `-$${Math.abs(Number(bot.max_drawdown)).toFixed(2)}`
                  : '$0.00'}
              </span>
            </div>

            <div className="w-px h-8 bg-white/5" />

            {/* Uptime */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Uptime</span>
              <span className="text-lg font-bold font-mono text-white">
                {bot.status === 'running' ? formatUptime(bot.started_at) : 'Stopped'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Risk/Reward Card ---- */}
      <RiskRewardCard
        openPosition={openPosition}
        lastClosedPosition={lastClosedPosition}
      />

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
          <TabsTrigger value="equity">
            <LineChart className="mr-1.5 h-3.5 w-3.5" />
            Equity
          </TabsTrigger>
          <TabsTrigger value="logs">Логи</TabsTrigger>
        </TabsList>

        {/* ---- Signals Tab ---- */}
        <TabsContent value="signals">
          {signalsLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : signals.length === 0 ? (
            <EmptyState message="Нет сигналов" />
          ) : (
            <SignalsList signals={signals} />
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
                <PositionExpandableCard key={p.id} position={p} leverage={leverage} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Equity Curve Tab ---- */}
        <TabsContent value="equity">
          <EquityCurveTab positions={positions} loading={positionsLoading} />
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

type SignalFilter = 'all' | 'long' | 'short';

function SignalsList({ signals }: { signals: TradeSignalResponse[] }) {
  const [filter, setFilter] = useState<SignalFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return signals;
    return signals.filter((s) => s.direction === filter);
  }, [signals, filter]);

  const longCount = signals.filter((s) => s.direction === 'long').length;
  const shortCount = signals.filter((s) => s.direction === 'short').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
              filter === 'all'
                ? 'bg-white/[0.05] text-white border-white/[0.08]'
                : 'bg-transparent text-gray-500 border-transparent hover:border-white/[0.05]'
            }`}
          >
            Все ({signals.length})
          </button>
          <button
            onClick={() => setFilter('short')}
            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
              filter === 'short'
                ? 'bg-brand-loss/[0.06] text-brand-loss border-brand-loss/15'
                : 'bg-transparent text-gray-500 border-transparent hover:border-brand-loss/10'
            }`}
          >
            SHORT ({shortCount})
          </button>
          <button
            onClick={() => setFilter('long')}
            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
              filter === 'long'
                ? 'bg-brand-profit/[0.06] text-brand-profit border-brand-profit/15'
                : 'bg-transparent text-gray-500 border-transparent hover:border-brand-profit/10'
            }`}
          >
            LONG ({longCount})
          </button>
        </div>
        <span className="text-[9px] text-gray-600">
          Исполнено: <span className="text-brand-premium font-mono">{signals.filter((s) => s.was_executed).length}/{signals.length}</span>
        </span>
      </div>
      <div className="space-y-1">
        {filtered.map((s) => (
          <SignalCard key={s.id} signal={s} />
        ))}
      </div>
    </div>
  );
}

function SignalCard({ signal: s }: { signal: TradeSignalResponse }) {
  const [expanded, setExpanded] = useState(false);
  const snap = s.indicators_snapshot as Record<string, unknown>;

  const entry = Number(snap.entry_price ?? 0);
  const sl = Number(snap.stop_loss ?? 0);
  const tp = Number(snap.take_profit ?? 0);
  const rrRatio = Math.abs(sl - entry) > 0
    ? Math.abs(tp - entry) / Math.abs(sl - entry)
    : 0;

  // SL/TP percentages from entry
  const slPct = entry > 0 ? ((sl - entry) / entry) * 100 : 0;
  const tpPct = entry > 0 ? ((tp - entry) / entry) * 100 : 0;

  const knnColor = s.knn_class === 'BULL' ? 'text-blue-400' : s.knn_class === 'BEAR' ? 'text-brand-loss' : 'text-gray-500';

  const Pill = ({ label, value, state }: { label: string; value: string; state: 'bull' | 'bear' | 'neutral' }) => {
    const colors = {
      bull: 'bg-brand-profit/[0.06] border-brand-profit/10',
      bear: 'bg-brand-loss/[0.06] border-brand-loss/10',
      neutral: 'bg-white/[0.03] border-white/[0.06]',
    };
    const dotColor = { bull: 'bg-brand-profit', bear: 'bg-brand-loss', neutral: 'bg-gray-500' };
    const textColor = { bull: 'text-brand-profit', bear: 'text-brand-loss', neutral: 'text-white/60' };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded border text-[10px] ${colors[state]}`}>
        <span className={`w-[5px] h-[5px] rounded-full ${dotColor[state]}`} />
        <span className="text-white/50">{label}</span>
        <span className={`font-mono ${textColor[state]}`}>{value}</span>
      </span>
    );
  };

  const emaTrend = snap.ema_trend as string | undefined;
  const ribbon = snap.ribbon as string | undefined;
  const adx = snap.adx as number | undefined;
  const rsiVal = snap.rsi as number | undefined;
  const volSpike = snap.volume_spike as boolean | undefined;
  const volRatio = snap.volume_ratio as number | undefined;
  const bbPos = snap.bb_position as string | undefined;
  const vwapPos = snap.vwap_position as string | undefined;
  const cvd = snap.cvd as string | undefined;
  const smc = snap.smc as string | undefined;
  const atrVal = snap.atr as number | undefined;
  const signalType = snap.signal_type as string | undefined;
  const hasIndicators = emaTrend != null || adx != null;

  return (
    <div
      className={`flex overflow-hidden rounded-md cursor-pointer transition-all hover:bg-white/[0.015] ${expanded ? 'ring-1 ring-brand-premium/20' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className={`w-[3px] shrink-0 ${s.direction === 'long' ? 'bg-brand-profit' : 'bg-brand-loss'}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between px-3 py-2.5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className={`font-bold text-xs min-w-[42px] ${s.direction === 'long' ? 'text-brand-profit' : 'text-brand-loss'}`}>
              {s.direction === 'long' ? 'LONG' : 'SHORT'}
            </span>
            <span className={`font-mono text-xs ${knnColor}`}>
              {s.knn_class} <span className="text-white/25">{Number(s.knn_confidence).toFixed(1)}%</span>
            </span>
            {entry > 0 && (
              <>
                <div className="w-px h-4 bg-white/5" />
                <span className="text-white/30 font-mono text-[11px]">{formatPrice(entry)}</span>
              </>
            )}
            {rrRatio > 0 && (
              <span className="text-brand-premium font-mono text-[11px] font-semibold">R/R 1:{rrRatio.toFixed(1)}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {s.was_executed ? (
              <span className="text-brand-profit text-[10px]">&#10003;</span>
            ) : (
              <span className="text-gray-600 text-[10px]">-</span>
            )}
            <span className="text-gray-500 text-[11px]">{formatDatetime(s.created_at)}</span>
            <ChevronDown className={`h-4 w-4 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {expanded && (
          <div className="px-3 py-2.5 border-t border-white/5">
            {entry > 0 && (
              <div className="flex gap-[2px] mb-2.5">
                <div className="flex-1 px-2.5 py-2 bg-white/[0.02] rounded-l-md">
                  <p className="text-[8px] text-gray-600 uppercase">Entry</p>
                  <p className="font-mono text-white text-sm font-semibold">{formatPrice(entry)}</p>
                </div>
                <div className="flex-1 px-2.5 py-2 bg-brand-loss/[0.03]">
                  <p className="text-[8px] text-gray-600 uppercase">SL</p>
                  <p className="font-mono text-brand-loss text-sm font-semibold">{formatPrice(sl)}</p>
                  <p className="font-mono text-brand-loss/40 text-[9px]">{slPct >= 0 ? '+' : ''}{slPct.toFixed(2)}%</p>
                </div>
                <div className="flex-1 px-2.5 py-2 bg-brand-profit/[0.03]">
                  <p className="text-[8px] text-gray-600 uppercase">TP</p>
                  <p className="font-mono text-brand-profit text-sm font-semibold">{formatPrice(tp)}</p>
                  <p className="font-mono text-brand-profit/40 text-[9px]">{tpPct >= 0 ? '+' : ''}{tpPct.toFixed(2)}%</p>
                </div>
                <div className="flex-1 px-2.5 py-2 bg-brand-premium/[0.02] rounded-r-md">
                  <p className="text-[8px] text-gray-600 uppercase">R/R</p>
                  <p className="font-mono text-brand-premium text-sm font-semibold">1:{rrRatio.toFixed(1)}</p>
                </div>
              </div>
            )}

            {hasIndicators && (
              <div className="space-y-2">
                <div>
                  <p className="text-[8px] text-gray-700 uppercase tracking-wider mb-1">Тренд</p>
                  <div className="flex flex-wrap gap-1">
                    {emaTrend != null && <Pill label="EMA" value={emaTrend === 'bull' ? '↑' : '↓'} state={emaTrend === 'bull' ? 'bull' : 'bear'} />}
                    {ribbon != null && <Pill label="Ribbon" value={ribbon === 'bull' ? 'BULL' : 'BEAR'} state={ribbon === 'bull' ? 'bull' : 'bear'} />}
                    {adx != null && <Pill label="ADX" value={String(adx)} state={adx > 20 ? 'bull' : 'neutral'} />}
                  </div>
                </div>
                <div>
                  <p className="text-[8px] text-gray-700 uppercase tracking-wider mb-1">Осцилляторы</p>
                  <div className="flex flex-wrap gap-1">
                    {rsiVal != null && <Pill label="RSI" value={String(rsiVal)} state={rsiVal < 30 ? 'bull' : rsiVal > 70 ? 'bear' : 'neutral'} />}
                    {volSpike != null && <Pill label="Vol" value={volSpike ? `↑${volRatio != null ? ` ${volRatio}x` : ''}` : '-'} state={volSpike ? 'bull' : 'neutral'} />}
                    {bbPos != null && <Pill label="BB" value={bbPos} state={bbPos === 'lower' ? 'bull' : bbPos === 'upper' ? 'bear' : 'neutral'} />}
                  </div>
                </div>
                {(vwapPos != null || cvd != null || smc != null) && (
                  <div>
                    <p className="text-[8px] text-gray-700 uppercase tracking-wider mb-1">Order Flow</p>
                    <div className="flex flex-wrap gap-1">
                      {vwapPos != null && <Pill label="VWAP" value={vwapPos === 'above' ? '↑' : '↓'} state={vwapPos === 'above' ? 'bull' : 'bear'} />}
                      {cvd != null && <Pill label="CVD" value={cvd} state={cvd === 'bull' ? 'bull' : 'bear'} />}
                      {smc != null && <Pill label="SMC" value={smc} state={smc === 'bull' ? 'bull' : 'bear'} />}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2.5 mt-2 pt-1.5 border-t border-white/[0.03] text-[9px] text-gray-600">
              <span>KNN: <span className={knnColor}>{s.knn_class} {Number(s.knn_confidence).toFixed(1)}%</span></span>
              <span className="text-white/5">|</span>
              <span>Confluence: <span className="text-white font-mono">{Number(s.signal_strength).toFixed(2)}</span><span className="text-gray-700">/6</span></span>
              {signalType && (
                <>
                  <span className="text-white/5">|</span>
                  <span>Тип: <span className="text-white/40">{signalType}</span></span>
                </>
              )}
              {atrVal != null && (
                <>
                  <span className="text-white/5">|</span>
                  <span>ATR: <span className="text-white/40 font-mono">{atrVal.toFixed(4)}</span></span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Expandable position card — click to see all details */
function PositionExpandableCard({ position: p, leverage }: { position: PositionResponse; leverage: number | null }) {
  const [expanded, setExpanded] = useState(false);
  const isClosed = p.status === 'closed';
  const pnlValue = isClosed ? Number(p.realized_pnl ?? 0) : Number(p.unrealized_pnl ?? 0);
  const pnlColor = pnlValue >= 0 ? 'text-brand-profit' : 'text-brand-loss';
  const entryPrice = Number(p.entry_price);
  const currentPrice = Number(p.current_price ?? entryPrice);
  const qty = Number(p.original_quantity && Number(p.original_quantity) !== Number(p.quantity) ? p.original_quantity : p.quantity);
  const entryAmount = entryPrice * qty;

  // Change percentage
  const changePct = entryPrice !== 0
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : 0;
  const roiPct = p.side === 'short' ? -changePct : changePct;

  // Duration
  const durationText = (() => {
    const start = new Date(p.opened_at).getTime();
    const end = p.closed_at ? new Date(p.closed_at).getTime() : Date.now();
    const ms = end - start;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}ч ${m}м` : `${m}м`;
  })();

  return (
    <Card
      className={`overflow-hidden cursor-pointer transition-all hover:border-white/10 ${
        isClosed
          ? 'border-white/[0.04] bg-white/[0.01]'
          : 'border-brand-profit/[0.08] bg-white/[0.02]'
      } ${expanded ? 'ring-1 ring-brand-premium/20' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Top accent for open positions */}
      {!isClosed && (
        <div className="h-[2px] bg-gradient-to-r from-brand-profit to-transparent" />
      )}

      {/* Summary row */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Badge variant={p.side === 'long' ? 'profit' : 'loss'}
            className={isClosed ? 'opacity-60' : ''}>
            {p.side === 'long' ? 'LONG' : 'SHORT'}
          </Badge>
          <span className={`font-mono font-semibold ${isClosed ? 'text-white/60' : 'text-white'}`}>
            {p.symbol}
          </span>
          <span className={`text-[10px] font-mono ${isClosed ? 'text-gray-600' : 'text-gray-500'}`}>
            {formatQty(qty)}
          </span>
          <div className="w-px h-4 bg-white/5" />
          <span className={`text-[10px] font-mono ${isClosed ? 'text-white/[0.12]' : 'text-white/[0.25]'}`}>
            {formatPrice(entryPrice)} &rarr; {formatPrice(currentPrice)}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <span className={`font-mono font-bold text-[15px] ${pnlColor}`}>
              {formatPnl(pnlValue)}
            </span>
            <span className={`text-[9px] font-mono ml-1.5 ${roiPct >= 0 ? 'text-brand-profit/40' : 'text-brand-loss/40'}`}>
              {formatPct(roiPct)}
            </span>
          </div>
          <div className="w-px h-6 bg-white/5" />
          {!isClosed ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-profit/[0.06] rounded">
              <div className="w-[5px] h-[5px] rounded-full bg-brand-profit shadow-[0_0_4px_rgba(0,230,118,0.4)] animate-pulse" />
              <span className="text-brand-profit text-[10px]">{durationText}</span>
            </div>
          ) : (
            <span className="text-gray-600 text-[10px]">{durationText}</span>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-3">
          {/* Prices row */}
          <div className="flex gap-[2px] mb-3">
            <div className="flex-1 px-2.5 py-2 bg-white/[0.02] rounded-l-md">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">Вход</p>
              <p className="font-mono text-white text-sm font-semibold">{formatPrice(entryPrice)}</p>
            </div>
            <div className="flex-1 px-2.5 py-2 bg-white/[0.02]">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">{isClosed ? 'Выход' : 'Текущая'}</p>
              <p className={`font-mono text-sm font-semibold ${pnlValue >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                {formatPrice(currentPrice)}
              </p>
            </div>
            <div className="flex-1 px-2.5 py-2 bg-brand-loss/[0.03]">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">SL</p>
              <p className="font-mono text-brand-loss text-sm font-semibold">{formatPrice(p.stop_loss)}</p>
            </div>
            <div className="flex-1 px-2.5 py-2 bg-brand-profit/[0.03]">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">
                {p.tp1_price ? (p.tp1_hit ? 'TP2' : 'TP1') : 'TP'}
              </p>
              <p className="font-mono text-brand-profit text-sm font-semibold">{formatPrice(p.take_profit)}</p>
              {p.tp1_price && p.tp1_hit && (
                <p className="text-[8px] text-brand-profit/40 line-through">TP1: {formatPrice(p.tp1_price)}</p>
              )}
            </div>
            {leverage != null && (
              <div className="px-2.5 py-2 bg-brand-premium/[0.03] min-w-[56px]">
                <p className="text-[8px] text-gray-600 uppercase tracking-wider">Плечо</p>
                <p className="font-mono text-brand-premium text-sm font-bold">{leverage}x</p>
              </div>
            )}
            <div className="px-2.5 py-2 bg-white/[0.02] rounded-r-md min-w-[72px]">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">Сумма</p>
              <p className="font-mono text-white/70 text-sm font-semibold">${entryAmount.toFixed(2)}</p>
            </div>
          </div>

          {/* P&L row */}
          <div className="flex gap-[2px] mb-3">
            <div className="flex-1 px-2.5 py-2 bg-white/[0.02] rounded-l-md">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">Нереализ.</p>
              <p className={`font-mono text-sm font-bold ${Number(p.unrealized_pnl) >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                {isClosed ? '—' : formatPnl(p.unrealized_pnl)}
              </p>
            </div>
            <div className="flex-1 px-2.5 py-2 bg-white/[0.02]">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">Реализ.</p>
              <p className={`font-mono text-sm font-bold ${(Number(p.realized_pnl ?? 0)) >= 0 ? 'text-brand-profit' : 'text-brand-loss'}`}>
                {p.realized_pnl != null && Number(p.realized_pnl) !== 0
                  ? formatPnl(p.realized_pnl)
                  : isClosed ? formatPnl(0) : '—'}
              </p>
              {!isClosed && p.tp1_hit && p.realized_pnl != null && Number(p.realized_pnl) !== 0 && (
                <p className="text-[8px] text-brand-profit/40">от TP1</p>
              )}
            </div>
            <div className="flex-1 px-2.5 py-2 bg-brand-profit/[0.02]">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">Пик</p>
              <p className="font-mono text-brand-profit text-sm">{formatPnl(p.max_pnl)}</p>
            </div>
            <div className="flex-1 px-2.5 py-2 bg-brand-loss/[0.02] rounded-r-md">
              <p className="text-[8px] text-gray-600 uppercase tracking-wider">Мин</p>
              <p className="font-mono text-brand-loss text-sm">{formatPnl(p.min_pnl)}</p>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[10px] text-gray-600">
            {p.original_quantity && Number(p.original_quantity) !== Number(p.quantity) && (
              <>
                <span>Остаток: <span className="text-white/40 font-mono">{formatQty(p.quantity)}</span></span>
                <span className="text-white/5">|</span>
              </>
            )}
            {p.trailing_stop && (
              <>
                <span>Trail: <span className="text-white/40 font-mono">{formatPrice(p.trailing_stop)}</span></span>
                <span className="text-white/5">|</span>
              </>
            )}
            <span>Макс: <span className="text-white/40 font-mono">{p.max_price ? formatPrice(p.max_price) : '—'}</span></span>
            <span className="text-white/5">|</span>
            <span>Мин: <span className="text-white/40 font-mono">{p.min_price ? formatPrice(p.min_price) : '—'}</span></span>
            <span className="text-white/5">|</span>
            <span>Открыта: <span className="text-white/40">{formatDatetime(p.opened_at)}</span></span>
            {p.closed_at && (
              <>
                <span className="text-white/5">|</span>
                <span>Закрыта: <span className="text-white/40">{formatDatetime(p.closed_at)}</span></span>
              </>
            )}
            <span className="text-white/5">|</span>
            <span className="text-gray-700 font-mono">{p.id.slice(0, 8)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Sine wave fill for SL-TP bar */
function SineWaveFill({ fillLeft, fillWidth, isProfit }: { fillLeft: number; fillWidth: number; isProfit: boolean }) {
  const color = isProfit ? '#00E676' : '#FF1744';
  if (fillWidth < 0.5) return null;

  return (
    <div
      className="absolute inset-y-0 overflow-hidden z-[2]"
      style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
    >
      {/* Base fill */}
      <div className="absolute inset-0" style={{ background: `${color}10` }} />
      {/* Wave layer 1 */}
      <svg
        className="absolute bottom-0 h-full animate-[wave-move_6s_linear_infinite]"
        style={{ width: '200%', opacity: 0.15 }}
        viewBox="0 0 1200 36"
        preserveAspectRatio="none"
      >
        <path
          d="M0,20 C100,10 200,30 300,20 C400,10 500,30 600,20 C700,10 800,30 900,20 C1000,10 1100,30 1200,20 L1200,36 L0,36 Z"
          fill={color}
        />
      </svg>
      {/* Wave layer 2 (slower, offset) */}
      <svg
        className="absolute bottom-0 h-full animate-[wave-move_8s_linear_infinite]"
        style={{ width: '200%', opacity: 0.08, animationDelay: '-2s' }}
        viewBox="0 0 1200 36"
        preserveAspectRatio="none"
      >
        <path
          d="M0,24 C150,14 250,34 400,24 C550,14 650,34 800,24 C950,14 1050,34 1200,24 L1200,36 L0,36 Z"
          fill={color}
        />
      </svg>
    </div>
  );
}

/** Risk/Reward card - shows R/R ratio, multi-TP targets and visual bar */
function RiskRewardCard({
  openPosition,
  lastClosedPosition,
}: {
  openPosition: PositionResponse | null;
  lastClosedPosition: PositionResponse | null;
}) {
  const position = openPosition ?? lastClosedPosition;
  if (!position) return null;

  const isLastClosed = !openPosition && !!lastClosedPosition;

  const entryPrice = Number(position.entry_price);
  const stopLoss = Number(position.stop_loss);
  const quantity = Number(position.quantity);
  const side = position.side;

  const tp1Price = position.tp1_price != null ? Number(position.tp1_price) : null;
  const tp2Price = position.tp2_price != null ? Number(position.tp2_price) : null;
  const tp1Hit = position.tp1_hit;

  // Single TP fallback
  const singleTp = Number(position.take_profit);

  // Determine active TP for R/R ratio
  const hasMultiTp = tp1Price != null;
  const activeTpPrice = hasMultiTp
    ? (tp1Hit ? (tp2Price ?? tp1Price!) : tp1Price!)
    : singleTp;

  // Calculate dollar amounts based on side
  const riskPerUnit = side === 'long'
    ? entryPrice - stopLoss
    : stopLoss - entryPrice;
  const rewardTp2PerUnit = tp2Price != null
    ? (side === 'long' ? tp2Price - entryPrice : entryPrice - tp2Price)
    : null;
  const rewardActivePerUnit = side === 'long'
    ? activeTpPrice - entryPrice
    : entryPrice - activeTpPrice;

  const risk = Math.abs(riskPerUnit * quantity);
  const rewardTp2 = rewardTp2PerUnit != null ? Math.abs(rewardTp2PerUnit * quantity) : null;
  const rewardActive = Math.abs(rewardActivePerUnit * quantity);

  // Guard: if SL or TP are not set properly, don't show the card
  if (risk <= 0 || rewardActive <= 0) return null;

  const rrRatio = rewardActive / risk;

  // Active TP label and price for display
  const activeTpLabel = hasMultiTp
    ? (tp1Hit ? 'TP2' : 'TP1')
    : 'TP';
  const activeTpDisplayPrice = hasMultiTp
    ? (tp1Hit ? tp2Price ?? tp1Price! : tp1Price!)
    : singleTp;

  return (
    <Card className="border-brand-premium/[0.06] bg-white/[0.02]">
      <CardContent className="px-5 py-3">
        <div className="flex items-center gap-4">
          {/* R/R Badge */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand-premium/15 to-brand-premium/5 flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-brand-premium" />
            </div>
            <div>
              <div className="text-[8px] text-gray-500 uppercase tracking-wider">R/R Ratio</div>
              <div className="text-lg font-bold font-mono text-brand-premium leading-tight">1:{rrRatio.toFixed(1)}</div>
            </div>
          </div>

          <div className="w-px h-8 bg-white/5" />

          {/* Reward */}
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-6 rounded-full bg-brand-profit" />
            <div>
              <div className="text-[8px] text-gray-500 uppercase">Цель</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold font-mono text-brand-profit">+${rewardActive.toFixed(2)}</span>
                <span className="text-[9px] font-mono text-brand-profit/30">{activeTpLabel} {formatPrice(activeTpDisplayPrice)}</span>
              </div>
            </div>
          </div>

          {/* TP2 hint when TP1 active */}
          {hasMultiTp && !tp1Hit && tp2Price != null && rewardTp2 != null && (
            <>
              <div className="w-px h-8 bg-white/5" />
              <div className="flex items-center gap-2">
                <div className="w-[3px] h-6 rounded-full bg-brand-profit/30" />
                <div>
                  <div className="text-[8px] text-gray-500 uppercase">TP2</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold font-mono text-gray-500">+${rewardTp2.toFixed(2)}</span>
                    <span className="text-[9px] font-mono text-white/15">{formatPrice(tp2Price)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="w-px h-8 bg-white/5" />

          {/* Risk */}
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-6 rounded-full bg-brand-loss" />
            <div>
              <div className="text-[8px] text-gray-500 uppercase">Риск</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold font-mono text-brand-loss">-${risk.toFixed(2)}</span>
                <span className="text-[9px] font-mono text-brand-loss/30">SL {formatPrice(stopLoss)}</span>
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* Summary + badge */}
          <div className="text-right">
            {isLastClosed && (
              <div className="text-[8px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded inline-block mb-0.5">
                Последняя сделка
              </div>
            )}
            <div className="text-[9px] text-gray-600">$1 риска = ${rrRatio.toFixed(2)} прибыли</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Live position card — prominent display of the open position */
function LivePositionCard({ position }: { position: PositionResponse }) {
  const entryPrice = Number(position.entry_price);
  const currentPrice = Number(position.current_price ?? entryPrice);
  const stopLoss = Number(position.stop_loss);
  const rawTp = Number(position.take_profit);
  const tp1Price = position.tp1_price != null ? Number(position.tp1_price) : null;
  const tp2Price = position.tp2_price != null ? Number(position.tp2_price) : null;
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
        {/* Top accent */}
        <div className={`h-[2px] ${isProfit ? 'bg-gradient-to-r from-brand-profit via-brand-profit/60 to-transparent' : 'bg-gradient-to-r from-brand-loss via-brand-loss/60 to-transparent'}`} />

        <div className="px-5 py-3">
          {/* Row 1: Header strip */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Target className="h-4 w-4 text-brand-accent" />
              <span className="text-base font-bold font-mono text-white">{position.symbol}</span>
              <Badge variant={position.side === 'long' ? 'profit' : 'loss'}>
                {position.side === 'long' ? 'LONG' : 'SHORT'}
              </Badge>
              <span className="text-[10px] font-mono text-gray-500">qty {formatQty(quantity)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-2xl font-bold font-mono ${isProfit ? 'text-brand-profit' : 'text-brand-loss'}`}>
                {formatPnl(unrealizedPnl)}
              </span>
              <span className={`text-xs font-mono ${roiPct >= 0 ? 'text-brand-profit/70' : 'text-brand-loss/70'}`}>
                {formatPct(roiPct)}
              </span>
              <span className="text-[10px] text-gray-500">{formatDuration(position.opened_at)}</span>
            </div>
          </div>

          {/* Row 2: Price metrics strip */}
          <div className="flex items-center gap-6 text-xs mb-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider">Вход</span>
              <span className="font-mono text-white">{formatPrice(entryPrice)}</span>
            </div>
            <div className="w-px h-4 bg-white/5" />
            <div className="flex items-center gap-2">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider">Тек.</span>
              <span className={`font-mono ${isProfit ? 'text-brand-profit' : 'text-brand-loss'}`}>{formatPrice(currentPrice)}</span>
            </div>
            <div className="w-px h-4 bg-white/5" />
            <div className="flex items-center gap-2">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider">SL</span>
              <span className="font-mono text-brand-loss/70">{formatPrice(stopLoss)}</span>
            </div>
            <div className="w-px h-4 bg-white/5" />
            <div className="flex items-center gap-2">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider">{activeTpLabel}</span>
              <span className="font-mono text-brand-profit/70">{formatPrice(takeProfit)}</span>
            </div>
            <div className="w-px h-4 bg-white/5" />
            <div className="flex items-center gap-2">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider">Trail</span>
              <span className="font-mono text-white/60">{trailingStop !== null ? formatPrice(trailingStop) : '--'}</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-brand-profit/40">max {formatPnl(maxPnl)}</span>
              <span className="text-gray-700">/</span>
              <span className="text-brand-loss/40">min {formatPnl(minPnl)}</span>
            </div>
          </div>

          {/* Row 3: SL-TP Bar with sine wave */}
          <div className="space-y-2">
            <div className="relative h-9 rounded-md bg-[#080812] border border-white/[0.04] overflow-hidden">
              {/* Loss zone (SL to Entry) */}
              <div
                className="absolute top-0 bottom-0 bg-brand-loss/[0.06]"
                style={{ left: '0%', width: `${entryPctClamped}%` }}
              />
              {/* Profit zone (Entry to TP) */}
              <div
                className="absolute top-0 bottom-0 bg-brand-profit/[0.03]"
                style={{ left: `${entryPctClamped}%`, width: `${100 - entryPctClamped}%` }}
              />

              {/* Sine wave fill from entry to current price */}
              <SineWaveFill
                fillLeft={Math.min(entryPctClamped, currentPctClamped)}
                fillWidth={Math.abs(entryPctClamped - currentPctClamped)}
                isProfit={isProfit}
              />

              {/* Entry marker */}
              <div className="absolute top-0 bottom-0 w-px bg-white/20 z-[5]" style={{ left: `${entryPctClamped}%` }} />

              {/* TP1 marker (if TP1 hit and exists) */}
              {tp1Pct != null && position.tp1_hit && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-brand-profit/30 z-[3]"
                  style={{ left: `${clamp(tp1Pct, 1, 99)}%` }}
                />
              )}

              {/* Current price marker with heartbeat */}
              <div
                className="absolute top-0 bottom-0 w-0.5 z-10 transition-all duration-300"
                style={{ left: `${currentPctClamped}%`, backgroundColor: isProfit ? '#00E676' : '#FF1744' }}
              >
                <div className={`absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${isProfit ? 'bg-brand-profit animate-[heartbeat-profit_1.5s_ease-in-out_infinite]' : 'bg-brand-loss animate-[heartbeat-loss_1.5s_ease-in-out_infinite]'}`} />
              </div>

              {/* Labels on the bar */}
              <div className="absolute inset-0 flex items-center justify-between px-3 z-20 pointer-events-none">
                <span className="text-[9px] font-mono text-brand-loss/60">SL {formatPrice(stopLoss)}</span>
                <span className="text-[9px] font-mono text-white/25">{formatPrice(entryPrice)}</span>
                <span className="text-[9px] font-mono text-brand-profit/60">{activeTpLabel} {formatPrice(takeProfit)}</span>
              </div>
            </div>
          </div>

          {/* Row 4: TP levels (if multi-TP) */}
          {tp1Price && (
            <div className="flex items-center gap-4 mt-2 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">TP1:</span>
                <span className={`font-mono ${position.tp1_hit ? 'text-brand-profit/50 line-through' : 'text-brand-accent'}`}>
                  {formatPrice(tp1Price)}
                </span>
                {position.tp1_hit && <span className="text-brand-profit/40">исполнен</span>}
              </div>
              {tp2Price && (
                <>
                  <div className="w-px h-3 bg-white/5" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">TP2:</span>
                    <span className={`font-mono ${position.tp1_hit ? 'text-brand-accent' : 'text-gray-400'}`}>
                      {formatPrice(tp2Price)}
                    </span>
                  </div>
                </>
              )}
              {position.realized_pnl != null && Number(position.realized_pnl) !== 0 && (
                <>
                  <div className="w-px h-3 bg-white/5" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Реализ.:</span>
                    <span className={`font-mono ${Number(position.realized_pnl) >= 0 ? 'text-brand-profit/60' : 'text-brand-loss/60'}`}>
                      {formatPnl(position.realized_pnl)}
                    </span>
                  </div>
                </>
              )}
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

/* ---- Equity Curve Tab ---- */

interface EquityDataPoint {
  time: Time;
  value: number;
}

function EquityCurveTab({
  positions,
  loading,
}: {
  positions: PositionResponse[];
  loading: boolean;
}) {
  const equityData = useMemo<EquityDataPoint[]>(() => {
    const closed = positions
      .filter((p) => p.status === 'closed' && p.closed_at && p.realized_pnl != null)
      .sort(
        (a, b) =>
          new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime(),
      );

    if (closed.length === 0) return [];

    let cumulative = 0;
    const points: EquityDataPoint[] = [
      {
        time: (Math.floor(new Date(closed[0].closed_at!).getTime() / 1000) - 1) as Time,
        value: 0,
      },
    ];

    for (const p of closed) {
      cumulative += Number(p.realized_pnl);
      points.push({
        time: Math.floor(new Date(p.closed_at!).getTime() / 1000) as Time,
        value: +cumulative.toFixed(2),
      });
    }

    return points;
  }, [positions]);

  const tradeCount = equityData.length - 1;
  const totalPnl = equityData.length > 0 ? equityData[equityData.length - 1].value : 0;
  const avgPnl = tradeCount > 0 ? totalPnl / tradeCount : 0;
  const isPositive = totalPnl >= 0;

  if (loading) {
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="py-8">
          <Skeleton className="h-[350px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (equityData.length === 0) {
    return <EmptyState message="Нет закрытых сделок" />;
  }

  return (
    <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
      <CardContent className="pt-5 pb-4 px-4">
        {/* Header with total PnL */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-400">Кривая доходности</span>
          </div>
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-brand-profit" />
            ) : (
              <TrendingDown className="h-4 w-4 text-brand-loss" />
            )}
            <span
              className={`font-mono text-lg font-semibold ${
                isPositive ? 'text-brand-profit' : 'text-brand-loss'
              }`}
            >
              {formatPnl(totalPnl)}
            </span>
            <span className="text-xs text-gray-500">USDT</span>
          </div>
        </div>

        {/* Chart */}
        <BotEquityChart data={equityData} />

        {/* Footer stats */}
        <div className="flex items-center gap-6 mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <Hash className="h-3 w-3 text-gray-500" />
            <span className="text-xs text-gray-500">Сделок:</span>
            <span className="text-xs font-mono text-gray-300">
              {tradeCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3 text-gray-500" />
            <span className="text-xs text-gray-500">Средняя:</span>
            <span
              className={`text-xs font-mono ${
                avgPnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'
              }`}
            >
              {formatPnl(avgPnl)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BotEquityChart({ data }: { data: EquityDataPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const lastValue = data.length > 0 ? data[data.length - 1].value : 0;
  const isPositive = lastValue >= 0;

  const initChart = useCallback(() => {
    if (!containerRef.current || data.length === 0) return;

    // Cleanup previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#555',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(255,255,255,0.1)',
          labelBackgroundColor: '#1a1a2e',
        },
        horzLine: {
          color: 'rgba(255,255,255,0.1)',
          labelBackgroundColor: '#1a1a2e',
        },
      },
      height: 350,
    });
    chartRef.current = chart;

    // Line color based on final PnL sign
    const lineColor = isPositive ? '#00E676' : '#FF1744';
    const topColor = isPositive
      ? 'rgba(0,230,118,0.12)'
      : 'rgba(255,23,68,0.12)';
    const bottomColor = isPositive
      ? 'rgba(0,230,118,0.0)'
      : 'rgba(255,23,68,0.0)';

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: '#0d0d1a',
    });

    areaSeries.setData(data);

    // Zero baseline
    areaSeries.createPriceLine({
      price: 0,
      color: 'rgba(255,255,255,0.08)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    });

    chart.timeScale().fitContent();

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [data, isPositive]);

  useEffect(() => {
    const cleanup = initChart();
    return () => cleanup?.();
  }, [initChart]);

  return <div ref={containerRef} className="w-full" style={{ minHeight: 350 }} />;
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
