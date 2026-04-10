# AlgoBond Sentinel - Autonomous Agent + Monitor Pipeline Design Spec

**Дата:** 2026-04-10
**Автор:** Denis + Claude
**Статус:** Утверждено

---

## 1. Обзор

Автономный DevOps-агент "AlgoBond Sentinel" на VPS. Claude Code в persistent tmux сессии с Monitor tool для real-time мониторинга Docker логов, auto-fix ошибок, health checks, P&L reconciliation, dependency audit. Управление через админку (toggle) и Telegram (/admin).

## 2. Решения

| Вопрос | Решение |
|--------|---------|
| Автономность | Full Ops: мониторинг, auto-fix, health, reconciliation, deps audit |
| Бюджет | Без лимитов, реактивный на события + периодические задачи |
| VPS план | Max plan (remote-control + Monitor) |
| Действия | Всё автономно, СТРОГО в рамках проекта AlgoBond |
| UI | Toggle вкл/выкл + статус в админке "Система" |
| Коммуникация | agent -> Redis -> API -> фронтенд; Toggle -> Redis -> watchdog -> tmux |
| Git strategy | Sentinel пушит в main после каждого успешного fix |

## 3. Архитектура

### 3.1 Компоненты на VPS

```
systemd timer (30с) -> agent-watchdog.sh
  - Проверяет tmux + claude process
  - Читает Redis algobond:agent:command (start/stop)
  - При падении: перезапуск + TG алерт

cron (*/12 час) -> agent-restart.sh
  - Graceful: /quit -> wait 30s -> kill
  - Fresh context: agent-init.sh

tmux "algobond-agent"
  └── claude --remote-control "AlgoBond Sentinel"
      ├── Monitor (persistent): API logs -> auto-fix
      ├── Monitor (persistent): Listener logs -> alert-only + auto-restart
      ├── CronCreate: health */5 мин
      ├── CronCreate: P&L reconcile 23:50 UTC
      ├── CronCreate: deps audit вс 03:00
      └── Hooks: auto-lint, safety-guard, path-guard, circuit-breaker
```

### 3.2 Файловая структура

```
/var/www/.../algo_trade/
├── CLAUDE.md                          # Основной (существует)
├── .claude/
│   ├── scripts/
│   │   ├── agent-init.sh             # Запуск tmux + claude
│   │   ├── agent-restart.sh          # Graceful restart (12ч)
│   │   ├── agent-watchdog.sh         # Systemd watchdog (30с)
│   │   ├── sentinel-init-prompt.md   # Init промпт для агента
│   │   └── sentinel-deploy.sh        # Zero-downtime deploy + rollback
│   ├── hooks/
│   │   ├── auto-lint.sh              # (существует)
│   │   ├── safety-guard.sh           # (расширить для VPS)
│   │   ├── path-guard.sh             # НОВЫЙ: блок Edit/Write за пределами проекта
│   │   ├── circuit-breaker.sh        # (существует)
│   │   └── pre-commit.sh             # (существует)
│   ├── state/
│   │   ├── last-known-good.sha       # Обновляется ПОСЛЕ успешного health check
│   │   ├── pre-fix.sha               # SHA перед каждым auto-fix
│   │   └── incident-log.jsonl        # Бэкап (ротация 1000 строк)
│   └── settings.json                 # Hooks (расширить)

/opt/algobond/
├── .env                               # Секреты (НЕ в git): TG_BOT_TOKEN, TG_ADMIN_CHAT_ID, AGENT_SECRET
├── agent-watchdog.sh                  # Копия (не symlink)
└── agent-restart.sh                   # Копия (не symlink)

/etc/systemd/system/
├── algobond-agent-watchdog.timer      # 30с interval
└── algobond-agent-watchdog.service
```

### 3.3 Redis keys

| Key | Type | Описание |
|-----|------|----------|
| algobond:agent:status | Hash | Статус агента (status, started_at, monitors, cron_jobs, incidents_today, fixes_today) |
| algobond:agent:command | String | Команда от UI (start/stop), удаляется после выполнения |
| algobond:agent:incidents | List | Последние 100 инцидентов (LPUSH + LTRIM) |
| algobond:agent:fix_queue | List | Очередь ошибок на исправление (FIFO) |

## 4. Протоколы агента

### 4.1 Инициализация (при каждом старте)

1. Ротация incident-log.jsonl (tail -1000)
2. Сброс circuit breaker counter
3. Запуск Monitor (persistent) для API логов: `docker logs -f algobond-api 2>&1 | grep --line-buffered "ERROR\|Exception\|Traceback\|CRITICAL"`
4. Запуск Monitor (persistent) для listener логов: `docker logs -f algobond-bybit-listener 2>&1 | grep --line-buffered "ERROR\|Exception\|CRITICAL\|disconnect"`
5. Создание CronCreate задач (health, reconcile, deps)
6. Чтение last-known-good.sha
7. Обновление статуса в Redis: status=running, started_at=now
8. Ожидание событий

### 4.2 Auto-fix (ошибка в API логах)

1. Прочитать traceback, определить файл и строку
2. Дедупликация: hash traceback (SHA256[:8]), проверить incident-log за последние 60с. Если дубль - пропустить
3. Добавить в fix_queue (Redis RPUSH). Если уже идет фикс другой ошибки - ждать завершения
4. Записать в incidents: status=fixing
5. Сохранить pre-fix.sha: `git rev-parse HEAD`
6. Прочитать код, проанализировать причину, исправить
7. Тесты: `python -m pytest tests/ -v --timeout=120 --ignore=tests/test_backtest.py --ignore=tests/test_bybit_listener.py`
8. Если тесты зеленые:
   a. `git add <файлы> && git commit -m "fix(sentinel): описание"`
   b. `git push origin main`
   c. Zero-downtime deploy: `docker compose build api && docker compose up -d --no-build api`
   d. Health check (двойной: сразу + через 5с)
   e. Если OK -> обновить last-known-good.sha -> перезапустить Monitor для api (контейнер новый) -> TG уведомление (отчет)
   f. Если FAIL -> rollback: `git reset --hard $(cat last-known-good.sha) && git push --force origin main` + redeploy + TG алерт
9. Если тесты красные (3 попытки) -> circuit breaker -> TG алерт, не деплоить
10. Обновить incidents: status=fixed/failed
11. Удалить из fix_queue (LPOP). Если в очереди ещё ошибки - взять следующую

### 4.3 Alert-only (ошибка в listener логах)

1. НЕ редактировать торговый код
2. Если контейнер упал (docker inspect status != running): `docker compose restart bybit-listener` + перезапустить Monitor для listener + TG алерт
3. Если ошибка в логах (контейнер жив): TG алерт с описанием, без auto-fix

### 4.4 Health check (каждые 5 мин)

1. `curl -sf http://localhost:8100/health`
2. `curl -sf http://localhost:8100/admin/health`
3. Если fail:
   a. Подождать 30с, retry (transient failure protection)
   b. Если повторный fail: `docker compose restart api` + перезапустить Monitor для api + TG алерт
4. Если Redis/DB down: TG алерт (НЕ рестартить - риск потери данных)
5. Если всё OK: молчать (экономия токенов)
6. Обновить Redis: last_health_check, last_result

### 4.5 P&L Reconciliation (23:50 UTC)

1. GET /trading/bots?status=running
2. Для каждого бота:
   a. Проверить: есть open position с pending orders? Если да - пропустить (mid-trade)
   b. POST /trading/bots/{id}/reconcile
3. Если расхождения -> TG отчет
4. Если всё чисто -> молчать

### 4.6 Dependency Audit (вс 03:00)

1. `cd backend && pip-audit --format json 2>/dev/null`
2. `cd frontend && npm audit --json 2>/dev/null`
3. Если critical/high vulnerabilities -> TG отчет со списком + severity
4. Если всё чисто -> молчать

### 4.7 Graceful shutdown (/quit)

1. Завершить текущую операцию (если auto-fix в процессе - дождаться)
2. Обновить Redis: status=stopped
3. Выйти из claude

### 4.8 Monitor reconnection

После каждого restart контейнера (deploy, health restart, listener restart) - Monitor теряет поток (docker logs -f завершается). Агент ОБЯЗАН перезапустить соответствующий Monitor после любого restart/redeploy.

## 5. Safety (безопасность)

### 5.1 Изоляция проекта

СТРОГО ограничено директорией: `/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/`

Запрещено:
- Выходить за пределы проекта (cd, cat, Edit, Write - включая relative paths)
- Docker compose для чужих контейнеров
- Менять nginx (FastPanel)
- Менять системные файлы (/etc, /usr, /home, /tmp, /var/log, /root)
- SSH к другим серверам
- Коммитить .env или секреты

### 5.2 Hooks

**safety-guard.sh** (PreToolUse Bash):
- Блок опасных команд (rm -rf, DROP TABLE, force push, etc.)
- Блок системных путей в ЛЮБОЙ команде (включая через relative paths)
- Resolve: `realpath` или regex для `../` patterns перед проверкой
- Блок docker compose -f с путями не из проекта

**path-guard.sh** (PreToolUse Edit|Write):
- Блок Edit/Write файлов за пределами проекта
- Проверяет `tool_input.file_path` (resolve relative -> absolute)
- Если путь не начинается с PROJECT_DIR -> exit 2

**auto-lint.sh** (PostToolUse Edit|Write): ruff + prettier

**circuit-breaker.sh**:
- Max 3 consecutive failures -> TG алерт + разрешить остановку
- Reset условия: (1) после успешного fix, (2) при перезапуске сессии (12ч), (3) ручной reset через TG команду /reset_circuit

### 5.3 Deploy safety

- Zero-downtime: `docker compose build` (old alive) -> `up -d --no-build` (swap)
- Двойной health check (сразу + 5с)
- Rollback до last-known-good.sha (не просто HEAD~1)
- pre-fix.sha для отката конкретного фикса
- `git push origin main` после каждого успешного fix
- Force push при rollback (единственное исключение для safety-guard)

### 5.4 Git strategy

- Sentinel коммитит и пушит в `main` напрямую (hotfix, уже прошёл тесты)
- Prefix коммитов: `fix(sentinel):`, `feat(sentinel):`, `refactor(sentinel):`
- `git push origin main` после каждого успешного deploy + health check
- При rollback: `git reset --hard` + `git push --force` (допустимо, т.к. откат сломанного)
- Перед фиксом: `git pull origin main` (если human запушил с Windows)

### 5.5 Очередь ошибок

- Ошибки из Monitor обрабатываются ПОСЛЕДОВАТЕЛЬНО (одна за раз)
- Redis list `algobond:agent:fix_queue` (FIFO)
- Если агент фиксит ошибку A и приходит ошибка B - B добавляется в очередь
- После завершения A - берется B из очереди
- Не параллельные Edit в одном файле

### 5.6 TG Rate Limit

- Max 10 сообщений за 5 минут
- После лимита: одно summary "N событий за последние 5 мин"
- CRITICAL (health down, circuit breaker) - отправлять всегда

## 6. API endpoints (admin)

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | /admin/agent/status | JWT (admin) | Статус из Redis |
| PUT | /admin/agent/status | X-Agent-Token header | Обновление (вызывает агент) |
| POST | /admin/agent/toggle | JWT (admin) | start/stop (пишет в Redis command) |
| GET | /admin/agent/incidents | JWT (admin) | Последние инциденты из Redis list (?limit=20&offset=0) |

PUT /admin/agent/status защищен shared secret (X-Agent-Token из .env), не JWT. Это internal API для агента.

## 7. UI в админке (страница "Система")

Секция "AlgoBond Sentinel" на существующей странице AdminSystem:

- Toggle ON/OFF с confirm dialog ("Остановить Sentinel? Мониторинг и auto-fix будут отключены.")
- Статус: running/stopped/error + uptime
- Список мониторов с режимом (auto-fix / alert-only)
- Таблица cron задач с last_run и result
- Статистика за сегодня: инциденты, фиксы, алерты, деплои
- Последний инцидент с деталями
- Polling каждые 30с (GET /admin/agent/status)

## 8. Watchdog + Lifecycle

### 8.1 systemd timer (30с)

```ini
[Timer]
OnBootSec=60
OnUnitActiveSec=30
```

Watchdog проверяет:
1. tmux сессия жива?
2. claude процесс в tmux работает?
3. Redis `algobond:agent:command` = start/stop?
4. При падении: перезапуск через agent-init.sh + TG алерт
5. При command=stop: graceful /quit -> wait 30s -> kill

### 8.2 Context rotation (12ч)

```
0 */12 * * * /opt/algobond/agent-restart.sh
```

agent-restart.sh:
1. `tmux send-keys "algobond-agent" "/quit" Enter`
2. `sleep 30`
3. Если ещё жив: `tmux kill-session`
4. `sleep 5`
5. Запуск agent-init.sh

CronCreate задачи пересоздаются при каждом старте (в sentinel-init-prompt.md).

### 8.3 EnvironmentFile

```
/opt/algobond/.env:
TG_BOT_TOKEN=<from-env>
TG_ADMIN_CHAT_ID=<from-env>
AGENT_SECRET=<random-64-hex>
```

systemd service: `EnvironmentFile=/opt/algobond/.env`

## 9. Реализация (scope)

### Этап 1: Safety + Scripts (безопасен, ничего не ломает)
- path-guard.sh (новый hook для Edit/Write с resolve relative paths)
- safety-guard.sh расширенный (VPS version с изоляцией проекта + relative path resolve)
- sentinel-deploy.sh (zero-downtime deploy + rollback)
- .claude/state/ директория (last-known-good.sha, pre-fix.sha, incident-log.jsonl)
- sentinel-init-prompt.md (инструкции агента со всеми протоколами)

### Этап 2: Backend API + Redis (деплоится как обычный backend update)
- 4 API endpoints (status, toggle, incidents)
- Redis keys schema (agent:status, agent:command, agent:incidents, agent:fix_queue)
- Shared secret (X-Agent-Token) в .env
- Работает без агента (status: stopped)

### Этап 3: VPS infra + UI (параллельно)
- /opt/algobond/ с .env и копиями скриптов
- systemd timer + service (watchdog 30с) с EnvironmentFile
- cron для 12ч restart (context rotation)
- agent-init.sh, agent-restart.sh (graceful), agent-watchdog.sh
- UI секция Sentinel в AdminSystem.tsx (toggle + confirm + статус + инциденты)
- Первый запуск Sentinel

Каждый этап тестируется отдельно. Этап 1 безопасен даже без агента. Этап 2 работает без агента (status: stopped). Этап 3 включает всё.
