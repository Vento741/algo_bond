import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
  Shield,
  Wrench,
  Zap,
} from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface SentinelStatus {
  status: string;
  started_at: string | null;
  monitors: string[];
  cron_jobs: string[];
  incidents_today: number;
  fixes_today: number;
  last_health_check: string | null;
  last_health_result: string | null;
}

interface SentinelIncident {
  ts: string;
  status: string;
  trace: string | null;
  hash: string | null;
  fix_commit: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function statusBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    stopped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
    starting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    restarting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return colors[status] ?? colors["stopped"];
}

function incidentBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    fixed: "bg-emerald-500/20 text-emerald-400",
    fixing: "bg-yellow-500/20 text-yellow-400",
    failed: "bg-red-500/20 text-red-400",
  };
  return colors[status] ?? "bg-zinc-500/20 text-zinc-400";
}

const MONITOR_LABELS: Record<string, string> = {
  api: "API Logs (auto-fix)",
  listener: "Listener Logs (alert-only)",
};

const CRON_LABELS: Record<string, string> = {
  health: "Health Check (*/5 min)",
  reconcile: "P&L Reconcile (23:50 UTC)",
  deps_audit: "Deps Audit (Sun 03:00)",
};

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
        {icon} {label}
      </div>
      <div className="text-xl font-bold font-mono" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SentinelSection() {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [incidents, setIncidents] = useState<SentinelIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, incidentsRes] = await Promise.all([
        api.get<SentinelStatus>("/admin/agent/status"),
        api.get<{ items: SentinelIncident[]; total: number }>(
          "/admin/agent/incidents?limit=10",
        ),
      ]);
      setStatus(statusRes.data);
      setIncidents(incidentsRes.data.items);
    } catch {
      setStatus({
        status: "stopped",
        started_at: null,
        monitors: [],
        cron_jobs: [],
        incidents_today: 0,
        fixes_today: 0,
        last_health_check: null,
        last_health_result: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggle = async (action: "start" | "stop") => {
    setToggling(true);
    try {
      await api.post(`/admin/agent/toggle?action=${action}`);
      setTimeout(fetchData, 2000);
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!status) return null;

  const isRunning = status.status === "running";

  return (
    <div className="space-y-6">
      {/* Header: Status + Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-zinc-400" />
          <span className="text-lg font-semibold text-zinc-100">
            AlgoBond Sentinel
          </span>
          <Badge className={statusBadgeClass(status.status)}>
            {status.status.toUpperCase()}
          </Badge>
          {status.started_at && isRunning && (
            <span className="text-sm text-zinc-500">
              Uptime: {formatUptime(status.started_at)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isRunning ? "destructive" : "default"}
                size="sm"
                disabled={toggling}
                className={
                  !isRunning ? "bg-emerald-600 hover:bg-emerald-500" : ""
                }
              >
                {toggling ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : isRunning ? (
                  <PowerOff className="h-4 w-4 mr-1" />
                ) : (
                  <Power className="h-4 w-4 mr-1" />
                )}
                {isRunning ? "Stop" : "Start"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isRunning ? "Остановить Sentinel?" : "Запустить Sentinel?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isRunning
                    ? "Мониторинг и auto-fix будут отключены. Health checks прекратятся."
                    : "Sentinel начнет мониторинг логов, auto-fix ошибок и health checks."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleToggle(isRunning ? "stop" : "start")}
                  className={
                    isRunning
                      ? "bg-red-600 hover:bg-red-500"
                      : "bg-emerald-600 hover:bg-emerald-500"
                  }
                >
                  {isRunning ? "Остановить" : "Запустить"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Incidents Today"
          value={status.incidents_today}
          color={status.incidents_today > 0 ? "#FF1744" : "#00E676"}
        />
        <StatCard
          icon={<Wrench className="h-4 w-4" />}
          label="Fixes Today"
          value={status.fixes_today}
          color={status.fixes_today > 0 ? "#00E676" : "#6b7280"}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Last Health"
          value={status.last_health_result?.toUpperCase() ?? "N/A"}
          color={status.last_health_result === "ok" ? "#00E676" : "#FF1744"}
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Monitors"
          value={status.monitors.length}
          color={status.monitors.length > 0 ? "#00E676" : "#6b7280"}
        />
      </div>

      {/* Monitors & Cron */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monitors */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4" /> Monitors
          </h3>
          <div className="space-y-2">
            {["api", "listener"].map((m) => (
              <div
                key={m}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-zinc-400">{MONITOR_LABELS[m] ?? m}</span>
                <Badge
                  className={
                    status.monitors.includes(m)
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-zinc-700/50 text-zinc-500"
                  }
                >
                  {status.monitors.includes(m) ? "ACTIVE" : "OFF"}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Cron Jobs */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Cron Jobs
          </h3>
          <div className="space-y-2">
            {["health", "reconcile", "deps_audit"].map((c) => (
              <div
                key={c}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-zinc-400">{CRON_LABELS[c] ?? c}</span>
                <Badge
                  className={
                    status.cron_jobs.includes(c)
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-zinc-700/50 text-zinc-500"
                  }
                >
                  {status.cron_jobs.includes(c) ? "ACTIVE" : "OFF"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">
          Recent Incidents
        </h3>
        {incidents.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">No incidents</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2 pr-4">Time</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2 pr-4">Error</th>
                  <th className="text-left py-2">Commit</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc, idx) => (
                  <tr key={idx} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap font-mono text-xs">
                      {new Date(inc.ts).toLocaleTimeString()}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge className={incidentBadgeClass(inc.status)}>
                        {inc.status}
                      </Badge>
                    </td>
                    <td
                      className="py-2 pr-4 text-zinc-300 max-w-xs truncate"
                      title={inc.trace ?? ""}
                    >
                      {inc.trace ? inc.trace.split("\n").pop() : "-"}
                    </td>
                    <td className="py-2 text-zinc-500 font-mono text-xs">
                      {inc.fix_commit ? inc.fix_commit.slice(0, 8) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
