#!/bin/bash
# agent-watchdog.sh - Проверка здоровья Sentinel (каждые 30с через systemd timer)

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

SESSION_NAME="algobond-agent"
INIT_SCRIPT="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/.claude/scripts/agent-init.sh"

# === 1. Проверка команд из Redis (UI toggle) ===
COMMAND=$(docker exec algobond-redis redis-cli GET algobond:agent:command 2>/dev/null || echo "")

if [[ "$COMMAND" == "stop" ]]; then
  echo "[watchdog] Stop command received"
  docker exec algobond-redis redis-cli DEL algobond:agent:command > /dev/null 2>&1 || true
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    tmux send-keys -t "$SESSION_NAME" "/quit" Enter
    sleep 30
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      tmux kill-session -t "$SESSION_NAME"
    fi
  fi
  docker exec algobond-redis redis-cli HSET algobond:agent:status status stopped > /dev/null 2>&1 || true
  echo "[watchdog] Sentinel stopped by command"
  exit 0
fi

if [[ "$COMMAND" == "start" ]]; then
  echo "[watchdog] Start command received"
  docker exec algobond-redis redis-cli DEL algobond:agent:command > /dev/null 2>&1 || true
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    bash "$INIT_SCRIPT"
    echo "[watchdog] Sentinel started by command"
  else
    echo "[watchdog] Sentinel already running"
  fi
  exit 0
fi

# === 2. Проверка: агент должен быть running? ===
STATUS=$(docker exec algobond-redis redis-cli HGET algobond:agent:status status 2>/dev/null || echo "stopped")

if [[ "$STATUS" == "stopped" ]]; then
  exit 0
fi

# === 3. Проверка tmux сессии ===
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[watchdog] Session '$SESSION_NAME' not found! Restarting..."
  if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TG_ADMIN_CHAT_ID}" \
      -d "text=Sentinel упал! Перезапуск..." \
      -d "parse_mode=HTML" > /dev/null 2>&1 || true
  fi
  bash "$INIT_SCRIPT"
  exit 0
fi

# === 4. Проверка claude процесса внутри tmux ===
PANE_PID=$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_pid}' 2>/dev/null | head -1)
if [[ -n "$PANE_PID" ]]; then
  if ! pgrep -P "$PANE_PID" -f "claude" > /dev/null 2>&1; then
    echo "[watchdog] claude process not found in tmux! Restarting..."
    if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
      curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${TG_ADMIN_CHAT_ID}" \
        -d "text=Claude процесс не найден в tmux. Перезапуск..." \
        -d "parse_mode=HTML" > /dev/null 2>&1 || true
    fi
    tmux kill-session -t "$SESSION_NAME"
    sleep 2
    bash "$INIT_SCRIPT"
    exit 0
  fi
fi

exit 0
