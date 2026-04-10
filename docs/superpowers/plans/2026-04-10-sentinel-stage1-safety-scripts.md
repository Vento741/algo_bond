# AlgoBond Sentinel - Stage 1: Safety + Scripts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create safety hooks and deployment scripts for the autonomous agent, fully testable without running the agent itself.

**Architecture:** Bash hooks (path-guard, extended safety-guard) block dangerous operations. Shell scripts handle zero-downtime deploy and rollback. State directory tracks SHA checkpoints. Init prompt defines all agent protocols.

**Tech Stack:** Bash, jq, git, docker compose, curl

**Spec:** `docs/superpowers/specs/2026-04-10-autonomous-agent-monitor-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `.claude/hooks/path-guard.sh` | Block Edit/Write outside project dir |
| Modify | `.claude/hooks/safety-guard.sh` | VPS version: project isolation + relative path resolve |
| Modify | `.claude/hooks/circuit-breaker.sh` | Add reset conditions (success, session restart, TG /reset_circuit) |
| Modify | `.claude/settings.json` | Register path-guard hook |
| Create | `.claude/scripts/sentinel-deploy.sh` | Zero-downtime deploy + rollback |
| Create | `.claude/scripts/sentinel-init-prompt.md` | Full init prompt with all protocols |
| Create | `.claude/state/.gitkeep` | State directory for SHA tracking |
| Create | `tests/test_hooks.py` | Tests for path-guard and safety-guard logic |

---

### Task 1: path-guard.sh - Block Edit/Write Outside Project

**Files:**
- Create: `.claude/hooks/path-guard.sh`

This hook runs on `PreToolUse` for `Edit|Write`. It reads `tool_input.file_path` from stdin JSON, resolves to absolute path, and blocks if outside project dir.

- [ ] **Step 1: Create path-guard.sh**

```bash
#!/bin/bash
# path-guard.sh - Блокирует Edit/Write файлов за пределами проекта
# Хук PreToolUse для Edit|Write
# Exit 0 = разрешить, Exit 2 = заблокировать

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Если нет file_path - разрешить (не наш инструмент)
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Определяем корень проекта
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Resolve relative paths и symlinks
RESOLVED_PATH=$(realpath -m "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")
RESOLVED_PROJECT=$(realpath -m "$PROJECT_DIR" 2>/dev/null || echo "$PROJECT_DIR")

# Проверка: путь должен начинаться с PROJECT_DIR
if [[ "$RESOLVED_PATH" != "$RESOLVED_PROJECT"* ]]; then
  echo "BLOCKED: Edit/Write за пределами проекта: $FILE_PATH" >&2
  echo "Resolved: $RESOLVED_PATH" >&2
  echo "Project: $RESOLVED_PROJECT" >&2
  exit 2
fi

# Дополнительно: блок системных путей даже если они внутри PROJECT_DIR (невозможно, но paranoid check)
SYSTEM_DIRS=("/etc" "/usr" "/var/log" "/root" "/home" "/tmp" "/opt")
for dir in "${SYSTEM_DIRS[@]}"; do
  if [[ "$RESOLVED_PATH" == "$dir"* ]]; then
    echo "BLOCKED: системный путь: $RESOLVED_PATH" >&2
    exit 2
  fi
done

exit 0
```

- [ ] **Step 2: Make executable**

Run: `chmod +x .claude/hooks/path-guard.sh`
Expected: No output, exit 0

- [ ] **Step 3: Test manually - valid path**

Run: `echo '{"tool_input":{"file_path":"backend/app/main.py"}}' | CLAUDE_PROJECT_DIR="$(pwd)" bash .claude/hooks/path-guard.sh; echo "Exit: $?"`
Expected: `Exit: 0`

- [ ] **Step 4: Test manually - blocked path**

Run: `echo '{"tool_input":{"file_path":"/etc/passwd"}}' | CLAUDE_PROJECT_DIR="$(pwd)" bash .claude/hooks/path-guard.sh 2>&1; echo "Exit: $?"`
Expected: Contains `BLOCKED`, `Exit: 2`

- [ ] **Step 5: Test manually - relative path escape**

Run: `echo '{"tool_input":{"file_path":"../../etc/passwd"}}' | CLAUDE_PROJECT_DIR="$(pwd)" bash .claude/hooks/path-guard.sh 2>&1; echo "Exit: $?"`
Expected: Contains `BLOCKED`, `Exit: 2`

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/path-guard.sh
git commit -m "feat(sentinel): add path-guard hook for Edit/Write isolation"
```

---

### Task 2: Extend safety-guard.sh for VPS

**Files:**
- Modify: `.claude/hooks/safety-guard.sh`

Extend the existing safety-guard with: project isolation (block commands touching paths outside project), relative path resolve, allow `git push --force-with-lease` for rollback, block docker compose with external paths.

- [ ] **Step 1: Read current safety-guard.sh and understand structure**

Current file at `.claude/hooks/safety-guard.sh` (6 lines of logic):
- Reads `tool_input.command` from stdin JSON
- Array of blocked patterns
- grep loop, exit 2 if match

- [ ] **Step 2: Replace safety-guard.sh with extended version**

```bash
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

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qi "$pattern"; then
    echo "BLOCKED: опасная команда '$pattern'" >&2
    exit 2
  fi
done

# === 2. Git push: force запрещен, force-with-lease разрешен (для rollback) ===
if echo "$CMD" | grep -qi "git push.*--force" && ! echo "$CMD" | grep -qi "\-\-force-with-lease"; then
  echo "BLOCKED: git push --force запрещен. Используй --force-with-lease" >&2
  exit 2
fi

# === 3. git reset --hard: только с конкретным SHA (не голый) ===
if echo "$CMD" | grep -qi "git reset --hard$"; then
  echo "BLOCKED: git reset --hard без SHA. Укажи конкретный коммит" >&2
  exit 2
fi

# === 4. Системные пути в командах ===
SYSTEM_DIRS=("/etc/" "/usr/" "/var/log/" "/root/" "/home/" "/tmp/" "/boot/" "/sbin/" "/proc/" "/sys/")
for dir in "${SYSTEM_DIRS[@]}"; do
  # Пропускаем если путь внутри docker exec/run (контейнер)
  if echo "$CMD" | grep -qi "docker.*exec\|docker.*run"; then
    continue
  fi
  if echo "$CMD" | grep -q "$dir"; then
    echo "BLOCKED: системный путь $dir в команде" >&2
    exit 2
  fi
done

# === 5. Relative path escape (../ patterns) ===
# Resolve: если cd/cat/vim/nano к ../.. за пределами проекта
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

# === 7. SSH к чужим хостам (только jeremy-vps разрешен) ===
if echo "$CMD" | grep -qi "^ssh " && ! echo "$CMD" | grep -qi "jeremy-vps"; then
  echo "BLOCKED: SSH к неизвестному хосту. Разрешен только jeremy-vps" >&2
  exit 2
fi

exit 0
```

- [ ] **Step 3: Test - blocked force push**

Run: `echo '{"tool_input":{"command":"git push --force origin main"}}' | bash .claude/hooks/safety-guard.sh 2>&1; echo "Exit: $?"`
Expected: Contains `BLOCKED`, `Exit: 2`

- [ ] **Step 4: Test - allowed force-with-lease**

Run: `echo '{"tool_input":{"command":"git push --force-with-lease origin main"}}' | bash .claude/hooks/safety-guard.sh 2>&1; echo "Exit: $?"`
Expected: `Exit: 0`

- [ ] **Step 5: Test - blocked system path**

Run: `echo '{"tool_input":{"command":"cat /etc/shadow"}}' | bash .claude/hooks/safety-guard.sh 2>&1; echo "Exit: $?"`
Expected: Contains `BLOCKED`, `Exit: 2`

- [ ] **Step 6: Test - allowed project command**

Run: `echo '{"tool_input":{"command":"cd backend && pytest tests/ -v"}}' | bash .claude/hooks/safety-guard.sh 2>&1; echo "Exit: $?"`
Expected: `Exit: 0`

- [ ] **Step 7: Test - blocked relative escape**

Run: `echo '{"tool_input":{"command":"cat ../../../etc/passwd"}}' | bash .claude/hooks/safety-guard.sh 2>&1; echo "Exit: $?"`
Expected: Contains `BLOCKED`, `Exit: 2`

- [ ] **Step 8: Commit**

```bash
git add .claude/hooks/safety-guard.sh
git commit -m "feat(sentinel): extend safety-guard with VPS isolation and path checks"
```

---

### Task 3: Extend circuit-breaker.sh with Reset Conditions

**Files:**
- Modify: `.claude/hooks/circuit-breaker.sh`

Add 3 reset conditions: (1) successful fix resets counter, (2) session restart resets, (3) TG `/reset_circuit` command resets via marker file. Also add `stop_hook_active` check.

- [ ] **Step 1: Replace circuit-breaker.sh**

```bash
#!/bin/bash
# circuit-breaker.sh - Считает последовательные неудачи auto-fix
# Вызывается из Stop hook (agent)
# Exit 0 = разрешить остановку, Exit 2 = продолжить работу
#
# Reset условия:
#   1. success: echo 0 > $COUNTER_FILE (после успешного fix)
#   2. session restart: agent-init.sh удаляет $COUNTER_FILE
#   3. TG /reset_circuit: создает $RESET_MARKER -> watchdog удаляет counter

COUNTER_FILE="/tmp/claude-autofix-failures"
RESET_MARKER="/tmp/claude-circuit-reset"
MAX_FAILURES=3

# Проверка маркера сброса (от TG команды /reset_circuit)
if [[ -f "$RESET_MARKER" ]]; then
  rm -f "$COUNTER_FILE" "$RESET_MARKER"
  echo "Circuit breaker сброшен по команде /reset_circuit" >&2
  exit 0
fi

# Инкремент счетчика
current=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
current=$((current + 1))
echo "$current" > "$COUNTER_FILE"

if [ "$current" -ge "$MAX_FAILURES" ]; then
  # Отправить TG алерт
  if [[ -n "$TG_BOT_TOKEN" && -n "$TG_ADMIN_CHAT_ID" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TG_ADMIN_CHAT_ID}" \
      -d "text=🔴 Circuit Breaker: $current последовательных неудач auto-fix. Sentinel приостановлен. /reset_circuit для сброса." \
      -d "parse_mode=HTML" > /dev/null 2>&1
  fi
  # Сброс счетчика, разрешить остановку
  rm -f "$COUNTER_FILE"
  exit 0
fi

# Не достигли лимита - exit 2 = продолжить работу (для Stop hook)
exit 2
```

- [ ] **Step 2: Test - counter increment**

Run: `rm -f /tmp/claude-autofix-failures && bash .claude/hooks/circuit-breaker.sh 2>&1; echo "Exit: $?"; cat /tmp/claude-autofix-failures`
Expected: `Exit: 2`, counter = `1`

- [ ] **Step 3: Test - trigger at MAX_FAILURES**

Run: `echo 2 > /tmp/claude-autofix-failures && bash .claude/hooks/circuit-breaker.sh 2>&1; echo "Exit: $?"`
Expected: Contains `Circuit Breaker` or `Exit: 0` (3 >= 3)

- [ ] **Step 4: Test - reset marker**

Run: `echo 5 > /tmp/claude-autofix-failures && touch /tmp/claude-circuit-reset && bash .claude/hooks/circuit-breaker.sh 2>&1; echo "Exit: $?"; ls /tmp/claude-autofix-failures 2>&1`
Expected: `Exit: 0`, counter file deleted

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/circuit-breaker.sh
git commit -m "feat(sentinel): circuit-breaker with 3 reset conditions"
```

---

### Task 4: Register path-guard in settings.json

**Files:**
- Modify: `.claude/settings.json`

Add `path-guard.sh` as `PreToolUse` hook for `Edit|Write`.

- [ ] **Step 1: Add path-guard hook to settings.json**

In `.claude/settings.json`, add to the `hooks.PreToolUse` array a new entry after the existing Bash matcher:

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/path-guard.sh",
      "timeout": 10
    }
  ]
}
```

The `PreToolUse` array should now have 2 entries: Bash (safety-guard) and Edit|Write (path-guard).

- [ ] **Step 2: Validate JSON**

Run: `cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond" && cat .claude/settings.json | jq . > /dev/null && echo "Valid JSON"`
Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(sentinel): register path-guard hook in settings.json"
```

---

### Task 5: sentinel-deploy.sh - Zero-downtime Deploy + Rollback

**Files:**
- Create: `.claude/scripts/sentinel-deploy.sh`

Script for zero-downtime deploy with double health check and rollback to last-known-good SHA.

- [ ] **Step 1: Create scripts directory**

Run: `mkdir -p .claude/scripts`

- [ ] **Step 2: Create sentinel-deploy.sh**

```bash
#!/bin/bash
# sentinel-deploy.sh - Zero-downtime deploy с rollback
# Использование:
#   ./sentinel-deploy.sh deploy              - Build + deploy + health check
#   ./sentinel-deploy.sh rollback            - Откат до last-known-good SHA
#   ./sentinel-deploy.sh health              - Только health check
#
# Переменные окружения:
#   PROJECT_DIR  - корень проекта (default: pwd)
#   TG_BOT_TOKEN - для алертов (optional)
#   TG_ADMIN_CHAT_ID - для алертов (optional)

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
LAST_GOOD_SHA="$STATE_DIR/last-known-good.sha"
PRE_FIX_SHA="$STATE_DIR/pre-fix.sha"
HEALTH_URL="http://localhost:8100/health"
ADMIN_HEALTH_URL="http://localhost:8100/api/admin/system/health"

# === Функции ===

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
    # Успех: обновить last-known-good
    git -C "$PROJECT_DIR" rev-parse HEAD > "$LAST_GOOD_SHA"
    echo "[deploy] Deploy successful. Updated last-known-good.sha"
    send_tg "✅ Deploy: $(git -C "$PROJECT_DIR" log -1 --format='%s')"
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
    send_tg "🔴 Rollback FAILED: нет last-known-good.sha"
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
    send_tg "⚠️ Rollback to $(echo "$good_sha" | head -c 8): health restored"
  else
    echo "[rollback] CRITICAL: rollback failed too!"
    send_tg "🔴 CRITICAL: rollback to $(echo "$good_sha" | head -c 8) FAILED. Manual intervention required!"
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

# === Main ===

ACTION="${1:-deploy}"

case "$ACTION" in
  deploy)
    do_deploy
    ;;
  rollback)
    do_rollback
    ;;
  health)
    do_health
    ;;
  *)
    echo "Usage: $0 {deploy|rollback|health}"
    exit 1
    ;;
esac
```

- [ ] **Step 3: Make executable**

Run: `chmod +x .claude/scripts/sentinel-deploy.sh`

- [ ] **Step 4: Test - help output**

Run: `bash .claude/scripts/sentinel-deploy.sh invalid 2>&1; echo "Exit: $?"`
Expected: Contains `Usage:`, `Exit: 1`

- [ ] **Step 5: Commit**

```bash
git add .claude/scripts/sentinel-deploy.sh
git commit -m "feat(sentinel): zero-downtime deploy script with rollback"
```

---

### Task 6: State Directory

**Files:**
- Create: `.claude/state/.gitkeep`

Directory for SHA tracking files. Files themselves are gitignored (runtime state).

- [ ] **Step 1: Create state directory**

Run: `mkdir -p .claude/state && touch .claude/state/.gitkeep`

- [ ] **Step 2: Add state files to .gitignore**

Append to `.gitignore`:

```
# Sentinel state (runtime, not tracked)
.claude/state/*.sha
.claude/state/incident-log.jsonl
```

- [ ] **Step 3: Commit**

```bash
git add .claude/state/.gitkeep .gitignore
git commit -m "feat(sentinel): state directory for SHA tracking"
```

---

### Task 7: sentinel-init-prompt.md

**Files:**
- Create: `.claude/scripts/sentinel-init-prompt.md`

The master init prompt loaded at every agent session start. Defines identity, all protocols, Monitor commands, CronCreate tasks, safety rules.

- [ ] **Step 1: Create sentinel-init-prompt.md**

```markdown
# AlgoBond Sentinel - Init Prompt

Ты - AlgoBond Sentinel, автономный DevOps-агент для платформы AlgoBond.
Твоя задача: мониторинг, auto-fix ошибок, health checks, P&L reconciliation.

## Идентификация

- Имя: AlgoBond Sentinel
- Роль: DevOps-агент (monitoring + auto-fix)
- Scope: СТРОГО в пределах проекта `/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/`
- Git prefix: `fix(sentinel):`, `feat(sentinel):`, `refactor(sentinel):`

## Инициализация (выполнить при каждом старте)

1. Ротация incident-log: `tail -1000 .claude/state/incident-log.jsonl > /tmp/incident-rotate && mv /tmp/incident-rotate .claude/state/incident-log.jsonl`
2. Сброс circuit breaker: `rm -f /tmp/claude-autofix-failures /tmp/claude-circuit-reset`
3. Прочитать last-known-good.sha: `cat .claude/state/last-known-good.sha 2>/dev/null || git rev-parse HEAD > .claude/state/last-known-good.sha`
4. Обновить Redis статус:
   ```bash
   redis-cli HSET algobond:agent:status status running started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" monitors "api,listener" cron_jobs "health,reconcile,deps_audit" incidents_today 0 fixes_today 0
   ```
5. Запустить мониторы (шаг 6-7)
6. Создать cron-задачи (шаг 8-10)

## Мониторы (persistent)

### Monitor 1: API logs (auto-fix)

Запустить Monitor (persistent) для отслеживания ошибок API:
```
docker logs -f algobond-api 2>&1 | grep --line-buffered "ERROR\|Exception\|Traceback\|CRITICAL"
```

При обнаружении ошибки -> протокол Auto-fix (см. ниже).

### Monitor 2: Listener logs (alert-only)

Запустить Monitor (persistent) для отслеживания ошибок listener:
```
docker logs -f algobond-bybit-listener 2>&1 | grep --line-buffered "ERROR\|Exception\|CRITICAL\|disconnect"
```

При обнаружении ошибки:
- НЕ редактировать торговый код!
- Если контейнер упал: `docker compose restart bybit-listener` + перезапустить Monitor + TG алерт
- Если контейнер жив: только TG алерт с описанием

## Cron-задачи

### Health check (каждые 5 мин)

CronCreate: `*/5 * * * *`
1. `curl -sf http://localhost:8100/health`
2. Если fail: подождать 30с, retry
3. Если повторный fail: `docker compose restart api` + перезапустить Monitor API + TG алерт
4. Если Redis/DB down: TG алерт (НЕ рестартить)
5. Если OK: молчать (экономия токенов)
6. Обновить Redis: `redis-cli HSET algobond:agent:status last_health_check "$(date -u +%Y-%m-%dT%H:%M:%SZ)" last_health_result ok`

### P&L Reconciliation (23:50 UTC)

CronCreate: `50 23 * * *`
1. `curl -sf http://localhost:8100/api/trading/bots?status=running` (с JWT admin)
2. Для каждого бота без open position с pending orders: `curl -X POST http://localhost:8100/api/trading/bots/{id}/reconcile`
3. Если расхождения -> TG отчет
4. Если чисто -> молчать

### Dependency Audit (вс 03:00)

CronCreate: `0 3 * * 0`
1. `cd backend && pip-audit --format json 2>/dev/null`
2. `cd frontend && npm audit --json 2>/dev/null`
3. Если critical/high -> TG отчет
4. Если чисто -> молчать

## Протокол Auto-fix

1. Прочитать traceback, определить файл и строку
2. Дедупликация: SHA256[:8] от traceback, проверить incident-log за 60с. Дубль -> пропустить
3. Redis RPUSH algobond:agent:fix_queue (FIFO). Если уже идет фикс - ждать
4. Записать инцидент: `echo '{"ts":"...","hash":"...","status":"fixing","trace":"..."}' >> .claude/state/incident-log.jsonl`
5. `redis-cli LPUSH algobond:agent:incidents '{"ts":"...","status":"fixing","trace":"..."}'`
6. `redis-cli LTRIM algobond:agent:incidents 0 99`
7. Сохранить pre-fix SHA: `git rev-parse HEAD > .claude/state/pre-fix.sha`
8. `git pull origin main` (на случай если human запушил)
9. Прочитать код, проанализировать, исправить
10. Тесты: `python -m pytest tests/ -v --timeout=120 --ignore=tests/test_backtest.py --ignore=tests/test_bybit_listener.py`
11. Если тесты зеленые:
    a. `git add <файлы> && git commit -m "fix(sentinel): описание"`
    b. `git push origin main`
    c. `.claude/scripts/sentinel-deploy.sh deploy`
    d. Перезапустить Monitor API (контейнер новый!)
    e. Сброс circuit breaker: `echo 0 > /tmp/claude-autofix-failures`
    f. TG уведомление с отчетом
    g. Обновить Redis: `redis-cli HINCRBY algobond:agent:status fixes_today 1`
12. Если тесты красные (3 попытки):
    a. Circuit breaker активируется
    b. TG алерт
    c. НЕ деплоить
13. Обновить инцидент: status=fixed/failed
14. LPOP fix_queue. Если в очереди ещё -> взять следующую

## Reconnection

После ЛЮБОГО restart контейнера (deploy, health restart, listener restart) - Monitor теряет поток.
ОБЯЗАТЕЛЬНО перезапустить соответствующий Monitor после каждого restart/redeploy.

## Safety (КРИТИЧНО)

- СТРОГО внутри `/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/`
- НЕ выходить за пределы проекта
- НЕ менять nginx, системные файлы, Docker других контейнеров
- НЕ коммитить .env или секреты
- НЕ использовать `git push --force` (только `--force-with-lease` при rollback)
- НЕ редактировать торговый код listener (alert-only!)
- НЕ рестартить Redis/DB (риск потери данных)
- Ошибки обрабатываются ПОСЛЕДОВАТЕЛЬНО (одна за раз)

## TG Rate Limit

- Max 10 сообщений за 5 минут
- После лимита: одно summary
- CRITICAL (health down, circuit breaker) - отправлять всегда

## Graceful Shutdown

При получении /quit:
1. Завершить текущую операцию (если auto-fix - дождаться)
2. `redis-cli HSET algobond:agent:status status stopped`
3. Выйти
```

- [ ] **Step 2: Commit**

```bash
git add .claude/scripts/sentinel-init-prompt.md
git commit -m "feat(sentinel): init prompt with all agent protocols"
```

---

### Task 8: Python Tests for Hook Logic

**Files:**
- Create: `backend/tests/test_hooks.py`

Test the logic of path-guard and safety-guard hooks using subprocess calls.

- [ ] **Step 1: Create test file**

```python
"""Тесты для Claude hooks (path-guard, safety-guard)."""

import json
import os
import subprocess
from pathlib import Path

import pytest

# Корень проекта (2 уровня вверх от backend/tests/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
HOOKS_DIR = PROJECT_ROOT / ".claude" / "hooks"


def run_hook(hook_name: str, tool_input: dict, env_extra: dict | None = None) -> tuple[int, str, str]:
    """Запустить hook-скрипт с JSON на stdin."""
    hook_path = HOOKS_DIR / hook_name
    if not hook_path.exists():
        pytest.skip(f"Hook {hook_name} not found at {hook_path}")

    payload = json.dumps({"tool_input": tool_input})
    env = os.environ.copy()
    env["CLAUDE_PROJECT_DIR"] = str(PROJECT_ROOT)
    if env_extra:
        env.update(env_extra)

    result = subprocess.run(
        ["bash", str(hook_path)],
        input=payload,
        capture_output=True,
        text=True,
        env=env,
        timeout=10,
    )
    return result.returncode, result.stdout, result.stderr


class TestPathGuard:
    """Тесты path-guard.sh."""

    def test_allow_project_file(self) -> None:
        """Файл внутри проекта - разрешен."""
        code, _, _ = run_hook("path-guard.sh", {"file_path": str(PROJECT_ROOT / "backend" / "app" / "main.py")})
        assert code == 0

    def test_block_etc_passwd(self) -> None:
        """Системный файл /etc/passwd - заблокирован."""
        code, _, stderr = run_hook("path-guard.sh", {"file_path": "/etc/passwd"})
        assert code == 2
        assert "BLOCKED" in stderr

    def test_block_relative_escape(self) -> None:
        """Relative path escape ../../etc - заблокирован."""
        code, _, stderr = run_hook("path-guard.sh", {"file_path": "../../etc/passwd"})
        assert code == 2
        assert "BLOCKED" in stderr

    def test_allow_empty_path(self) -> None:
        """Пустой file_path - разрешить (не наш инструмент)."""
        code, _, _ = run_hook("path-guard.sh", {"command": "ls"})
        assert code == 0


class TestSafetyGuard:
    """Тесты safety-guard.sh."""

    def test_block_rm_rf(self) -> None:
        """rm -rf / заблокирован."""
        code, _, stderr = run_hook("safety-guard.sh", {"command": "rm -rf /"})
        assert code == 2
        assert "BLOCKED" in stderr

    def test_block_force_push(self) -> None:
        """git push --force заблокирован."""
        code, _, stderr = run_hook("safety-guard.sh", {"command": "git push --force origin main"})
        assert code == 2

    def test_allow_force_with_lease(self) -> None:
        """git push --force-with-lease разрешен."""
        code, _, _ = run_hook("safety-guard.sh", {"command": "git push --force-with-lease origin main"})
        assert code == 0

    def test_block_system_path(self) -> None:
        """cat /etc/shadow заблокирован."""
        code, _, stderr = run_hook("safety-guard.sh", {"command": "cat /etc/shadow"})
        assert code == 2

    def test_allow_pytest(self) -> None:
        """pytest разрешен."""
        code, _, _ = run_hook("safety-guard.sh", {"command": "cd backend && pytest tests/ -v"})
        assert code == 0

    def test_block_cat_env(self) -> None:
        """cat .env заблокирован."""
        code, _, stderr = run_hook("safety-guard.sh", {"command": "cat .env"})
        assert code == 2

    def test_block_relative_escape(self) -> None:
        """../../../etc/passwd заблокирован."""
        code, _, stderr = run_hook("safety-guard.sh", {"command": "cat ../../../etc/passwd"})
        assert code == 2

    def test_allow_docker_compose(self) -> None:
        """docker compose up - разрешен."""
        code, _, _ = run_hook("safety-guard.sh", {"command": "docker compose up -d --build api"})
        assert code == 0

    def test_block_unknown_ssh(self) -> None:
        """SSH к неизвестному хосту заблокирован."""
        code, _, stderr = run_hook("safety-guard.sh", {"command": "ssh root@evil-server.com"})
        assert code == 2

    def test_allow_ssh_jeremy(self) -> None:
        """SSH к jeremy-vps разрешен."""
        code, _, _ = run_hook("safety-guard.sh", {"command": "ssh jeremy-vps 'ls'"})
        assert code == 0

    def test_block_naked_reset_hard(self) -> None:
        """git reset --hard без SHA заблокирован."""
        code, _, stderr = run_hook("safety-guard.sh", {"command": "git reset --hard"})
        assert code == 2

    def test_allow_reset_hard_with_sha(self) -> None:
        """git reset --hard <sha> разрешен."""
        code, _, _ = run_hook("safety-guard.sh", {"command": "git reset --hard abc123def"})
        assert code == 0
```

- [ ] **Step 2: Run tests**

Run: `cd backend && python -m pytest tests/test_hooks.py -v`
Expected: All tests PASS (or skip on Windows if bash not available)

- [ ] **Step 3: Fix any failures and re-run**

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_hooks.py
git commit -m "test(sentinel): hook tests for path-guard and safety-guard"
```

---

### Task 9: Final Integration Test

- [ ] **Step 1: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v --timeout=120 --ignore=tests/test_backtest.py --ignore=tests/test_bybit_listener.py`
Expected: All existing tests + new hook tests PASS

- [ ] **Step 2: Verify file structure**

Run: `ls -la .claude/hooks/ .claude/scripts/ .claude/state/`
Expected:
- `.claude/hooks/`: path-guard.sh, safety-guard.sh, circuit-breaker.sh, auto-lint.sh, pre-commit.sh
- `.claude/scripts/`: sentinel-deploy.sh, sentinel-init-prompt.md
- `.claude/state/`: .gitkeep

- [ ] **Step 3: Commit all (if any uncommitted)**

```bash
git add -A && git status
# Only commit if there are changes
git commit -m "feat(sentinel): Stage 1 complete - safety hooks and scripts"
```
