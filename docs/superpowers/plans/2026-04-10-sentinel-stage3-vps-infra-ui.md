# AlgoBond Sentinel - Stage 3: VPS Infra + UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VPS infrastructure (systemd, watchdog, cron) for Sentinel lifecycle + UI section in AdminSystem page for monitoring and toggle control.

**Architecture:** Shell scripts for agent lifecycle (init, restart, watchdog). systemd timer fires watchdog every 30s. Cron restarts agent every 12h for context rotation. Frontend adds "Sentinel" tab to existing AdminSystem.tsx page with toggle, status, incidents table.

**Tech Stack:** Bash, systemd, cron, React, TypeScript, Shadcn/UI, Zustand

**Spec:** `docs/superpowers/specs/2026-04-10-autonomous-agent-monitor-design.md` (Sections 7-8)

**Dependencies:** Stage 1 (hooks, scripts) and Stage 2 (API endpoints) must be completed first.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `.claude/scripts/agent-init.sh` | Start tmux + claude session |
| Create | `.claude/scripts/agent-restart.sh` | Graceful 12h restart |
| Create | `.claude/scripts/agent-watchdog.sh` | Systemd watchdog (30s) |
| Create | `deploy/systemd/algobond-agent-watchdog.timer` | Timer unit (30s) |
| Create | `deploy/systemd/algobond-agent-watchdog.service` | Service unit |
| Create | `deploy/opt-algobond-env.example` | Example .env for /opt/algobond/ |
| Modify | `frontend/src/pages/admin/AdminSystem.tsx` | Add Sentinel tab |
| Create | `frontend/src/pages/admin/SentinelSection.tsx` | Sentinel UI component |
| Modify | `frontend/src/lib/api.ts` | Add sentinel API methods (if not using raw api.get) |

---

### Task 1: agent-init.sh - Start Sentinel Session

**Files:**
- Create: `.claude/scripts/agent-init.sh`

- [ ] **Step 1: Create agent-init.sh**

```bash
#!/bin/bash
# agent-init.sh - Запуск AlgoBond Sentinel в tmux сессии
# Вызывается: watchdog (при падении) или agent-restart.sh (12h rotation)

set -euo pipefail

# Загрузить переменные
if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

PROJECT_DIR="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade"
SESSION_NAME="algobond-agent"
INIT_PROMPT="$PROJECT_DIR/.claude/scripts/sentinel-init-prompt.md"
COUNTER_FILE="/tmp/claude-autofix-failures"

# Проверка: tmux сессия уже существует?
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[init] Session $SESSION_NAME already exists. Killing first..."
  tmux kill-session -t "$SESSION_NAME"
  sleep 2
fi

# Сброс circuit breaker при каждом старте
rm -f "$COUNTER_FILE" /tmp/claude-circuit-reset

# Ротация incident-log
INCIDENT_LOG="$PROJECT_DIR/.claude/state/incident-log.jsonl"
if [[ -f "$INCIDENT_LOG" ]]; then
  tail -1000 "$INCIDENT_LOG" > /tmp/incident-rotate && mv /tmp/incident-rotate "$INCIDENT_LOG"
fi

# Обновить Redis: status=starting
redis-cli HSET algobond:agent:status status starting started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /dev/null 2>&1 || true

# Создать tmux сессию и запустить claude
cd "$PROJECT_DIR"
tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50

# Подождать создание сессии
sleep 1

# Отправить команду запуска claude с init prompt
PROMPT_CONTENT=$(cat "$INIT_PROMPT")
tmux send-keys -t "$SESSION_NAME" "cd $PROJECT_DIR && claude --resume 'AlgoBond Sentinel' <<'SENTINEL_INIT'
$PROMPT_CONTENT
SENTINEL_INIT" Enter

echo "[init] Sentinel started in tmux session '$SESSION_NAME'"

# TG уведомление
if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
  curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_ADMIN_CHAT_ID}" \
    -d "text=🟢 AlgoBond Sentinel запущен" \
    -d "parse_mode=HTML" > /dev/null 2>&1 || true
fi
```

- [ ] **Step 2: Make executable**

Run: `chmod +x .claude/scripts/agent-init.sh`

- [ ] **Step 3: Commit**

```bash
git add .claude/scripts/agent-init.sh
git commit -m "feat(sentinel): agent-init.sh for tmux session startup"
```

---

### Task 2: agent-restart.sh - Graceful 12h Restart

**Files:**
- Create: `.claude/scripts/agent-restart.sh`

- [ ] **Step 1: Create agent-restart.sh**

```bash
#!/bin/bash
# agent-restart.sh - Graceful restart Sentinel (context rotation, каждые 12ч)
# Вызывается: cron */12

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

SESSION_NAME="algobond-agent"
INIT_SCRIPT="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/.claude/scripts/agent-init.sh"

echo "[restart] $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting graceful restart..."

# 1. Отправить /quit в tmux
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[restart] Sending /quit to Sentinel..."
  tmux send-keys -t "$SESSION_NAME" "/quit" Enter

  # 2. Ждать graceful shutdown (30с)
  echo "[restart] Waiting 30s for graceful shutdown..."
  sleep 30

  # 3. Если ещё жив - force kill
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[restart] Still alive after 30s, killing session..."
    tmux kill-session -t "$SESSION_NAME"
    sleep 3
  fi
else
  echo "[restart] No active session found"
fi

# 4. Обновить Redis
redis-cli HSET algobond:agent:status status restarting > /dev/null 2>&1 || true

# 5. Запуск нового
echo "[restart] Starting fresh session..."
sleep 5
bash "$INIT_SCRIPT"

echo "[restart] Restart complete"
```

- [ ] **Step 2: Make executable**

Run: `chmod +x .claude/scripts/agent-restart.sh`

- [ ] **Step 3: Commit**

```bash
git add .claude/scripts/agent-restart.sh
git commit -m "feat(sentinel): agent-restart.sh for 12h context rotation"
```

---

### Task 3: agent-watchdog.sh - Systemd Watchdog

**Files:**
- Create: `.claude/scripts/agent-watchdog.sh`

- [ ] **Step 1: Create agent-watchdog.sh**

```bash
#!/bin/bash
# agent-watchdog.sh - Проверка здоровья Sentinel (каждые 30с через systemd timer)
# Проверяет: tmux сессия, claude процесс, Redis команды (start/stop)

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

SESSION_NAME="algobond-agent"
INIT_SCRIPT="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/.claude/scripts/agent-init.sh"

# === 1. Проверка команд из Redis (UI toggle) ===
COMMAND=$(redis-cli GET algobond:agent:command 2>/dev/null || echo "")

if [[ "$COMMAND" == "stop" ]]; then
  echo "[watchdog] Stop command received"
  redis-cli DEL algobond:agent:command > /dev/null 2>&1 || true

  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    tmux send-keys -t "$SESSION_NAME" "/quit" Enter
    sleep 30
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      tmux kill-session -t "$SESSION_NAME"
    fi
  fi

  redis-cli HSET algobond:agent:status status stopped > /dev/null 2>&1 || true
  echo "[watchdog] Sentinel stopped by command"
  exit 0
fi

if [[ "$COMMAND" == "start" ]]; then
  echo "[watchdog] Start command received"
  redis-cli DEL algobond:agent:command > /dev/null 2>&1 || true

  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    bash "$INIT_SCRIPT"
    echo "[watchdog] Sentinel started by command"
  else
    echo "[watchdog] Sentinel already running"
  fi
  exit 0
fi

# === 2. Проверка: агент должен быть running? ===
STATUS=$(redis-cli HGET algobond:agent:status status 2>/dev/null || echo "stopped")

if [[ "$STATUS" == "stopped" ]]; then
  # Агент намеренно остановлен, не перезапускать
  exit 0
fi

# === 3. Проверка tmux сессии ===
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[watchdog] Session '$SESSION_NAME' not found! Restarting..."

  # TG алерт
  if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TG_ADMIN_CHAT_ID}" \
      -d "text=⚠️ Sentinel упал! Перезапуск..." \
      -d "parse_mode=HTML" > /dev/null 2>&1 || true
  fi

  bash "$INIT_SCRIPT"
  exit 0
fi

# === 4. Проверка claude процесса внутри tmux ===
PANE_PID=$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_pid}' 2>/dev/null | head -1)
if [[ -n "$PANE_PID" ]]; then
  # Проверяем что claude запущен как child process
  if ! pgrep -P "$PANE_PID" -f "claude" > /dev/null 2>&1; then
    echo "[watchdog] claude process not found in tmux! Restarting..."

    if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
      curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${TG_ADMIN_CHAT_ID}" \
        -d "text=⚠️ Claude процесс не найден в tmux. Перезапуск..." \
        -d "parse_mode=HTML" > /dev/null 2>&1 || true
    fi

    tmux kill-session -t "$SESSION_NAME"
    sleep 2
    bash "$INIT_SCRIPT"
    exit 0
  fi
fi

# Всё ОК - молчим
exit 0
```

- [ ] **Step 2: Make executable**

Run: `chmod +x .claude/scripts/agent-watchdog.sh`

- [ ] **Step 3: Commit**

```bash
git add .claude/scripts/agent-watchdog.sh
git commit -m "feat(sentinel): watchdog script for tmux/claude health monitoring"
```

---

### Task 4: Systemd Units

**Files:**
- Create: `deploy/systemd/algobond-agent-watchdog.timer`
- Create: `deploy/systemd/algobond-agent-watchdog.service`
- Create: `deploy/opt-algobond-env.example`

These are templates to be installed on VPS. Not auto-deployed.

- [ ] **Step 1: Create deploy directory**

Run: `mkdir -p deploy/systemd`

- [ ] **Step 2: Create timer unit**

```ini
# algobond-agent-watchdog.timer
# Установка: sudo cp deploy/systemd/*.timer deploy/systemd/*.service /etc/systemd/system/
#             sudo systemctl daemon-reload
#             sudo systemctl enable --now algobond-agent-watchdog.timer
[Unit]
Description=AlgoBond Sentinel Watchdog Timer

[Timer]
OnBootSec=60
OnUnitActiveSec=30
AccuracySec=5

[Install]
WantedBy=timers.target
```

- [ ] **Step 3: Create service unit**

```ini
# algobond-agent-watchdog.service
[Unit]
Description=AlgoBond Sentinel Watchdog
After=network.target redis.service docker.service

[Service]
Type=oneshot
User=root
EnvironmentFile=/opt/algobond/.env
ExecStart=/opt/algobond/agent-watchdog.sh
TimeoutStartSec=120
```

- [ ] **Step 4: Create env example**

```bash
# /opt/algobond/.env.example
# Скопировать как /opt/algobond/.env и заполнить реальными значениями
TG_BOT_TOKEN=<from-telegram-botfather>
TG_ADMIN_CHAT_ID=<your-chat-id>
AGENT_SECRET=<random-64-hex: openssl rand -hex 32>
```

- [ ] **Step 5: Commit**

```bash
git add deploy/
git commit -m "feat(sentinel): systemd units and env example for VPS"
```

---

### Task 5: SentinelSection.tsx - UI Component

**Files:**
- Create: `frontend/src/pages/admin/SentinelSection.tsx`

Standalone component for the Sentinel tab in AdminSystem. Shows: toggle, status, monitors, cron, stats, incidents table. Polls every 30s.

- [ ] **Step 1: Create SentinelSection.tsx**

```tsx
import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    running: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    stopped: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    starting: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    restarting: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };
  return colors[status] || colors.stopped;
}

function incidentStatusBadge(status: string) {
  const colors: Record<string, string> = {
    fixed: 'bg-emerald-500/20 text-emerald-400',
    fixing: 'bg-yellow-500/20 text-yellow-400',
    failed: 'bg-red-500/20 text-red-400',
  };
  return colors[status] || 'bg-zinc-500/20 text-zinc-400';
}

const MONITOR_LABELS: Record<string, string> = {
  api: 'API Logs (auto-fix)',
  listener: 'Listener Logs (alert-only)',
};

const CRON_LABELS: Record<string, string> = {
  health: 'Health Check (*/5 min)',
  reconcile: 'P&L Reconcile (23:50 UTC)',
  deps_audit: 'Deps Audit (Sun 03:00)',
};

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
        api.get('/api/admin/agent/status'),
        api.get('/api/admin/agent/incidents?limit=10'),
      ]);
      setStatus(statusRes.data);
      setIncidents(incidentsRes.data.items);
    } catch {
      // Если API не отвечает, показываем stopped
      setStatus({ status: 'stopped', started_at: null, monitors: [], cron_jobs: [], incidents_today: 0, fixes_today: 0, last_health_check: null, last_health_result: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggle = async (action: 'start' | 'stop') => {
    setToggling(true);
    try {
      await api.post(`/api/admin/agent/toggle?action=${action}`);
      // Подождать и обновить
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

  const isRunning = status.status === 'running';

  return (
    <div className="space-y-6">
      {/* Header: Status + Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-zinc-400" />
          <span className="text-lg font-semibold text-zinc-100">AlgoBond Sentinel</span>
          <Badge className={statusBadge(status.status)}>
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
                variant={isRunning ? 'destructive' : 'default'}
                size="sm"
                disabled={toggling}
                className={!isRunning ? 'bg-emerald-600 hover:bg-emerald-500' : ''}
              >
                {toggling ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : isRunning ? (
                  <PowerOff className="h-4 w-4 mr-1" />
                ) : (
                  <Power className="h-4 w-4 mr-1" />
                )}
                {isRunning ? 'Stop' : 'Start'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isRunning ? 'Остановить Sentinel?' : 'Запустить Sentinel?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isRunning
                    ? 'Мониторинг и auto-fix будут отключены. Health checks прекратятся.'
                    : 'Sentinel начнет мониторинг логов, auto-fix ошибок и health checks.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleToggle(isRunning ? 'stop' : 'start')}
                  className={isRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}
                >
                  {isRunning ? 'Остановить' : 'Запустить'}
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
          color={status.incidents_today > 0 ? '#FF1744' : '#00E676'}
        />
        <StatCard
          icon={<Wrench className="h-4 w-4" />}
          label="Fixes Today"
          value={status.fixes_today}
          color={status.fixes_today > 0 ? '#00E676' : '#6b7280'}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Last Health"
          value={status.last_health_result?.toUpperCase() || 'N/A'}
          color={status.last_health_result === 'ok' ? '#00E676' : '#FF1744'}
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Monitors"
          value={status.monitors.length}
          color={status.monitors.length > 0 ? '#00E676' : '#6b7280'}
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
            {['api', 'listener'].map((m) => (
              <div key={m} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{MONITOR_LABELS[m] || m}</span>
                <Badge className={status.monitors.includes(m) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700/50 text-zinc-500'}>
                  {status.monitors.includes(m) ? 'ACTIVE' : 'OFF'}
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
            {['health', 'reconcile', 'deps_audit'].map((c) => (
              <div key={c} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{CRON_LABELS[c] || c}</span>
                <Badge className={status.cron_jobs.includes(c) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700/50 text-zinc-500'}>
                  {status.cron_jobs.includes(c) ? 'ACTIVE' : 'OFF'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Recent Incidents</h3>
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
                      <Badge className={incidentStatusBadge(inc.status)}>
                        {inc.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-zinc-300 max-w-xs truncate" title={inc.trace || ''}>
                      {inc.trace ? inc.trace.split('\n').pop() : '-'}
                    </td>
                    <td className="py-2 text-zinc-500 font-mono text-xs">
                      {inc.fix_commit ? inc.fix_commit.slice(0, 8) : '-'}
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

// ---------------------------------------------------------------------------
// Sub-components
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/SentinelSection.tsx
git commit -m "feat(sentinel): SentinelSection UI component"
```

---

### Task 6: Add Sentinel Tab to AdminSystem.tsx

**Files:**
- Modify: `frontend/src/pages/admin/AdminSystem.tsx`

Add a "sentinel" tab to the existing tabs in AdminSystem page. Import and render SentinelSection.

- [ ] **Step 1: Add import**

At the top of `frontend/src/pages/admin/AdminSystem.tsx`, after the existing imports, add:

```tsx
import SentinelSection from './SentinelSection';
```

Also add `Bot` to the lucide-react imports (it's already imported, so verify it's there).

- [ ] **Step 2: Add TabsTrigger**

In the `<TabsList>` section (around line 616-648), add a new trigger before the closing `</TabsList>`:

```tsx
          <TabsTrigger value="sentinel">
            <Bot className="mr-1 h-4 w-4" /> Sentinel
          </TabsTrigger>
```

- [ ] **Step 3: Add TabsContent**

After the last `</TabsContent>` block (config tab), add:

```tsx
        <TabsContent value="sentinel">
          <SentinelSection />
        </TabsContent>
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to SentinelSection

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminSystem.tsx
git commit -m "feat(sentinel): add Sentinel tab to AdminSystem page"
```

---

### Task 7: VPS Deployment Instructions

**Files:**
- Create: `deploy/SENTINEL-SETUP.md`

Step-by-step instructions for setting up Sentinel on VPS. Not code, but essential for Stage 3.

- [ ] **Step 1: Create setup guide**

```markdown
# AlgoBond Sentinel - VPS Setup Guide

## Prerequisites

- tmux installed: `apt install tmux`
- Claude Code CLI installed with Max plan
- Redis running (already part of docker compose)

## 1. Create /opt/algobond/

```bash
sudo mkdir -p /opt/algobond
sudo cp .claude/scripts/agent-watchdog.sh /opt/algobond/
sudo cp .claude/scripts/agent-restart.sh /opt/algobond/
sudo chmod +x /opt/algobond/*.sh
```

## 2. Configure .env

```bash
sudo cp deploy/opt-algobond-env.example /opt/algobond/.env
sudo nano /opt/algobond/.env
# Fill: TG_BOT_TOKEN, TG_ADMIN_CHAT_ID, AGENT_SECRET
sudo chmod 600 /opt/algobond/.env
```

## 3. Install systemd units

```bash
sudo cp deploy/systemd/algobond-agent-watchdog.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable algobond-agent-watchdog.timer
sudo systemctl start algobond-agent-watchdog.timer
```

## 4. Setup cron (12h restart)

```bash
crontab -e
# Add:
0 */12 * * * /opt/algobond/agent-restart.sh >> /var/log/algobond-restart.log 2>&1
```

## 5. Add AGENT_SECRET to backend .env

```bash
# In the project's .env file, add:
AGENT_SECRET=<same value as /opt/algobond/.env>
```

## 6. First launch

```bash
cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade
bash .claude/scripts/agent-init.sh
```

## 7. Verify

```bash
tmux attach -t algobond-agent    # See the session
redis-cli HGETALL algobond:agent:status  # Check status
systemctl status algobond-agent-watchdog.timer  # Timer active
```

## Troubleshooting

- Check logs: `journalctl -u algobond-agent-watchdog.service -n 50`
- Manual restart: `bash .claude/scripts/agent-restart.sh`
- Force stop: `tmux kill-session -t algobond-agent && redis-cli HSET algobond:agent:status status stopped`
```

- [ ] **Step 2: Commit**

```bash
git add deploy/SENTINEL-SETUP.md
git commit -m "docs(sentinel): VPS setup guide for Sentinel deployment"
```

---

### Task 8: Full Integration Verification

- [ ] **Step 1: Run backend tests**

Run: `cd backend && python -m pytest tests/ -v --timeout=120 --ignore=tests/test_backtest.py --ignore=tests/test_bybit_listener.py`
Expected: All tests PASS

- [ ] **Step 2: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify file structure**

Run: `ls -la .claude/scripts/ deploy/systemd/ frontend/src/pages/admin/SentinelSection.tsx`
Expected: All files exist

- [ ] **Step 4: Final commit**

```bash
git add -A && git status
git commit -m "feat(sentinel): Stage 3 complete - VPS infra and admin UI"
```
