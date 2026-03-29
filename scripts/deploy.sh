#!/bin/bash
set -e
echo "=== AlgoBond Deploy ==="
VPS_HOST="jeremy-vps"
VPS_PATH="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade"
BRANCH=$(git branch --show-current)

echo "[1/5] Проверка незакоммиченных изменений..."
if [ -n "$(git status --porcelain)" ]; then echo "ОШИБКА: Незакоммиченные изменения."; exit 1; fi

echo "[2/5] Push на GitHub ($BRANCH)..."
git push origin "$BRANCH"

echo "[3/5] Деплой на VPS..."
ssh "$VPS_HOST" "cd $VPS_PATH && git pull origin $BRANCH && docker-compose -f docker-compose.prod.yml up -d --build"

echo "[4/5] Ожидание (10 сек)..."
sleep 10

echo "[5/5] Healthcheck..."
HEALTH=$(ssh "$VPS_HOST" "curl -sf http://localhost:8000/health" || echo '{"status":"error"}')
echo "$HEALTH"

if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "=== Деплой успешен! https://algo.dev-james.bond ==="
else
    echo "=== ОШИБКА ==="
    ssh "$VPS_HOST" "cd $VPS_PATH && docker-compose logs --tail=30"
    exit 1
fi
