#!/bin/bash
# agent-watchdog.sh - Проверка здоровья Sentinel (каждые 30с через systemd timer)
#
# Защиты:
#   - TG alert throttle (1 сообщение / 10 мин через Redis NX+EX)
#   - Circuit breaker: ≥5 рестартов за 5 минут → status=crashed, остановка
#   - Команды start/stop из Redis (UI toggle)

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

SESSION_NAME="algobond-agent"
INIT_SCRIPT="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/.claude/scripts/agent-init.sh"
CRASH_THRESHOLD=5
CRASH_WINDOW_SEC=300
TG_THROTTLE_SEC=600

# Обёртка: docker exec в algobond-redis (реальный Redis AlgoBond).
# Host-овый redis-cli смотрит на FastPanel Redis — там stale данные, использовать нельзя.
redis() {
  docker exec algobond-redis redis-cli "$@" 2>/dev/null
}

# Telegram с throttle: одно сообщение не чаще чем раз в TG_THROTTLE_SEC.
# Ключ NX + EX гарантирует что только первый попавший успеет отправить.
send_tg_throttled() {
  local text="$1"
  local throttle_key="algobond:agent:tg_throttle"
  local set_result
  set_result=$(redis SET "$throttle_key" "$(date -u +%s)" NX EX "$TG_THROTTLE_SEC" || echo "")
  if [[ "$set_result" != "OK" ]]; then
    return 0
  fi
  if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TG_ADMIN_CHAT_ID}" \
      -d "text=$text" \
      -d "parse_mode=HTML" > /dev/null 2>&1 || true
  fi
}

# Circuit breaker: считаем рестарты в окне CRASH_WINDOW_SEC.
# Если превышен порог — переводим в crashed и прекращаем авто-рестарт.
register_restart_and_check_circuit() {
  local now
  now=$(date -u +%s)
  local count window_start
  count=$(redis GET algobond:agent:restart_count || echo "0")
  window_start=$(redis GET algobond:agent:restart_window_start || echo "0")

  if [[ "$count" == "" ]]; then count=0; fi
  if [[ "$window_start" == "" ]]; then window_start=0; fi

  if (( now - window_start > CRASH_WINDOW_SEC )); then
    # Окно истекло - сброс счётчика
    redis SET algobond:agent:restart_count 1 > /dev/null
    redis SET algobond:agent:restart_window_start "$now" > /dev/null
    return 0
  fi

  count=$((count + 1))
  redis SET algobond:agent:restart_count "$count" > /dev/null

  if (( count >= CRASH_THRESHOLD )); then
    redis HSET algobond:agent:status status crashed crashed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" crash_reason "restart_loop_${count}_in_${CRASH_WINDOW_SEC}s" > /dev/null
    send_tg_throttled "<b>Sentinel CRASH LOOP</b>%0A${count} рестартов за ${CRASH_WINDOW_SEC}с. Статус: crashed. Требуется ручное вмешательство: проверить <code>/var/log/algobond/</code> и перезапустить через UI."
    echo "[watchdog] Circuit breaker tripped: $count restarts in ${CRASH_WINDOW_SEC}s. Status=crashed."
    return 1
  fi
  return 0
}

# === 1. Проверка команд из Redis (UI toggle) ===
COMMAND=$(redis GET algobond:agent:command || echo "")

if [[ "$COMMAND" == "stop" ]]; then
  echo "[watchdog] Stop command received"
  redis DEL algobond:agent:command > /dev/null || true
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    tmux send-keys -t "$SESSION_NAME" "/quit" Enter
    sleep 30
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      tmux kill-session -t "$SESSION_NAME"
    fi
  fi
  redis HSET algobond:agent:status status stopped stopped_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" stopped_by ui > /dev/null || true
  redis DEL algobond:agent:restart_count algobond:agent:restart_window_start > /dev/null || true
  echo "[watchdog] Sentinel stopped by command"
  exit 0
fi

if [[ "$COMMAND" == "start" ]]; then
  echo "[watchdog] Start command received"
  redis DEL algobond:agent:command > /dev/null || true
  redis DEL algobond:agent:restart_count algobond:agent:restart_window_start > /dev/null || true
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    bash "$INIT_SCRIPT"
    echo "[watchdog] Sentinel started by command"
  else
    echo "[watchdog] Sentinel already running"
  fi
  exit 0
fi

# === 2. Проверка: агент должен быть running? ===
STATUS=$(redis HGET algobond:agent:status status || echo "stopped")

if [[ "$STATUS" == "stopped" || "$STATUS" == "crashed" ]]; then
  exit 0
fi

# === 3. Проверка tmux сессии ===
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[watchdog] Session '$SESSION_NAME' not found! Restarting..."
  if ! register_restart_and_check_circuit; then
    exit 0
  fi
  send_tg_throttled "Sentinel упал. Перезапуск (throttled, max 1 alert/${TG_THROTTLE_SEC}s)."
  bash "$INIT_SCRIPT"
  exit 0
fi

# === 4. Проверка claude процесса внутри tmux ===
PANE_PID=$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_pid}' 2>/dev/null | head -1)
if [[ -n "$PANE_PID" ]]; then
  if ! pgrep -P "$PANE_PID" -f "claude" > /dev/null 2>&1; then
    echo "[watchdog] claude process not found in tmux! Restarting..."
    if ! register_restart_and_check_circuit; then
      exit 0
    fi
    send_tg_throttled "Sentinel: claude процесс умер в tmux. Перезапуск (throttled)."
    tmux kill-session -t "$SESSION_NAME"
    sleep 2
    bash "$INIT_SCRIPT"
    exit 0
  fi
fi

exit 0
