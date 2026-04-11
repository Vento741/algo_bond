import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useSentinelChat } from "@/hooks/useSentinelChat";
import SentinelHeader from "@/components/sentinel/SentinelHeader";
import SentinelStats from "@/components/sentinel/SentinelStats";
import SentinelMonitors from "@/components/sentinel/SentinelMonitors";
import SentinelChat from "@/components/sentinel/SentinelChat";
import SentinelTabs from "@/components/sentinel/SentinelTabs";

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

interface AgentConfig {
  mode: "auto" | "supervised";
  health_interval_minutes: number;
  auto_deploy: boolean;
  max_fix_attempts: number;
}

interface TokenUsage {
  tokens_today: number;
  tokens_limit: number;
}

export default function SentinelSection() {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [tokens, setTokens] = useState<TokenUsage>({
    tokens_today: 0,
    tokens_limit: 1000000,
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const { messages, connected, reconnecting, sendMessage, loadHistory } =
    useSentinelChat();

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, configRes, tokensRes, approvalsRes] = await Promise.all(
        [
          api.get<SentinelStatus>("/admin/agent/status"),
          api.get<AgentConfig>("/admin/agent/config"),
          api.get<TokenUsage>("/admin/agent/tokens"),
          api.get<{ items: unknown[]; total: number }>(
            "/admin/agent/approvals",
          ),
        ],
      );
      setStatus(statusRes.data);
      setConfig(configRes.data);
      setTokens(tokensRes.data);
      setPendingCount(approvalsRes.data.total);
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
      setConfig({
        mode: "auto",
        health_interval_minutes: 5,
        auto_deploy: true,
        max_fix_attempts: 3,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load chat history on mount
  useEffect(() => {
    api
      .get<{
        messages: Array<{
          id: string;
          type: string;
          content: string;
          timestamp: string;
          metadata?: Record<string, unknown> | null;
        }>;
        total: number;
      }>("/admin/agent/chat/history?limit=100")
      .then((r) => {
        loadHistory(r.data.messages as Parameters<typeof loadHistory>[0]);
      })
      .catch(() => {});
  }, [loadHistory]);

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

  const handleModeChange = async (mode: "auto" | "supervised") => {
    try {
      const res = await api.put<AgentConfig>("/admin/agent/config", { mode });
      setConfig(res.data);
    } catch {
      // ignore
    }
  };

  const handleCommand = async (cmd: string) => {
    try {
      await api.post("/admin/agent/command", { command: cmd });
    } catch {
      // ignore
    }
  };

  const handleApproval = async (
    approvalId: string,
    decision: "approve" | "reject",
  ) => {
    try {
      await api.post("/admin/agent/approval", {
        approval_id: approvalId,
        decision,
      });
      setPendingCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!status || !config) return null;

  return (
    <div className="space-y-6">
      <SentinelHeader
        status={status.status}
        startedAt={status.started_at}
        mode={config.mode}
        toggling={toggling}
        onToggle={handleToggle}
        onRefresh={fetchData}
        onModeChange={handleModeChange}
        onCommand={handleCommand}
      />

      <SentinelStats
        incidentsToday={status.incidents_today}
        fixesToday={status.fixes_today}
        lastHealthResult={status.last_health_result}
        monitorsCount={status.monitors.length}
        tokensToday={tokens.tokens_today}
        pendingApprovals={pendingCount}
      />

      <SentinelMonitors
        monitors={status.monitors}
        cronJobs={status.cron_jobs}
        onCommand={handleCommand}
      />

      <SentinelChat
        messages={messages}
        connected={connected}
        reconnecting={reconnecting}
        onSend={sendMessage}
        onApproval={handleApproval}
      />

      <SentinelTabs />
    </div>
  );
}
