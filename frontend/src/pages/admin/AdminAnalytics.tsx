import { useEffect, useState, useCallback, useRef } from 'react';
import {
  BarChart3,
  FileText,
  Globe,
  Monitor,
  Filter as FilterIcon,
  Activity,
  Zap,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Users,
  Eye,
  Clock,
  ArrowDownUp,
  MousePointerClick,
  Smartphone,
  Laptop,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AnalyticsSummary {
  visitors: number;
  pageviews: number;
  sessions: number;
  bounce_rate: number;
  avg_duration: number;
  daily_data: { date: string; visitors: number; pageviews: number; sessions: number }[];
}

interface PageStat {
  path: string;
  views: number;
  unique_visitors: number;
  avg_scroll: number | null;
}

interface SourceStat {
  source: string;
  visits: number;
  percentage: number;
}

interface DeviceStat {
  name: string;
  count: number;
  percentage: number;
}

interface DevicesData {
  browsers: DeviceStat[];
  os_list: DeviceStat[];
  device_types: DeviceStat[];
  countries: DeviceStat[];
}

interface FunnelStep {
  step_name: string;
  count: number;
  conversion_rate: number;
}

interface RealtimeData {
  online_count: number;
  active_pages: { path: string; visitors: number }[];
}

interface EventEntry {
  id: string;
  session_id: string;
  event_type: string;
  page_path: string | null;
  page_title: string | null;
  element_id: string | null;
  scroll_depth: number | null;
  error_message: string | null;
  extra_data: Record<string, unknown> | null;
  created_at: string;
}

interface EventsResponse {
  items: EventEntry[];
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Tabs config                                                        */
/* ------------------------------------------------------------------ */

type TabId =
  | 'overview'
  | 'pages'
  | 'sources'
  | 'devices'
  | 'funnel'
  | 'realtime'
  | 'events';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Обзор', icon: BarChart3 },
  { id: 'pages', label: 'Страницы', icon: FileText },
  { id: 'sources', label: 'Источники', icon: Globe },
  { id: 'devices', label: 'Устройства', icon: Monitor },
  { id: 'funnel', label: 'Воронка', icon: FilterIcon },
  { id: 'realtime', label: 'Realtime', icon: Activity },
  { id: 'events', label: 'События', icon: Zap },
];

/* ------------------------------------------------------------------ */
/*  Period config                                                      */
/* ------------------------------------------------------------------ */

type Period = '1d' | '7d' | '30d' | '90d';

interface PeriodOption {
  value: Period;
  label: string;
}

const PERIODS: PeriodOption[] = [
  { value: '1d', label: 'Сегодня' },
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
];

function periodToDays(p: Period): number {
  return parseInt(p.replace('d', ''), 10);
}

/* ------------------------------------------------------------------ */
/*  Data fetching hook - eliminates repeated fetch pattern             */
/* ------------------------------------------------------------------ */

function useAnalyticsData<T>(url: string, deps: unknown[] = []): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(url)
      .then(({ data: d }) => {
        if (!cancelled) setData(d as T);
      })
      .catch(() => {
        // Аналитика не критична
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, loading };
}

/** Спиннер загрузки для табов */
function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG Chart helpers                                                  */
/* ------------------------------------------------------------------ */

function buildSmoothPath(
  points: { x: number; y: number }[],
): string {
  if (points.length < 2) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
    d += ` C${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
  }
  return d;
}

/** SVG line chart - визиты по дням */
function VisitsChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Нет данных
      </div>
    );
  }

  const W = 800;
  const H = 200;
  const PAD_X = 40;
  const PAD_Y = 20;

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const range = maxVal || 1;

  const points = data.map((d, i) => ({
    x: PAD_X + (i / Math.max(data.length - 1, 1)) * (W - PAD_X * 2),
    y: PAD_Y + (1 - d.count / range) * (H - PAD_Y * 2),
  }));

  const linePath = buildSmoothPath(points);
  const last = points[points.length - 1];
  const areaPath = `${linePath} L${last.x},${H - PAD_Y} L${points[0].x},${H - PAD_Y} Z`;

  // Y-axis labels (3 ticks)
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((tick) => {
        const y = PAD_Y + (1 - tick / range) * (H - PAD_Y * 2);
        return (
          <g key={tick}>
            <line
              x1={PAD_X}
              y1={y}
              x2={W - PAD_X}
              y2={y}
              stroke="white"
              strokeOpacity={0.05}
            />
            <text
              x={PAD_X - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-gray-500"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Area gradient */}
      <defs>
        <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#FFD700" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#visitGrad)" />
      <path d={linePath} fill="none" stroke="#FFD700" strokeWidth={2} strokeLinecap="round" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#FFD700" />
      ))}

      {/* X-axis labels (show every Nth to avoid overlap) */}
      {(() => {
        const step = Math.max(1, Math.floor(data.length / 7));
        return data.map((d, i) => {
        if (i % step !== 0 && i !== data.length - 1) return null;
        return (
          <text
            key={d.date}
            x={points[i].x}
            y={H - 4}
            textAnchor="middle"
            className="fill-gray-500"
            fontSize={9}
            fontFamily="JetBrains Mono, monospace"
          >
            {d.date.slice(5)}
          </text>
        );
      });
      })()}
    </svg>
  );
}

/** SVG horizontal bar chart */
function HorizontalBarChart({
  data,
  color = '#FFD700',
}: {
  data: { name: string; percentage: number }[];
  color?: string;
}) {
  if (data.length === 0) {
    return <div className="text-gray-500 text-sm py-4">Нет данных</div>;
  }

  return (
    <div className="space-y-2.5">
      {data.slice(0, 6).map((item) => (
        <div key={item.name}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-300 truncate mr-2">{item.name}</span>
            <span className="text-gray-400 font-data shrink-0">
              {item.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(item.percentage, 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** SVG funnel visualization */
function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0) {
    return <div className="text-gray-500 text-sm py-8 text-center">Нет данных</div>;
  }

  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const widthPct = Math.max((step.count / maxCount) * 100, 12);
        const prevStep = i > 0 ? steps[i - 1] : null;
        const convRate =
          prevStep && prevStep.count > 0
            ? ((step.count / prevStep.count) * 100).toFixed(1)
            : null;

        return (
          <div key={step.step_name}>
            {/* Conversion arrow between steps */}
            {convRate !== null && (
              <div className="flex items-center justify-center py-1.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <ArrowDownUp className="h-3 w-3" />
                  <span className="font-data">{convRate}%</span>
                </div>
              </div>
            )}
            <div className="relative">
              <div
                className="relative h-14 rounded-lg overflow-hidden transition-all duration-500"
                style={{ width: `${widthPct}%` }}
              >
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: `linear-gradient(90deg, rgba(255,215,0,${0.15 + (1 - i / steps.length) * 0.15}), rgba(255,215,0,${0.05 + (1 - i / steps.length) * 0.1}))`,
                    border: '1px solid rgba(255,215,0,0.12)',
                  }}
                />
                <div className="relative flex items-center justify-between h-full px-4">
                  <span className="text-sm text-white font-medium truncate">
                    {step.step_name}
                  </span>
                  <span className="text-sm font-data text-brand-premium shrink-0 ml-2">
                    {step.count.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  change?: number;
}

function StatCard({ label, value, icon: Icon, change }: StatCardProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5 transition-colors hover:border-white/10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5">
          <Icon className="h-4.5 w-4.5 text-gray-400" />
        </div>
      </div>
      <div className="text-2xl font-bold font-data text-white">{value}</div>
      {change !== undefined && change !== 0 && (
        <div
          className={cn(
            'text-xs font-data mt-1.5',
            change > 0 ? 'text-[#00E676]' : 'text-[#FF1744]',
          )}
        >
          {change > 0 ? '+' : ''}
          {change.toFixed(1)}% к пред. периоду
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Overview                                                      */
/* ------------------------------------------------------------------ */

function OverviewTab({ period }: { period: Period }) {
  const { data, loading } = useAnalyticsData<AnalyticsSummary>(
    `/admin/analytics/overview?days=${periodToDays(period)}`,
  );

  if (loading) return <TabLoader />;

  if (!data) {
    return <div className="text-gray-500 text-sm py-12 text-center">Не удалось загрузить данные</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Посетители"
          value={data.visitors.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Просмотры"
          value={data.pageviews.toLocaleString()}
          icon={Eye}
        />
        <StatCard
          label="Bounce Rate"
          value={`${data.bounce_rate.toFixed(1)}%`}
          icon={MousePointerClick}
        />
        <StatCard
          label="Ср. длительность"
          value={formatDuration(data.avg_duration)}
          icon={Clock}
        />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5">
        <h3 className="text-sm text-gray-400 mb-4">Визиты по дням</h3>
        <VisitsChart data={data.daily_data.map(d => ({ date: d.date, count: d.visitors }))} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Pages                                                         */
/* ------------------------------------------------------------------ */

function PagesTab({ period }: { period: Period }) {
  const { data: pages, loading } = useAnalyticsData<PageStat[]>(
    `/admin/analytics/pages?days=${periodToDays(period)}`,
  );
  const [sortKey, setSortKey] = useState<'views' | 'unique_visitors'>('views');

  const sorted = [...(pages ?? [])].sort((a, b) => b[sortKey] - a[sortKey]);

  if (loading) return <TabLoader />;

  return (
    <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Страница</th>
              <ThSortable
                label="Просмотры"
                active={sortKey === 'views'}
                onClick={() => setSortKey('views')}
              />
              <ThSortable
                label="Уники"
                active={sortKey === 'unique_visitors'}
                onClick={() => setSortKey('unique_visitors')}
              />
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Scroll Depth</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  Нет данных
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr
                  key={p.path}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 text-gray-300 font-data text-xs">{p.path}</td>
                  <td className="px-4 py-2.5 text-white font-data text-xs">
                    {p.views.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 font-data text-xs">
                    {p.unique_visitors.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-premium"
                          style={{ width: `${p.avg_scroll ?? 0}%` }}
                        />
                      </div>
                      <span className="text-gray-400 font-data text-xs">
                        {p.avg_scroll ?? 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Sources                                                       */
/* ------------------------------------------------------------------ */

function SourcesTab({ period }: { period: Period }) {
  const { data: sources, loading } = useAnalyticsData<SourceStat[]>(
    `/admin/analytics/sources?days=${periodToDays(period)}`,
  );

  if (loading) return <TabLoader />;

  return (
    <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Источник</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Визиты</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">% от общего</th>
            </tr>
          </thead>
          <tbody>
            {!sources || sources.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                  Нет данных
                </td>
              </tr>
            ) : (
              sources.map((s) => (
                <tr
                  key={s.source}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 text-gray-300 text-xs">{s.source}</td>
                  <td className="px-4 py-2.5 text-white font-data text-xs">
                    {s.visits.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-premium/70"
                          style={{ width: `${s.percentage}%` }}
                        />
                      </div>
                      <span className="text-gray-400 font-data text-xs">
                        {s.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Devices                                                       */
/* ------------------------------------------------------------------ */

function DevicesTab({ period }: { period: Period }) {
  const { data, loading } = useAnalyticsData<DevicesData>(
    `/admin/analytics/devices?days=${periodToDays(period)}`,
  );

  if (loading) return <TabLoader />;

  if (!data) {
    return <div className="text-gray-500 text-sm py-12 text-center">Не удалось загрузить данные</div>;
  }

  return (
    <div className="space-y-6">
      {/* 3 bar chart columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm text-gray-400">Браузеры</h3>
          </div>
          <HorizontalBarChart
            data={data.browsers.map((b) => ({ name: b.name, percentage: b.percentage }))}
            color="#FFD700"
          />
        </div>
        <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Laptop className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm text-gray-400">ОС</h3>
          </div>
          <HorizontalBarChart
            data={data.os_list.map((o) => ({ name: o.name, percentage: o.percentage }))}
            color="#4488ff"
          />
        </div>
        <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Smartphone className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm text-gray-400">Устройства</h3>
          </div>
          <HorizontalBarChart
            data={data.device_types.map((d) => ({ name: d.name, percentage: d.percentage }))}
            color="#00E676"
          />
        </div>
      </div>

      {/* Countries table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm text-gray-400">Страны</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Страна</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Визиты</th>
              </tr>
            </thead>
            <tbody>
              {data.countries.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-gray-500">
                    Нет данных
                  </td>
                </tr>
              ) : (
                data.countries.map((c) => (
                  <tr
                    key={c.name}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-gray-300 text-xs">{c.name || 'Unknown'}</td>
                    <td className="px-4 py-2.5 text-white font-data text-xs">
                      {c.count.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Funnel                                                        */
/* ------------------------------------------------------------------ */

function FunnelTab({ period }: { period: Period }) {
  const { data: steps, loading } = useAnalyticsData<FunnelStep[]>(
    `/admin/analytics/funnel?days=${periodToDays(period)}`,
  );

  if (loading) return <TabLoader />;

  return (
    <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-6">
      <h3 className="text-sm text-gray-400 mb-6">Воронка конверсий</h3>
      <FunnelChart steps={steps ?? []} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Realtime                                                      */
/* ------------------------------------------------------------------ */

function RealtimeTab() {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRealtime = useCallback(async () => {
    try {
      const { data: d } = await api.get('/admin/analytics/realtime');
      setData(d as RealtimeData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRealtime();
    intervalRef.current = setInterval(fetchRealtime, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRealtime]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Online counter */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00E676]" />
          </span>
          <span className="text-3xl font-bold font-data text-white">
            {data?.online_count ?? 0}
          </span>
          <span className="text-sm text-gray-400">online сейчас</span>
        </div>
      </div>

      {/* Active pages */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm text-gray-400">Активные страницы</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Страница</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Пользователей</th>
              </tr>
            </thead>
            <tbody>
              {(!data || data.active_pages.length === 0) ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-gray-500">
                    Нет активных пользователей
                  </td>
                </tr>
              ) : (
                data.active_pages.map((p) => (
                  <tr
                    key={p.path}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-gray-300 font-data text-xs">{p.path}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-data text-xs">{p.visitors}</span>
                        <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#00E676]"
                            style={{
                              width: `${Math.min(
                                (p.visitors / Math.max(data.online_count, 1)) * 100,
                                100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Events                                                        */
/* ------------------------------------------------------------------ */

function EventsTab({ period }: { period: Period }) {
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const limit = 50;

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('days', String(periodToDays(period)));
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (typeFilter) params.set('type', typeFilter);
      const { data: d } = await api.get(`/admin/analytics/events?${params.toString()}`);
      setData(d as EventsResponse);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period, page, typeFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const eventTypes = [
    'pageview',
    'click',
    'scroll_depth',
    'form_submit',
    'conversion',
    'error',
    'session_start',
    'session_end',
  ];

  return (
    <div className="space-y-4">
      {/* Type filters */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            setTypeFilter('');
            setPage(0);
          }}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer',
            !typeFilter
              ? 'bg-brand-premium/10 text-brand-premium border-brand-premium/30'
              : 'bg-white/5 text-gray-500 border-transparent hover:text-gray-300',
          )}
        >
          Все
        </button>
        {eventTypes.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTypeFilter(t);
              setPage(0);
            }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer',
              typeFilter === t
                ? 'bg-brand-premium/10 text-brand-premium border-brand-premium/30'
                : 'bg-white/5 text-gray-500 border-transparent hover:text-gray-300',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Время</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Тип</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Страница</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Элемент</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Детали</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    Нет событий
                  </td>
                </tr>
              ) : (
                data?.items.map((ev) => (
                  <tr
                    key={ev.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-gray-500 text-xs font-data whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <EventTypeBadge type={ev.event_type} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs font-data max-w-[180px] truncate">
                      {ev.page_path || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {ev.element_id || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[200px] truncate">
                      {ev.page_title || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {page * limit + 1}-{Math.min((page + 1) * limit, data.total)} из {data.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 font-data">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility components                                                 */
/* ------------------------------------------------------------------ */

const eventTypeColors: Record<string, { color: string; bg: string }> = {
  pageview: { color: 'text-blue-400', bg: 'bg-blue-400/10' },
  click: { color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/10' },
  scroll_depth: { color: 'text-purple-400', bg: 'bg-purple-400/10' },
  form_submit: { color: 'text-[#00E676]', bg: 'bg-[#00E676]/10' },
  conversion: { color: 'text-[#00E676]', bg: 'bg-[#00E676]/10' },
  error: { color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' },
  session_start: { color: 'text-gray-400', bg: 'bg-gray-400/10' },
  session_end: { color: 'text-gray-400', bg: 'bg-gray-400/10' },
};

function EventTypeBadge({ type }: { type: string }) {
  const style = eventTypeColors[type] ?? { color: 'text-gray-400', bg: 'bg-gray-400/10' };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        style.bg,
        style.color,
      )}
    >
      {type}
    </span>
  );
}

function ThSortable({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="text-left px-4 py-3">
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer',
          active ? 'text-brand-premium' : 'text-gray-400 hover:text-gray-300',
        )}
      >
        {label}
        <ArrowDownUp className="h-3 w-3" />
      </button>
    </th>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}с`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}м ${sec}с`;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AdminAnalytics() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [period, setPeriod] = useState<Period>('7d');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Аналитика</h1>
          <p className="text-sm text-gray-400 mt-1">Трафик, конверсии, поведение пользователей</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                period === p.value
                  ? 'bg-brand-premium/15 text-brand-premium'
                  : 'text-gray-400 hover:text-white',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer',
                isActive
                  ? 'bg-brand-premium/10 text-brand-premium border border-brand-premium/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && <OverviewTab period={period} />}
        {activeTab === 'pages' && <PagesTab period={period} />}
        {activeTab === 'sources' && <SourcesTab period={period} />}
        {activeTab === 'devices' && <DevicesTab period={period} />}
        {activeTab === 'funnel' && <FunnelTab period={period} />}
        {activeTab === 'realtime' && <RealtimeTab />}
        {activeTab === 'events' && <EventsTab period={period} />}
      </div>
    </div>
  );
}
