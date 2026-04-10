---
name: sentinel-diagnose
description: "Диагностика AlgoBond Sentinel на VPS. Используй когда пользователь говорит: sentinel status, проверь sentinel, диагностика агента, sentinel упал, почему спамит, watchdog loop, restart loop, sentinel не работает. Также используй при любых проблемах с автономным агентом."
user_invocable: true
---

# /sentinel-diagnose - Диагностика AlgoBond Sentinel

Полная проверка инфраструктуры автономного агента на VPS.

## Параметры

- **SSH:** `jeremy-vps`
- **Проект:** `/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade`
- **tmux сессия:** `algobond-agent`
- **Redis prefix:** `algobond:agent:*`
- **systemd timer:** `algobond-agent-watchdog.timer`

## Шаги диагностики

Выполни ВСЕ проверки и выведи сводный отчет. Не останавливайся на первой ошибке.

### 1. Redis статус агента

```bash
ssh jeremy-vps "redis-cli HGETALL algobond:agent:status"
```

Ожидан��е: hash с полями status, started_at, monitors, cron_jobs, incidents_today, fixes_today.
- `status=running` - агент работает
- `status=stopped` - намеренно остановлен
- `status=starting/restarting` - переходное состояние (если висит >2 мин - проблема)
- Пустой hash или нет клю��а - агент никогда не запускался

Также проверь команды в очереди:
```bash
ssh jeremy-vps "redis-cli GET algobond:agent:command"
```

### 2. tmux сессия

```bash
ssh jeremy-vps "tmux has-session -t algobond-agent 2>/dev/null && echo 'SESSION: ALIVE' || echo 'SESSION: DEAD'"
```

Если жива - проверь что внутри:
```bash
ssh jeremy-vps "tmux capture-pane -t algobond-agent -p | tail -20"
```

### 3. Claude процесс

```bash
ssh jeremy-vps "ps aux | grep -E 'claude|node.*claude' | grep -v grep"
```

Если нет процесса но tmux жив - claude упал внутри сессии.
Если есть процесс - проверь его PID и связь с tmux:
```bash
ssh jeremy-vps "tmux list-panes -t algobond-agent -F '#{pane_pid}' 2>/dev/null"
```

### 4. systemd watchdog timer

```bash
ssh jeremy-vps "systemctl status algobond-agent-watchdog.timer --no-pager"
```

- `active (running)` - таймер работает, watchdog запускается каждые 30с
- `inactive` - таймер остановлен (агент не бу��ет автовосстанавливаться)

Последние запуски watchdog:
```bash
ssh jeremy-vps "journalctl -u algobond-agent-watchdog.service -n 20 --no-pager"
```

Если видишь повторяющиеся "Restarting..." каждые 30с - это restart loop.

### 5. cron (12h restart)

```bash
ssh jeremy-vps "crontab -l 2>/dev/null | grep algobond"
```

Ожидание: `0 */12 * * * /opt/algobond/agent-restart.sh`

### 6. Health check API

```bash
ssh jeremy-vps "curl -sf http://localhost:8100/health && echo ' OK' || echo 'FAIL'"
```

### 7. Docker контейнеры

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose ps --format 'table {{.Name}}\t{{.Status}}'"
```

### 8. Последние инциденты

```bash
ssh jeremy-vps "redis-cli LRANGE algobond:agent:incidents 0 4"
```

### 9. State файлы

```bash
ssh jeremy-vps "ls -la /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade/.claude/state/ 2>/dev/null"
```

### 10. /opt/algobond/ целостность

```bash
ssh jeremy-vps "ls -la /opt/algobond/ && test -f /opt/algobond/.env && echo 'ENV: OK' || echo 'ENV: MISSING'"
```

## Сводный отчет

После всех проверок выведи таблицу:

```
| Компонент          | Статус | Детали |
|--------------------|--------|--------|
| Redis status       | OK/ERR | ...    |
| tmux session       | OK/ERR | ...    |
| Claude process     | OK/ERR | ...    |
| systemd timer      | OK/ERR | ...    |
| cron 12h           | OK/ERR | ...    |
| API health         | OK/ERR | ...    |
| Docker containers  | OK/ERR | ...    |
| State files        | OK/ERR | ...    |
| /opt/algobond      | OK/ERR | ...    |
```

## Типичные проблемы и решения

**Restart loop (watchdog спамит TG):**
- Причина: watchdog не находит claude процесс в tmux
- Диагноз: `journalctl -u algobond-agent-watchdog.service -n 20`
- Решение: остановить timer, починить watchdog detection, перезапустить

**Агент stopped но должен running:**
- `redis-cli SET algobond:agent:command start` - watchdog подхватит

**tmux жив, claude мертв:**
- `tmux kill-session -t algobond-agent`
- `bash .claude/scripts/agent-init.sh`

**Все мертво:**
```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && bash .claude/scripts/agent-init.sh"
ssh jeremy-vps "systemctl start algobond-agent-watchdog.timer"
```
