#!/bin/bash
# circuit-breaker.sh - Считает последовательные неудачи auto-fix
# Reset условия:
#   1. success: echo 0 > $COUNTER_FILE
#   2. session restart: agent-init.sh удаляет $COUNTER_FILE
#   3. TG /reset_circuit: создает $RESET_MARKER

COUNTER_FILE="/tmp/claude-autofix-failures"
RESET_MARKER="/tmp/claude-circuit-reset"
MAX_FAILURES=3

if [[ -f "$RESET_MARKER" ]]; then
  rm -f "$COUNTER_FILE" "$RESET_MARKER"
  echo "Circuit breaker сброшен по команде /reset_circuit" >&2
  exit 0
fi

current=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
current=$((current + 1))
echo "$current" > "$COUNTER_FILE"

if [ "$current" -ge "$MAX_FAILURES" ]; then
  if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TG_ADMIN_CHAT_ID}" \
      -d "text=🔴 Circuit Breaker: $current последовательных неудач auto-fix. Sentinel приостановлен. /reset_circuit для сброса." \
      -d "parse_mode=HTML" > /dev/null 2>&1
  fi
  rm -f "$COUNTER_FILE"
  exit 0
fi

exit 2
