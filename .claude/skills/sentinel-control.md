---
name: sentinel-control
description: "Управление AlgoBond Sentinel: start, stop, restart. Используй когда пользователь говорит: запусти sentinel, останови sentinel, перезапусти sentinel, sentinel start/stop/restart, включи агента, выключи агента, toggle sentinel."
user_invocable: true
---

# /sentinel-control - Управление AlgoBond Sentinel

Запуск, остановка и перезапуск автономного агента.

## Параметры

- **SSH:** `jeremy-vps`
- **Проект:** `/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade`

## Команды

Определи действие из контекста пользователя. Если не указано - спроси.

### Start

```bash
# 1. Проверь что агент не запущен
ssh jeremy-vps "tmux has-session -t algobond-agent 2>/dev/null && echo 'Already running' || echo 'Ready to start'"

# 2. Запуск
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && bash .claude/scripts/agent-init.sh"

# 3. Включи watchdog
ssh jeremy-vps "systemctl start algobond-agent-watchdog.timer"

# 4. Проверь через 5с
sleep 5
ssh jeremy-vps "docker exec algobond-redis redis-cli HGET algobond:agent:status status && tmux has-session -t algobond-agent 2>/dev/null && echo 'tmux: OK' || echo 'tmux: DEAD'"
```

### Stop

```bash
# 1. Остановка через Redis (graceful, watchdog подхватит)
ssh jeremy-vps "docker exec algobond-redis redis-cli SET algobond:agent:command stop"

# 2. Или прямая остановка
ssh jeremy-vps "tmux send-keys -t algobond-agent '/quit' Enter 2>/dev/null; sleep 5; tmux kill-session -t algobond-agent 2>/dev/null; docker exec algobond-redis redis-cli HSET algobond:agent:status status stopped"

# 3. Останови watchdog (чтобы не перезапускал)
ssh jeremy-vps "systemctl stop algobond-agent-watchdog.timer"
```

### Restart

```bash
# Graceful restart (новый контекст)
ssh jeremy-vps "bash /opt/algobond/agent-restart.sh"
```

### Emergency Stop (всё выключить)

```bash
ssh jeremy-vps "tmux kill-session -t algobond-agent 2>/dev/null; systemctl stop algobond-agent-watchdog.timer; docker exec algobond-redis redis-cli HSET algobond:agent:status status stopped; docker exec algobond-redis redis-cli DEL algobond:agent:command"
echo "Sentinel полностью остановлен. Watchdog выключен."
```

## После каждого действия

Выведи текущее состояние:
```bash
ssh jeremy-vps "echo 'Redis:' && docker exec algobond-redis redis-cli HGET algobond:agent:status status && echo 'tmux:' && (tmux has-session -t algobond-agent 2>/dev/null && echo 'ALIVE' || echo 'DEAD') && echo 'Watchdog:' && systemctl is-active algobond-agent-watchdog.timer"
```
