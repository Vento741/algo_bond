#!/bin/bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE" == *.py ]]; then
  cd "$CLAUDE_PROJECT_DIR/backend"
  ruff check --fix "$FILE" 2>/dev/null
  ruff format "$FILE" 2>/dev/null
fi

if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
  cd "$CLAUDE_PROJECT_DIR/frontend"
  npx prettier --write "$FILE" 2>/dev/null
fi

exit 0
