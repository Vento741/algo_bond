import { useState, useEffect } from "react";
import { AlertTriangle, GitCommit, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

interface Incident {
  ts: string;
  status: string;
  trace: string | null;
  hash: string | null;
  fix_commit: string | null;
}

interface HealthEntry {
  timestamp: string;
  status: string;
  response_ms: number | null;
  details: string | null;
}

interface CommitEntry {
  sha: string;
  message: string;
  timestamp: string;
  files_changed: number | null;
}

type Tab = "incidents" | "health" | "commits";

function incidentBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    fixed: "bg-emerald-500/20 text-emerald-400",
    fixing: "bg-yellow-500/20 text-yellow-400",
    failed: "bg-red-500/20 text-red-400",
  };
  return colors[status] ?? "bg-zinc-500/20 text-zinc-400";
}

export default function SentinelTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("incidents");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [healthHistory, setHealthHistory] = useState<HealthEntry[]>([]);
  const [commits, setCommits] = useState<CommitEntry[]>([]);

  useEffect(() => {
    if (activeTab === "incidents") {
      api
        .get<{ items: Incident[]; total: number }>(
          "/admin/agent/incidents?limit=20",
        )
        .then((r) => setIncidents(r.data.items))
        .catch(() => {});
    } else if (activeTab === "health") {
      api
        .get<{ entries: HealthEntry[] }>("/admin/agent/health-history")
        .then((r) => setHealthHistory(r.data.entries))
        .catch(() => {});
    } else if (activeTab === "commits") {
      api
        .get<{ commits: CommitEntry[]; total: number }>("/admin/agent/commits")
        .then((r) => setCommits(r.data.commits))
        .catch(() => {});
    }
  }, [activeTab]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "incidents",
      label: "Incidents",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    {
      id: "health",
      label: "Health Timeline",
      icon: <Heart className="h-3.5 w-3.5" />,
    },
    {
      id: "commits",
      label: "Git Commits",
      icon: <GitCommit className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      {/* Tab buttons */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-zinc-100 border-b-2 border-emerald-500 -mb-px"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === "incidents" && (
          <>
            {incidents.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">
                No incidents
              </p>
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
          </>
        )}

        {activeTab === "health" && (
          <>
            {healthHistory.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">
                No health data
              </p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {healthHistory.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-500 font-mono text-xs w-16">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        entry.status === "ok" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    <span
                      className={
                        entry.status === "ok"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {entry.status.toUpperCase()}
                    </span>
                    {entry.response_ms != null && (
                      <span className="text-zinc-600 text-xs">
                        {entry.response_ms}ms
                      </span>
                    )}
                    {entry.details && (
                      <span className="text-zinc-500 text-xs">
                        {entry.details}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "commits" && (
          <>
            {commits.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">
                No commits
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {commits.map((commit, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm">
                    <span className="text-zinc-500 font-mono text-xs shrink-0">
                      {commit.sha.slice(0, 7)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 truncate">{commit.message}</p>
                      <p className="text-zinc-600 text-xs">
                        {new Date(commit.timestamp).toLocaleString()}
                        {commit.files_changed != null &&
                          ` - ${commit.files_changed} files`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
