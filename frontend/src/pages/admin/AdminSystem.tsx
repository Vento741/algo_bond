import { useEffect, useState, useCallback, Fragment } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Check,
  Container,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  Wifi,
  Zap,
  Timer,
  Bot,
  ListChecks,
  Settings,
  FileWarning,
  DollarSign,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import api from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, type SelectOption } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface ServiceHealth {
  name: string;
  status: string;
  latency_ms: number;
  details: string | null;
}

interface HealthData {
  services: ServiceHealth[];
  uptime_seconds: number;
  checked_at: string;
}

interface MetricsData {
  cpu_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  memory_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_percent: number;
  load_average: number[];
}

interface RedisData {
  used_memory_mb: number;
  peak_memory_mb: number;
  max_memory_mb: number;
  total_keys: number;
  keys_by_db: Record<string, number>;
  hit_rate_percent: number;
  hits: number;
  misses: number;
  connected_clients: number;
  ops_per_sec: number;
}

interface DbTable {
  name: string;
  row_count: number;
  size_mb: number;
}

interface DbData {
  active_connections: number;
  max_connections: number;
  database_size_mb: number;
  tables: DbTable[];
}

interface CeleryWorker {
  name: string;
  status: string;
  active_tasks: number;
  processed: number;
}

interface CeleryData {
  workers: CeleryWorker[];
  queue_length: number;
  active_tasks: number;
  beat_last_run: string | null;
  active_bots_count: number;
}

interface ErrorItem {
  id: string;
  timestamp: string;
  module: string;
  message: string;
  traceback: string | null;
  bot_id: string | null;
  user_email: string | null;
}

interface ErrorsData {
  items: ErrorItem[];
  total: number;
}

interface DockerContainer {
  name: string;
  status: string;
  uptime: string;
}

interface ConfigData {
  env_vars: Record<string, string>;
  app_version: string;
  python_version: string;
  git_commit: string;
  docker_containers: DockerContainer[];
}

interface PnlData {
  total_pnl: number;
  total_bots: number;
  active_bots: number;
  demo_bots_excluded: boolean;
  live_pnl: number;
  demo_pnl: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'ok':
    case 'running':
      return '#00E676';
    case 'degraded':
    case 'warning':
      return '#FFD700';
    case 'down':
    case 'error':
    case 'unhealthy':
      return '#FF1744';
    default:
      return '#6b7280';
  }
}

function progressColor(percent: number): string {
  if (percent < 60) return '#00E676';
  if (percent < 80) return '#FFD700';
  return '#FF1744';
}

type ModuleName = 'trading' | 'market' | 'backtest' | 'strategy' | 'auth' | 'other';

const MODULE_COLORS: Record<ModuleName, { bg: string; text: string }> = {
  trading: { bg: 'bg-[#FF1744]/10', text: 'text-[#FF1744]' },
  market: { bg: 'bg-[#FFD700]/10', text: 'text-[#FFD700]' },
  backtest: { bg: 'bg-[#4488ff]/10', text: 'text-[#4488ff]' },
  strategy: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  auth: { bg: 'bg-gray-500/10', text: 'text-gray-400' },
  other: { bg: 'bg-gray-500/10', text: 'text-gray-400' },
};

function getModuleColor(mod: string): { bg: string; text: string } {
  const key = mod.toLowerCase() as ModuleName;
  return MODULE_COLORS[key] ?? MODULE_COLORS.other;
}

const MODULE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Все модули' },
  { value: 'trading', label: 'Trading' },
  { value: 'backtest', label: 'Backtest' },
  { value: 'market', label: 'Market' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'auth', label: 'Auth' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const color = progressColor(percent);
  return (
    <div className={`h-1.5 rounded-full bg-white/5 mt-2 ${className ?? ''}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  progress,
  iconColor,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  progress?: number;
  iconColor?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400 truncate">{title}</p>
          <p className="text-lg font-bold font-data text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg ${iconColor ? '' : 'bg-white/5'}`}
          style={iconColor ? { backgroundColor: `${iconColor}15` } : undefined}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor ?? '#9ca3af' }} />
        </div>
      </div>
      {progress !== undefined && <ProgressBar percent={progress} />}
    </div>
  );
}

function CardSkeleton() {
  return <Skeleton className="h-24 rounded-xl" />;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AdminSystem() {
  // State
  const [activeTab, setActiveTab] = useState('redis');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [redis, setRedis] = useState<RedisData | null>(null);
  const [db, setDb] = useState<DbData | null>(null);
  const [celery, setCelery] = useState<CeleryData | null>(null);
  const [errors, setErrors] = useState<ErrorsData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [pnl, setPnl] = useState<PnlData | null>(null);

  const [errorModule, setErrorModule] = useState('');
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [excludeDemo, setExcludeDemo] = useState(false);
  const [checking, setChecking] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);

  // Fetch functions
  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await api.get<HealthData>('/admin/system/health');
      setHealth(data);
    } catch {
      // silent
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const { data } = await api.get<MetricsData>('/admin/system/metrics');
      setMetrics(data);
    } catch {
      // silent
    }
  }, []);

  const fetchRedis = useCallback(async () => {
    try {
      const { data } = await api.get<RedisData>('/admin/system/redis');
      setRedis(data);
    } catch {
      // silent
    }
  }, []);

  const fetchDb = useCallback(async () => {
    try {
      const { data } = await api.get<DbData>('/admin/system/db');
      setDb(data);
    } catch {
      // silent
    }
  }, []);

  const fetchCelery = useCallback(async () => {
    try {
      const { data } = await api.get<CeleryData>('/admin/system/celery');
      setCelery(data);
    } catch {
      // silent
    }
  }, []);

  const fetchErrors = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { limit: 50, offset: 0 };
      if (errorModule) params.module = errorModule;
      const { data } = await api.get<ErrorsData>('/admin/system/errors', { params });
      setErrors(data);
    } catch {
      // silent
    }
  }, [errorModule]);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await api.get<ConfigData>('/admin/system/config');
      setConfig(data);
    } catch {
      // silent
    }
  }, []);

  const fetchPnl = useCallback(async () => {
    try {
      const { data } = await api.get<PnlData>('/admin/system/platform-pnl', {
        params: { exclude_demo: excludeDemo },
      });
      setPnl(data);
    } catch {
      // silent
    }
  }, [excludeDemo]);

  // Check all
  const checkAll = useCallback(async () => {
    setChecking(true);
    try {
      await Promise.all([
        fetchHealth(),
        fetchMetrics(),
        fetchRedis(),
        fetchDb(),
        fetchCelery(),
        fetchPnl(),
      ]);
    } finally {
      setChecking(false);
    }
  }, [fetchHealth, fetchMetrics, fetchRedis, fetchDb, fetchCelery, fetchPnl]);

  // Flush Redis
  const flushRedis = useCallback(async () => {
    setFlushing(true);
    try {
      await api.post('/admin/system/redis/flush');
      await fetchRedis();
    } finally {
      setFlushing(false);
    }
  }, [fetchRedis]);

  // Reconcile all
  const reconcileAll = useCallback(async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const { data } = await api.post<{ bots_checked: number; corrections: number }>('/admin/system/reconcile-all');
      setReconcileResult(`Проверено: ${data.bots_checked}, исправлено: ${data.corrections}`);
      await fetchPnl();
    } catch {
      setReconcileResult('Ошибка при сверке');
    } finally {
      setReconciling(false);
    }
  }, [fetchPnl]);

  // Copy error
  const copyError = useCallback((item: ErrorItem) => {
    const text = `[${item.module}] ${item.message}${item.traceback ? `\n\n${item.traceback}` : ''}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  // 5 sec: health + metrics
  useEffect(() => {
    fetchHealth();
    fetchMetrics();
    const id = setInterval(() => {
      fetchHealth();
      fetchMetrics();
    }, 5000);
    return () => clearInterval(id);
  }, [fetchHealth, fetchMetrics]);

  // 60 sec: redis + db + celery + pnl
  useEffect(() => {
    fetchRedis();
    fetchDb();
    fetchCelery();
    fetchPnl();
    const id = setInterval(() => {
      fetchRedis();
      fetchDb();
      fetchCelery();
      fetchPnl();
    }, 60000);
    return () => clearInterval(id);
  }, [fetchRedis, fetchDb, fetchCelery, fetchPnl]);

  // 30 sec: errors (only when tab active)
  useEffect(() => {
    if (activeTab === 'errors') {
      fetchErrors();
      const id = setInterval(fetchErrors, 30000);
      return () => clearInterval(id);
    }
  }, [activeTab, fetchErrors]);

  // config: only on tab switch
  useEffect(() => {
    if (activeTab === 'config') fetchConfig();
  }, [activeTab, fetchConfig]);

  // ---------------------------------------------------------------------------
  // Alert detection
  // ---------------------------------------------------------------------------

  const alerts: { level: 'critical' | 'warning'; text: string }[] = [];

  if (metrics) {
    if (metrics.cpu_percent > 90) alerts.push({ level: 'critical', text: `CPU ${metrics.cpu_percent.toFixed(0)}%` });
    if (metrics.memory_percent > 80) alerts.push({ level: 'warning', text: `RAM ${metrics.memory_percent.toFixed(0)}%` });
    if (metrics.disk_percent > 90) alerts.push({ level: 'critical', text: `Disk ${metrics.disk_percent.toFixed(0)}%` });
  }

  if (health) {
    for (const svc of health.services) {
      if (svc.status.toLowerCase() === 'down' || svc.status.toLowerCase() === 'error') {
        alerts.push({ level: 'critical', text: `${svc.name} не доступен` });
      }
      if (svc.name.toLowerCase().includes('bybit') && svc.latency_ms > 500) {
        alerts.push({ level: 'warning', text: `Bybit задержка ${svc.latency_ms}ms` });
      }
    }
  }

  if (redis && redis.hit_rate_percent < 50) {
    alerts.push({ level: 'warning', text: `Redis hit rate ${redis.hit_rate_percent.toFixed(0)}%` });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* ---- SUMMARY BAR ---- */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-[#1a1a2e] px-4 py-3">
        {/* Check button */}
        <Button
          variant="premium"
          size="sm"
          onClick={checkAll}
          disabled={checking}
          className="flex-shrink-0"
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Shield className="h-4 w-4 mr-2" />
          )}
          Проверить систему
        </Button>

        {/* Service pills */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {health ? (
            health.services.map((svc) => (
              <div
                key={svc.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: statusColor(svc.status) }}
                />
                <span className="text-gray-300 whitespace-nowrap">{svc.name}</span>
                <span className="font-data text-gray-500">{svc.latency_ms}ms</span>
              </div>
            ))
          ) : (
            <>
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </>
          )}
        </div>

        {/* Uptime */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
          <Clock className="h-3.5 w-3.5" />
          <span>Uptime:</span>
          <span className="font-data text-white">
            {health ? formatUptime(health.uptime_seconds) : '--'}
          </span>
        </div>
      </div>

      {/* ---- ALERT BAR ---- */}
      {alerts.length > 0 && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
            alerts.some((a) => a.level === 'critical')
              ? 'border-[#FF1744]/30 bg-[#FF1744]/5'
              : 'border-[#FFD700]/30 bg-[#FFD700]/5'
          }`}
        >
          <AlertTriangle
            className="h-4 w-4 flex-shrink-0"
            style={{
              color: alerts.some((a) => a.level === 'critical') ? '#FF1744' : '#FFD700',
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {alerts.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: a.level === 'critical' ? '#FF174415' : '#FFD70015',
                  color: a.level === 'critical' ? '#FF1744' : '#FFD700',
                }}
              >
                {a.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- TABS ---- */}
      <Tabs defaultValue="redis" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="redis">
            <Zap className="h-3.5 w-3.5 mr-1" />
            Redis
          </TabsTrigger>
          <TabsTrigger value="postgres">
            <Database className="h-3.5 w-3.5 mr-1" />
            PostgreSQL
          </TabsTrigger>
          <TabsTrigger value="celery">
            <ListChecks className="h-3.5 w-3.5 mr-1" />
            Celery
          </TabsTrigger>
          <TabsTrigger value="server">
            <Server className="h-3.5 w-3.5 mr-1" />
            Сервер
          </TabsTrigger>
          <TabsTrigger value="errors">
            <FileWarning className="h-3.5 w-3.5 mr-1" />
            Ошибки
            {errors && errors.total > 0 && (
              <span className="ml-1 rounded-full bg-[#FF1744]/20 text-[#FF1744] px-1.5 text-[10px] font-data">
                {errors.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="h-3.5 w-3.5 mr-1" />
            Конфиг
          </TabsTrigger>
        </TabsList>

        {/* ---- TAB: Redis ---- */}
        <TabsContent value="redis">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {redis ? (
                <>
                  <MetricCard
                    title="Использовано памяти"
                    value={`${redis.used_memory_mb.toFixed(1)} MB`}
                    sub={`Пик: ${redis.peak_memory_mb.toFixed(1)} MB / Макс: ${redis.max_memory_mb > 0 ? `${redis.max_memory_mb.toFixed(0)} MB` : 'Не ограничено'}`}
                    icon={MemoryStick}
                    iconColor="#4488ff"
                    progress={redis.max_memory_mb > 0 ? (redis.used_memory_mb / redis.max_memory_mb) * 100 : undefined}
                  />
                  <MetricCard
                    title="Всего ключей"
                    value={redis.total_keys.toLocaleString()}
                    sub={Object.entries(redis.keys_by_db).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Нет данных'}
                    icon={Database}
                    iconColor="#FFD700"
                  />
                  <MetricCard
                    title="Hit Rate"
                    value={`${redis.hit_rate_percent.toFixed(1)}%`}
                    sub={`${redis.hits.toLocaleString()} hits / ${redis.misses.toLocaleString()} misses`}
                    icon={Activity}
                    iconColor={redis.hit_rate_percent >= 80 ? '#00E676' : redis.hit_rate_percent >= 50 ? '#FFD700' : '#FF1744'}
                    progress={redis.hit_rate_percent}
                  />
                  <MetricCard
                    title="Подключения"
                    value={redis.connected_clients}
                    icon={Network}
                    iconColor="#4488ff"
                  />
                  <MetricCard
                    title="Операций/сек"
                    value={redis.ops_per_sec.toLocaleString()}
                    icon={Zap}
                    iconColor="#00E676"
                  />
                </>
              ) : (
                Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
              )}
            </div>

            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={flushing}>
                    {flushing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Очистить кеш
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Очистить Redis кеш?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Все кешированные данные будут удалены. Это может временно замедлить работу платформы.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={flushRedis}>Очистить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </TabsContent>

        {/* ---- TAB: PostgreSQL ---- */}
        <TabsContent value="postgres">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {db ? (
                <>
                  <MetricCard
                    title="Активные подключения"
                    value={`${db.active_connections} / ${db.max_connections}`}
                    icon={Network}
                    iconColor="#4488ff"
                    progress={(db.active_connections / db.max_connections) * 100}
                  />
                  <MetricCard
                    title="Размер БД"
                    value={`${db.database_size_mb.toFixed(1)} MB`}
                    icon={Database}
                    iconColor="#FFD700"
                  />
                </>
              ) : (
                <>
                  <CardSkeleton />
                  <CardSkeleton />
                </>
              )}
            </div>

            {/* Tables */}
            <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <h3 className="text-sm font-medium text-white">Таблицы</h3>
              </div>
              {db ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left text-gray-400 font-medium px-4 py-2">Таблица</th>
                        <th className="text-right text-gray-400 font-medium px-4 py-2">Строк</th>
                        <th className="text-right text-gray-400 font-medium px-4 py-2">Размер</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...db.tables]
                        .sort((a, b) => b.size_mb - a.size_mb)
                        .map((t) => (
                          <tr key={t.name} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                            <td className="px-4 py-2 text-gray-300">{t.name}</td>
                            <td className="px-4 py-2 text-right font-data text-gray-300">
                              {t.row_count.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right font-data text-gray-300">
                              {t.size_mb.toFixed(2)} MB
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ---- TAB: Celery ---- */}
        <TabsContent value="celery">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {celery ? (
                <>
                  <MetricCard
                    title="Воркеры"
                    value={celery.workers.length}
                    sub={`${celery.workers.filter((w) => w.status === 'online').length} онлайн`}
                    icon={Cpu}
                    iconColor="#00E676"
                  />
                  <MetricCard
                    title="Очередь задач"
                    value={celery.queue_length}
                    sub={`Активных: ${celery.active_tasks}`}
                    icon={ListChecks}
                    iconColor={celery.queue_length > 100 ? '#FF1744' : '#FFD700'}
                  />
                  <MetricCard
                    title="Активные боты"
                    value={celery.active_bots_count}
                    icon={Bot}
                    iconColor="#4488ff"
                  />
                  <MetricCard
                    title="Beat последний запуск"
                    value={
                      celery.beat_last_run
                        ? new Date(celery.beat_last_run).toLocaleTimeString('ru-RU')
                        : 'Нет данных'
                    }
                    icon={Timer}
                    iconColor="#FFD700"
                  />
                </>
              ) : (
                Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
              )}
            </div>

            {/* Workers table */}
            {celery && celery.workers.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="text-sm font-medium text-white">Воркеры</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left text-gray-400 font-medium px-4 py-2">Имя</th>
                        <th className="text-left text-gray-400 font-medium px-4 py-2">Статус</th>
                        <th className="text-right text-gray-400 font-medium px-4 py-2">Активных</th>
                        <th className="text-right text-gray-400 font-medium px-4 py-2">Обработано</th>
                      </tr>
                    </thead>
                    <tbody>
                      {celery.workers.map((w) => (
                        <tr key={w.name} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-gray-300 font-data text-xs">{w.name}</td>
                          <td className="px-4 py-2">
                            <span
                              className="inline-flex items-center gap-1 text-xs"
                              style={{ color: statusColor(w.status) }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: statusColor(w.status) }}
                              />
                              {w.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-data text-gray-300">{w.active_tasks}</td>
                          <td className="px-4 py-2 text-right font-data text-gray-300">{w.processed.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---- TAB: Server ---- */}
        <TabsContent value="server">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {metrics ? (
                <>
                  <MetricCard
                    title="CPU"
                    value={`${metrics.cpu_percent.toFixed(1)}%`}
                    icon={Cpu}
                    iconColor={progressColor(metrics.cpu_percent)}
                    progress={metrics.cpu_percent}
                  />
                  <MetricCard
                    title="RAM"
                    value={`${metrics.memory_used_gb.toFixed(1)} / ${metrics.memory_total_gb.toFixed(1)} GB`}
                    sub={`${metrics.memory_percent.toFixed(0)}%`}
                    icon={MemoryStick}
                    iconColor={progressColor(metrics.memory_percent)}
                    progress={metrics.memory_percent}
                  />
                  <MetricCard
                    title="Диск"
                    value={`${metrics.disk_used_gb.toFixed(1)} / ${metrics.disk_total_gb.toFixed(1)} GB`}
                    sub={`${metrics.disk_percent.toFixed(0)}%`}
                    icon={HardDrive}
                    iconColor={progressColor(metrics.disk_percent)}
                    progress={metrics.disk_percent}
                  />
                  <MetricCard
                    title="Load Average"
                    value={metrics.load_average.map((v) => v.toFixed(2)).join(' / ')}
                    sub="1m / 5m / 15m"
                    icon={Activity}
                    iconColor="#4488ff"
                  />
                </>
              ) : (
                Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
              )}
            </div>

            {/* Network latencies */}
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">Сетевые задержки</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {health ? (
                  <>
                    {health.services.map((svc) => (
                      <MetricCard
                        key={svc.name}
                        title={svc.name}
                        value={`${svc.latency_ms} ms`}
                        icon={Wifi}
                        iconColor={statusColor(svc.status)}
                      />
                    ))}
                  </>
                ) : (
                  Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ---- TAB: Errors ---- */}
        <TabsContent value="errors">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Select
                options={MODULE_OPTIONS}
                value={errorModule}
                onChange={setErrorModule}
                placeholder="Все модули"
              />
              <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Авто-обновление 30с</span>
              </div>
            </div>

            {/* Errors table */}
            <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
              {errors ? (
                errors.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="w-8 px-2 py-2" />
                          <th className="text-left text-gray-400 font-medium px-4 py-2 whitespace-nowrap">Время</th>
                          <th className="text-left text-gray-400 font-medium px-4 py-2">Модуль</th>
                          <th className="text-left text-gray-400 font-medium px-4 py-2">Сообщение</th>
                          <th className="w-10 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {errors.items.map((item) => {
                          const mc = getModuleColor(item.module);
                          const isExpanded = expandedError === item.id;
                          return (
                            <Fragment key={item.id}>
                              <tr
                                className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                                onClick={() => setExpandedError(isExpanded ? null : item.id)}
                              >
                                <td className="px-2 py-2 text-gray-500">
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </td>
                                <td className="px-4 py-2 font-data text-xs text-gray-400 whitespace-nowrap">
                                  {new Date(item.timestamp).toLocaleTimeString('ru-RU')}
                                </td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${mc.bg} ${mc.text}`}>
                                    {item.module}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-gray-300 max-w-md truncate">
                                  {item.message}
                                </td>
                                <td className="px-2 py-2">
                                  <button
                                    className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyError(item);
                                    }}
                                    title="Копировать"
                                  >
                                    {copiedId === item.id ? (
                                      <Check className="h-3.5 w-3.5 text-[#00E676]" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && item.traceback && (
                                <tr className="border-b border-white/5">
                                  <td colSpan={5} className="px-4 py-3">
                                    <pre className="text-xs text-gray-400 font-data whitespace-pre-wrap bg-black/30 rounded-lg p-3 max-h-64 overflow-y-auto">
                                      {item.traceback}
                                    </pre>
                                    {item.bot_id && (
                                      <p className="text-xs text-gray-500 mt-2">
                                        Bot ID: <span className="font-data">{item.bot_id}</span>
                                      </p>
                                    )}
                                    {item.user_email && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        Email: <span className="font-data">{item.user_email}</span>
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <FileWarning className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">Ошибок не найдено</p>
                  </div>
                )
              ) : (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
            </div>

            {errors && errors.total > 0 && (
              <p className="text-xs text-gray-500 text-right">
                Показано {errors.items.length} из <span className="font-data">{errors.total}</span>
              </p>
            )}
          </div>
        </TabsContent>

        {/* ---- TAB: Config ---- */}
        <TabsContent value="config">
          <div className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Env vars */}
              <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="text-sm font-medium text-white">Переменные окружения</h3>
                </div>
                {config ? (
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(config.env_vars).map(([key, val]) => (
                          <tr key={key} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                            <td className="px-4 py-1.5 text-gray-400 font-data text-xs whitespace-nowrap">{key}</td>
                            <td className="px-4 py-1.5 text-gray-300 font-data text-xs break-all">{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                )}
              </div>

              {/* Version cards */}
              <div className="space-y-3">
                {config ? (
                  <>
                    <MetricCard
                      title="Версия приложения"
                      value={config.app_version}
                      icon={Settings}
                      iconColor="#FFD700"
                    />
                    <MetricCard
                      title="Python"
                      value={config.python_version}
                      icon={Cpu}
                      iconColor="#4488ff"
                    />
                    <MetricCard
                      title="Git Commit"
                      value={config.git_commit.slice(0, 8)}
                      sub={config.git_commit}
                      icon={Activity}
                      iconColor="#00E676"
                    />
                  </>
                ) : (
                  <>
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                  </>
                )}
              </div>
            </div>

            {/* Docker containers */}
            {config && config.docker_containers.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="text-sm font-medium text-white">Docker контейнеры</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left text-gray-400 font-medium px-4 py-2">Контейнер</th>
                        <th className="text-left text-gray-400 font-medium px-4 py-2">Статус</th>
                        <th className="text-left text-gray-400 font-medium px-4 py-2">Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {config.docker_containers.map((c) => (
                        <tr key={c.name} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-gray-300 flex items-center gap-2">
                            <Container className="h-3.5 w-3.5 text-gray-500" />
                            {c.name}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className="inline-flex items-center gap-1 text-xs"
                              style={{ color: statusColor(c.status) }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: statusColor(c.status) }}
                              />
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-400 font-data text-xs">{c.uptime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ---- BOTTOM: Platform P&L + Actions ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* P&L card */}
        <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#FFD700]" />
              Платформенный P&L
            </h3>
            <button
              onClick={() => setExcludeDemo(!excludeDemo)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              {excludeDemo ? (
                <ToggleRight className="h-4 w-4 text-[#00E676]" />
              ) : (
                <ToggleLeft className="h-4 w-4" />
              )}
              Исключить demo
            </button>
          </div>

          {pnl ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Общий P&L</p>
                <p
                  className="text-2xl font-bold font-data"
                  style={{ color: Number(pnl.total_pnl) >= 0 ? '#00E676' : '#FF1744' }}
                >
                  {Number(pnl.total_pnl) >= 0 ? '+' : ''}${Number(pnl.total_pnl).toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Live P&L</p>
                  <p
                    className="text-lg font-bold font-data"
                    style={{ color: Number(pnl.live_pnl) >= 0 ? '#00E676' : '#FF1744' }}
                  >
                    {Number(pnl.live_pnl) >= 0 ? '+' : ''}${Number(pnl.live_pnl).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Demo P&L</p>
                  <p
                    className="text-lg font-bold font-data"
                    style={{ color: Number(pnl.demo_pnl) >= 0 ? '#00E676' : '#FF1744' }}
                  >
                    {Number(pnl.demo_pnl) >= 0 ? '+' : ''}${Number(pnl.demo_pnl).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Всего ботов: <span className="font-data text-gray-300">{pnl.total_bots}</span></span>
                <span>Активных: <span className="font-data text-gray-300">{pnl.active_bots}</span></span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
          )}
        </div>

        {/* Reconcile card */}
        <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-2">
              <RefreshCw className="h-4 w-4 text-[#4488ff]" />
              Сверка P&L
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Сравнение P&L всех ботов с данными Bybit и исправление расхождений.
            </p>
          </div>

          <div className="space-y-3">
            {reconcileResult && (
              <Badge variant={reconcileResult.includes('Ошибка') ? 'loss' : 'profit'}>
                {reconcileResult}
              </Badge>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reconciling}
                  className="w-full"
                >
                  {reconciling ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Reconcile All Bots
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Запустить сверку всех ботов?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Будет выполнено сравнение P&L каждого бота с данными Bybit API.
                    Расхождения будут исправлены автоматически.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={reconcileAll}>Запустить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}
