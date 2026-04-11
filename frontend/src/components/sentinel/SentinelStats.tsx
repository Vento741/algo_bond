import {
  Activity,
  AlertTriangle,
  Clock,
  Coins,
  Shield,
  Wrench,
} from "lucide-react";

interface SentinelStatsProps {
  incidentsToday: number;
  fixesToday: number;
  lastHealthResult: string | null;
  monitorsCount: number;
  tokensToday: number;
  pendingApprovals: number;
}

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

export default function SentinelStats({
  incidentsToday,
  fixesToday,
  lastHealthResult,
  monitorsCount,
  tokensToday,
  pendingApprovals,
}: SentinelStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatCard
        icon={<AlertTriangle className="h-4 w-4" />}
        label="Incidents"
        value={incidentsToday}
        color={incidentsToday > 0 ? "#FF1744" : "#00E676"}
      />
      <StatCard
        icon={<Wrench className="h-4 w-4" />}
        label="Fixes"
        value={fixesToday}
        color={fixesToday > 0 ? "#00E676" : "#6b7280"}
      />
      <StatCard
        icon={<Activity className="h-4 w-4" />}
        label="Health"
        value={lastHealthResult?.toUpperCase() ?? "N/A"}
        color={lastHealthResult === "ok" ? "#00E676" : "#FF1744"}
      />
      <StatCard
        icon={<Shield className="h-4 w-4" />}
        label="Monitors"
        value={monitorsCount}
        color={monitorsCount > 0 ? "#00E676" : "#6b7280"}
      />
      <StatCard
        icon={<Coins className="h-4 w-4" />}
        label="Tokens"
        value={
          tokensToday > 1000
            ? `${Math.round(tokensToday / 1000)}K`
            : tokensToday
        }
        color={tokensToday > 500000 ? "#FF1744" : "#6b7280"}
      />
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        label="Pending"
        value={pendingApprovals}
        color={pendingApprovals > 0 ? "#FFD700" : "#6b7280"}
      />
    </div>
  );
}
