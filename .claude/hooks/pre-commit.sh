#!/bin/bash
# Проверка на секреты перед коммитом
PATTERNS="BYBIT_API_KEY=.+|BYBIT_API_SECRET=.+|JWT_SECRET_KEY=.+|ENCRYPTION_KEY=.+"
if git diff --cached --diff-filter=ACM | grep -qiE "$PATTERNS"; then
    echo "ОШИБКА: Обнаружен секрет в коммите!"
    exit 1
fi
echo "Проверка секретов пройдена."
