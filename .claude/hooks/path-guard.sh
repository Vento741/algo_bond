#!/bin/bash
# path-guard.sh - Блокирует Edit/Write файлов за пределами проекта
# Хук PreToolUse для Edit|Write
# Exit 0 = разрешить, Exit 2 = заблокировать

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Нормализация: Windows backslash -> forward slash, drive letter c: -> /c
normalize_path() {
  local p="$1"
  p=$(echo "$p" | sed 's|\|/|g')
  p=$(echo "$p" | sed -E 's|^([a-zA-Z]):|/\L\1|')
  realpath -m "$p" 2>/dev/null || echo "$p"
}

RESOLVED_PATH=$(normalize_path "$FILE_PATH")
RESOLVED_PROJECT=$(normalize_path "$PROJECT_DIR")

if [[ "$RESOLVED_PATH" != "$RESOLVED_PROJECT"* ]]; then
  echo "BLOCKED: Edit/Write за пределами проекта: $FILE_PATH" >&2
  echo "Resolved: $RESOLVED_PATH" >&2
  echo "Project: $RESOLVED_PROJECT" >&2
  exit 2
fi

# Блок системных путей (Linux only, не Windows)
SYSTEM_DIRS=("/etc" "/usr" "/var/log" "/root" "/opt")
for dir in "${SYSTEM_DIRS[@]}"; do
  if [[ "$RESOLVED_PATH" == "$dir"* ]]; then
    echo "BLOCKED: системный путь: $RESOLVED_PATH" >&2
    exit 2
  fi
done

exit 0
