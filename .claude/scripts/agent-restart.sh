#!/bin/bash
# agent-restart.sh - Graceful restart Sentinel (context rotation, каждые 12ч через cron)
#
# Защита: НЕ рестартить если status=stopped/crashed. Раньше cron тарашил
# Sentinel каждые 12 часов независимо от того, остановлен ли он вручную.

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

SESSION_NAME="algobond-agent"
INIT_SCRIPT="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/.claude/scripts/agent-init.sh"

redis() {
  docker exec algobond-redis redis-cli "$@" 2>/dev/null
}

STATUS=$(redis HGET algobond:agent:status status || echo "")
if [[ "$STATUS" == "stopped" || "$STATUS" == "crashed" ]]; then
  echo "[restart] $(date -u +%Y-%m-%dT%H:%M:%SZ) Status=$STATUS - пропускаем cron-рестарт"
  exit 0
fi

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

redis HSET algobond:agent:status status restarting > /dev/null || true
# Сброс circuit breaker: плановый рестарт - не крэш
redis DEL algobond:agent:restart_count algobond:agent:restart_window_start > /dev/null || true

echo "[restart] Starting fresh session..."
sleep 5
bash "$INIT_SCRIPT"

echo "[restart] Restart complete"
