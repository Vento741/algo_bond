#!/bin/bash
# sentinel-deploy.sh - Zero-downtime deploy с rollback
# Использование:
#   ./sentinel-deploy.sh deploy   - Build + deploy + health check
#   ./sentinel-deploy.sh rollback - Откат до last-known-good SHA
#   ./sentinel-deploy.sh health   - Только health check

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/sentinel-state"
LAST_GOOD_SHA="$STATE_DIR/last-known-good.sha"
PRE_FIX_SHA="$STATE_DIR/pre-fix.sha"
HEALTH_URL="http://localhost:8100/health"

send_tg() {
  local text="$1"
  if [[ -n "${TG_BOT_TOKEN:-}" && -n "${TG_ADMIN_CHAT_ID:-}" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TG_ADMIN_CHAT_ID}" \
      -d "text=$text" \
      -d "parse_mode=HTML" > /dev/null 2>&1 || true
  fi
}

health_check() {
  local url="${1:-$HEALTH_URL}"
  curl -sf "$url" --max-time 10 > /dev/null 2>&1
}

double_health_check() {
  echo "[deploy] Health check #1..."
  if ! health_check "$HEALTH_URL"; then
    echo "[deploy] Health check #1 FAILED"
    return 1
  fi
  echo "[deploy] Health check #1 OK. Waiting 5s..."
  sleep 5
  echo "[deploy] Health check #2..."
  if ! health_check "$HEALTH_URL"; then
    echo "[deploy] Health check #2 FAILED"
    return 1
  fi
  echo "[deploy] Health check #2 OK"
  return 0
}

do_deploy() {
  echo "[deploy] Saving pre-fix SHA..."
  git -C "$PROJECT_DIR" rev-parse HEAD > "$PRE_FIX_SHA"
  echo "[deploy] Building API container (old still running)..."
  cd "$PROJECT_DIR"
  docker compose build api
  echo "[deploy] Swapping container (zero-downtime)..."
  docker compose up -d --no-build api
  echo "[deploy] Running double health check..."
  if double_health_check; then
    git -C "$PROJECT_DIR" rev-parse HEAD > "$LAST_GOOD_SHA"
    echo "[deploy] Deploy successful. Updated last-known-good.sha"
    send_tg "Deploy OK: $(git -C "$PROJECT_DIR" log -1 --format='%s')"
    return 0
  else
    echo "[deploy] Health check FAILED! Starting rollback..."
    do_rollback
    return 1
  fi
}

do_rollback() {
  if [[ ! -f "$LAST_GOOD_SHA" ]]; then
    echo "[rollback] ERROR: no last-known-good.sha found!"
    send_tg "Rollback FAILED: no last-known-good.sha"
    return 1
  fi
  local good_sha
  good_sha=$(cat "$LAST_GOOD_SHA")
  echo "[rollback] Rolling back to $good_sha..."
  cd "$PROJECT_DIR"
  git reset --hard "$good_sha"
  git push --force-with-lease origin main
  echo "[rollback] Rebuilding from known-good..."
  docker compose build api
  docker compose up -d --no-build api
  sleep 3
  if health_check "$HEALTH_URL"; then
    echo "[rollback] Rollback successful"
    send_tg "Rollback to $(echo "$good_sha" | head -c 8): health restored"
  else
    echo "[rollback] CRITICAL: rollback failed too!"
    send_tg "CRITICAL: rollback to $(echo "$good_sha" | head -c 8) FAILED. Manual intervention required!"
  fi
}

do_health() {
  if health_check "$HEALTH_URL"; then
    echo "[health] API OK"
  else
    echo "[health] API FAILED"
    exit 1
  fi
}

ACTION="${1:-deploy}"
case "$ACTION" in
  deploy) do_deploy ;;
  rollback) do_rollback ;;
  health) do_health ;;
  *) echo "Usage: $0 {deploy|rollback|health}"; exit 1 ;;
esac
