#!/bin/bash
# agent-init.sh - Запуск AlgoBond Sentinel в tmux сессии

set -euo pipefail

if [[ -f /opt/algobond/.env ]]; then
  set -a
  source /opt/algobond/.env
  set +a
fi

PROJECT_DIR="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade"
SESSION_NAME="algobond-agent"
INIT_PROMPT="$PROJECT_DIR/.claude/scripts/sentinel-init-prompt.md"
COUNTER_FILE="/tmp/claude-autofix-failures"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[init] Session $SESSION_NAME already exists. Killing first..."
  tmux kill-session -t "$SESSION_NAME"
  sleep 2
fi

rm -f "$COUNTER_FILE" /tmp/claude-circuit-reset

INCIDENT_LOG="$PROJECT_DIR/.claude/state/incident-log.jsonl"
if [[ -f "$INCIDENT_LOG" ]]; then
  tail -1000 "$INCIDENT_LOG" > /tmp/incident-rotate && mv /tmp/incident-rotate "$INCIDENT_LOG"
fi

redis-cli HSET algobond:agent:status status starting started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /dev/null 2>&1 || true

cd "$PROJECT_DIR"
tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50
sleep 1

# Создаем runner-скрипт (tmux send-keys не справляется с длинными командами)
cat > /tmp/sentinel-run.sh << 'RUNNER'
#!/bin/bash
cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade
cat .claude/scripts/sentinel-init-prompt.md | claude -p \
  --allowedTools 'Bash(*)' 'Read(*)' 'Write(*)' 'Edit(*)' 'Glob(*)' 'Grep(*)'
RUNNER
chmod +x /tmp/sentinel-run.sh
tmux send-keys -t "$SESSION_NAME" "bash /tmp/sentinel-run.sh" Enter

echo "[init] Sentinel started in tmux session '$SESSION_NAME'"

if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
  curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_ADMIN_CHAT_ID}" \
    -d "text=AlgoBond Sentinel запущен" \
    -d "parse_mode=HTML" > /dev/null 2>&1 || true
fi
