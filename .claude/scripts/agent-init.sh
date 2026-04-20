#!/bin/bash
# agent-init.sh - Запуск AlgoBond Sentinel в tmux сессии
#
# Защиты:
#   - Abort если status=stopped/crashed (защита от случайного старта)
#   - Runner НЕ использует exec: если claude падает, bash остаётся живым
#     с sleep 60 -> tmux сессия не закрывается мгновенно, watchdog
#     не тарашит рестарты 2 раза/мин
#   - stderr claude -> /var/log/algobond/sentinel-YYYYMMDD.log (диагностика)

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

PROJECT_DIR="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade"
SESSION_NAME="algobond-agent"
COUNTER_FILE="/tmp/claude-autofix-failures"
LOG_DIR="/var/log/algobond"

redis() {
  docker exec algobond-redis redis-cli "$@" 2>/dev/null
}

# Защита: не запускаться если статус stopped/crashed (кроме случая когда
# вызов идёт от watchdog после команды start — watchdog уже почистил
# counter и готов к старту, но status ещё не сброшен; в этом случае
# init-у разрешается перезаписать статус).
# Здесь полагаемся на то что watchdog-start сам вызывает init после
# HSET status=starting или сброса — см. agent-watchdog.sh "start" branch.
STATUS=$(redis HGET algobond:agent:status status || echo "")
if [[ "$STATUS" == "stopped" || "$STATUS" == "crashed" ]]; then
  echo "[init] Status=$STATUS - abort. Используй UI Start или Redis 'command=start'."
  exit 0
fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[init] Session $SESSION_NAME already exists. Killing first..."
  tmux kill-session -t "$SESSION_NAME"
  sleep 2
fi

rm -f "$COUNTER_FILE" /tmp/claude-circuit-reset
mkdir -p "$LOG_DIR"

INCIDENT_LOG="$PROJECT_DIR/sentinel-state/incident-log.jsonl"
if [[ -f "$INCIDENT_LOG" ]]; then
  tail -1000 "$INCIDENT_LOG" > /tmp/incident-rotate && mv /tmp/incident-rotate "$INCIDENT_LOG"
fi

redis HSET algobond:agent:status status starting started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /dev/null || true

cd "$PROJECT_DIR"
tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50
sleep 1

# Runner: НЕ exec, stderr в файл. После смерти claude -
# sleep 60 чтобы не тарашить watchdog-рестарты (30с tick + 60с = 1.5 мин gap).
cat > /tmp/sentinel-run.sh << 'RUNNER'
#!/bin/bash
set -uo pipefail
cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade

LOG_DIR="/var/log/algobond"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sentinel-$(date -u +%Y%m%d).log"

PROMPT=$(cat .claude/scripts/sentinel-init-prompt.md)

echo "=== [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting claude (pid $$) ===" >> "$LOG_FILE"

# Важно: НЕ exec. Bash должен остаться живым чтобы watchdog не
# тарашил рестарт при смерти claude. stderr -> log, stdout тоже
# чтобы поймать startup-ошибки которые иногда идут в stdout.
claude --permission-mode acceptEdits "$PROMPT" >> "$LOG_FILE" 2>&1
EXIT=$?
echo "=== [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Claude exited with code $EXIT ===" >> "$LOG_FILE"
echo "=== Последние 50 строк вывода перед смертью: ===" >> "$LOG_FILE"

# Пауза: защищает от тарашки watchdog. Watchdog check #4 детектит
# что claude процесс умер -> kill session -> init снова. Без sleep
# rescue-цикл бы крутился каждые 30с, теперь минимум 60с между попытками.
sleep 60
RUNNER
chmod +x /tmp/sentinel-run.sh
tmux send-keys -t "$SESSION_NAME" "bash /tmp/sentinel-run.sh" Enter

echo "[init] Sentinel started in tmux session '$SESSION_NAME'"

# TG notification с throttle (используем ту же логику что в watchdog)
THROTTLE_KEY="algobond:agent:tg_throttle"
SET_RESULT=$(redis SET "$THROTTLE_KEY" "$(date -u +%s)" NX EX 600 || echo "")
if [[ "$SET_RESULT" == "OK" ]] && [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
  curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_ADMIN_CHAT_ID}" \
    -d "text=AlgoBond Sentinel запущен" \
    -d "parse_mode=HTML" > /dev/null 2>&1 || true
fi
