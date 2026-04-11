import { Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SentinelMonitorsProps {
  monitors: string[];
  cronJobs: string[];
  onCommand: (cmd: string) => void;
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

export default function SentinelMonitors({
  monitors,
  cronJobs,
  onCommand,
}: SentinelMonitorsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Monitors */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" /> Monitors
        </h3>
        <div className="space-y-2">
          {["api", "listener"].map((m) => (
            <div key={m} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{MONITOR_LABELS[m] ?? m}</span>
              <Badge
                className={
                  monitors.includes(m)
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-zinc-700/50 text-zinc-500"
                }
              >
                {monitors.includes(m) ? "ACTIVE" : "OFF"}
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
            <div key={c} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{CRON_LABELS[c] ?? c}</span>
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    cronJobs.includes(c)
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-zinc-700/50 text-zinc-500"
                  }
                >
                  {cronJobs.includes(c) ? "ACTIVE" : "OFF"}
                </Badge>
                {c === "health" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300"
                    onClick={() => onCommand("health_check")}
                  >
                    Force
                  </Button>
                )}
                {c === "reconcile" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300"
                    onClick={() => onCommand("reconcile")}
                  >
                    Run
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
