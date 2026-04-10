#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

BLOCKED_PATTERNS=(
  "rm -rf"
  "DROP TABLE"
  "DROP DATABASE"
  "git push --force"
  "git reset --hard"
  "docker system prune"
  "cat .env"
  "echo.*BYBIT_API"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qi "$pattern"; then
    echo "Заблокировано: команда содержит '$pattern'" >&2
    exit 2
  fi
done

exit 0
