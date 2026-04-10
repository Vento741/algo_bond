#!/bin/bash
# agent-restart.sh - Graceful restart Sentinel (context rotation, каждые 12ч)

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

SESSION_NAME="algobond-agent"
INIT_SCRIPT="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/.claude/scripts/agent-init.sh"

echo "[restart] $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting graceful restart..."

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[restart] Sending /quit to Sentinel..."
  tmux send-keys -t "$SESSION_NAME" "/quit" Enter
  echo "[restart] Waiting 30s for graceful shutdown..."
  sleep 30
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[restart] Still alive after 30s, killing session..."
    tmux kill-session -t "$SESSION_NAME"
    sleep 3
  fi
else
  echo "[restart] No active session found"
fi

redis-cli HSET algobond:agent:status status restarting > /dev/null 2>&1 || true

echo "[restart] Starting fresh session..."
sleep 5
bash "$INIT_SCRIPT"

echo "[restart] Restart complete"
