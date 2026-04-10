#!/bin/bash
COUNTER_FILE="/tmp/claude-autofix-failures"
MAX_FAILURES=3

current=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
current=$((current + 1))
echo "$current" > "$COUNTER_FILE"

if [ "$current" -ge "$MAX_FAILURES" ]; then
  curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_ADMIN_CHAT_ID}" \
    -d "text=🔴 Circuit Breaker: $current последовательных неудач auto-fix. Требуется ручное вмешательство." \
    -d "parse_mode=HTML" > /dev/null
  rm -f "$COUNTER_FILE"
  exit 0
fi

exit 2
