#!/bin/bash
# safety-guard.sh - Блокирует опасные Bash-команды
# PreToolUse для Bash
# Exit 0 = разрешить, Exit 2 = заблокировать

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [[ -z "$CMD" ]]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# === 1. Абсолютно запрещенные команды ===
BLOCKED_PATTERNS=(
  "rm -rf /"
  "rm -rf ~"
  "DROP TABLE"
  "DROP DATABASE"
  "docker system prune"
  "cat .env"
  "echo.*BYBIT_API"
  "echo.*JWT_SECRET"
  "echo.*ENCRYPTION_KEY"
  "echo.*AGENT_SECRET"
  "echo.*TG_BOT_TOKEN"
  "mkfs"
  "dd if="
  ":(){ :|:& };:"
  "chmod -R 777"
  "curl.*|.*sh"
  "wget.*|.*sh"
)

# SSH к jeremy-vps: пропускаем blocked patterns (remote команды безопасны)
IS_SSH_VPS=false
if echo "$CMD" | grep -qi "^ssh jeremy-vps\|^ssh.*jeremy-vps"; then
  IS_SSH_VPS=true
fi

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qi "$pattern"; then
    # Разрешить на VPS: cat .env, echo secrets (remote операции)
    if [[ "$IS_SSH_VPS" == "true" ]]; then
      continue
    fi
    echo "BLOCKED: опасная команда '$pattern'" >&2
    exit 2
  fi
done

# === 2. Git push: force запрещен, force-with-lease разрешен ===
if echo "$CMD" | grep -qi "git push.*--force" && ! echo "$CMD" | grep -qi "\-\-force-with-lease"; then
  echo "BLOCKED: git push --force запрещен. Используй --force-with-lease" >&2
  exit 2
fi

# === 3. git reset --hard: только с конкретным SHA ===
if echo "$CMD" | grep -qi "git reset --hard$"; then
  echo "BLOCKED: git reset --hard без SHA. Укажи конкретный коммит" >&2
  exit 2
fi

# === 4. Системные пути в командах (пропуск SSH к jeremy-vps и docker exec/run) ===
if ! echo "$CMD" | grep -qi "ssh jeremy-vps\|ssh.*jeremy-vps"; then
  SYSTEM_DIRS=("/etc/" "/usr/" "/var/log/" "/root/" "/home/" "/tmp/" "/boot/" "/sbin/" "/proc/" "/sys/")
  for dir in "${SYSTEM_DIRS[@]}"; do
    if echo "$CMD" | grep -qi "docker.*exec\|docker.*run"; then
      continue
    fi
    if echo "$CMD" | grep -q "$dir"; then
      echo "BLOCKED: системный путь $dir в команде" >&2
      exit 2
    fi
  done
fi

# === 5. Relative path escape ===
if echo "$CMD" | grep -qE "\.\./\.\./\.\." ; then
  echo "BLOCKED: подозрительный relative path (../../../)" >&2
  exit 2
fi

# === 6. Docker compose с путями не из проекта ===
if echo "$CMD" | grep -qi "docker compose -f" || echo "$CMD" | grep -qi "docker-compose -f"; then
  COMPOSE_FILE=$(echo "$CMD" | grep -oP '(?<=-f\s)\S+')
  if [[ -n "$COMPOSE_FILE" ]]; then
    RESOLVED=$(realpath -m "$COMPOSE_FILE" 2>/dev/null || echo "$COMPOSE_FILE")
    RESOLVED_PROJECT=$(realpath -m "$PROJECT_DIR" 2>/dev/null || echo "$PROJECT_DIR")
    if [[ "$RESOLVED" != "$RESOLVED_PROJECT"* ]]; then
      echo "BLOCKED: docker compose -f за пределами проекта: $COMPOSE_FILE" >&2
      exit 2
    fi
  fi
fi

# === 7. SSH к чужим хостам ===
if echo "$CMD" | grep -qi "^ssh " && ! echo "$CMD" | grep -qi "jeremy-vps"; then
  echo "BLOCKED: SSH к неизвестному хосту. Разрешен только jeremy-vps" >&2
  exit 2
fi

exit 0
