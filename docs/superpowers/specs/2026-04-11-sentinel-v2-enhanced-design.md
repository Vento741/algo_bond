# Sentinel v2 Enhanced - Спецификация

## Обзор

Расширение панели управления AlgoBond Sentinel: чат с агентом через WebSocket, режимы Auto/Supervised, новые API endpoints, расширенный UI с табами и approval flow.

---

## Секция 1: Чат с Sentinel

### WebSocket endpoint

- `WS /api/admin/agent/chat/ws` - real-time чат между UI и Sentinel
- Аутентификация: JWT токен передается как query param `?token=...`
- Redis pub/sub каналы:
  - `algobond:agent:chat:in` - сообщения от UI к Sentinel
  - `algobond:agent:chat:out` - сообщения от Sentinel к UI

### Типы сообщений

```typescript
type ChatMessageType = 
  | "user_message"      // от пользователя
  | "agent_message"     // ответ агента
  | "agent_log"         // лог действий агента
  | "approval_request"  // запрос на подтверждение
  | "approval_response" // ответ на запрос
```

### Формат сообщения

```json
{
  "id": "uuid",
  "type": "user_message | agent_message | agent_log | approval_request | approval_response",
  "content": "текст сообщения",
  "timestamp": "2026-04-11T10:00:00Z",
  "metadata": {}  // optional: action_type, approval_id, etc.
}
```

### Approval Flow

1. Sentinel публикует `approval_request` в `chat:out` с `metadata.approval_id` и `metadata.action`
2. UI показывает карточку с кнопками Approve / Reject
3. Пользователь нажимает - UI отправляет `approval_response` в `chat:in`
4. Sentinel читает ответ и выполняет / отменяет действие
5. Timeout: 10 минут в Supervised mode (после - auto-reject)

### История чата

- Redis list `algobond:agent:chat` - последние 200 сообщений
- `LTRIM` при добавлении нового сообщения
- GET `/api/admin/agent/chat/history?limit=50` для загрузки при открытии UI

---

## Секция 2: Auto / Supervised режимы

### Toggle

- Переключатель в header UI: Auto (зеленый) / Supervised (желтый)
- Redis key: `algobond:agent:mode` = `auto` | `supervised`
- Default: `auto`

### Поведение по режимам

| Действие | Auto | Supervised |
|----------|------|------------|
| Auto-fix ошибок | Немедленно | approval_request |
| git push | Немедленно | approval_request |
| docker deploy | Немедленно | approval_request |
| docker restart | Немедленно | approval_request |
| P&L reconcile | Немедленно | Немедленно (безопасно) |
| Health check | Немедленно | Немедленно (read-only) |

### API

- `GET /api/admin/agent/config` - получить текущий режим и конфиг
- `PUT /api/admin/agent/config` - обновить режим

---

## Секция 3: Новые API endpoints

### Chat & WebSocket

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | /admin/agent/chat/history | admin JWT | Последние N сообщений |
| WS | /admin/agent/chat/ws | JWT query | WebSocket real-time чат |

### Commands & Actions

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | /admin/agent/command | admin JWT | Выполнить действие (restart, health_check, reconcile, deploy, reset_circuit) |
| POST | /admin/agent/approval | admin JWT | Approve/reject pending action |

### Monitoring

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | /admin/agent/health-history | admin JWT | 24ч таймлайн health checks |
| GET | /admin/agent/commits | admin JWT | Последние sentinel git коммиты |
| GET | /admin/agent/tokens | admin JWT | Использование токенов за сегодня |

### Configuration

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | /admin/agent/config | admin JWT | Текущий конфиг (mode, intervals) |
| PUT | /admin/agent/config | admin JWT | Обновить конфиг |

### Redis keys (новые)

- `algobond:agent:mode` - auto | supervised
- `algobond:agent:config` - JSON конфиг (intervals, thresholds)
- `algobond:agent:chat` - list сообщений чата
- `algobond:agent:approvals` - hash pending approvals
- `algobond:agent:health_history` - list записей health checks (24ч)
- `algobond:agent:tokens_today` - int использованные токены

---

## Секция 4: UI Layout

### 1. Header

- Статус агента (badge: RUNNING/STOPPED/ERROR)
- Uptime
- Auto/Supervised toggle (Switch компонент)
- Action buttons: Restart, Deploy, Stop

### 2. Stat Cards (6 штук)

1. Incidents Today (красный если > 0)
2. Fixes Today (зеленый если > 0)
3. Last Health (OK/FAIL)
4. Monitors Active (count)
5. Tokens Today (usage)
6. Pending Approvals (желтый если > 0)

### 3. Monitors & Cron

- Inline switches для включения/выключения мониторов
- Dropdown выбора интервала для cron
- Кнопки: Force Check, Run Now, Reset

### 4. Chat + Log Panel

- Высота ~400px, scroll
- Сообщения цветом по типу:
  - user_message: белый
  - agent_message: зеленый
  - agent_log: серый/dim
  - approval_request: желтая карточка с кнопками
- Input поле внизу с кнопкой Send

### 5. Tabs

- **Incidents** - текущая таблица инцидентов
- **Health Timeline** - 24ч график health checks
- **Git Commits** - список sentinel коммитов

---

## Секция 5: Error Handling & Edge Cases

### WebSocket

- Reconnect с exponential backoff (1s, 2s, 4s, 8s, max 30s)
- При disconnect - показывать banner "Reconnecting..."
- При 401 на WS - redirect to login
- Heartbeat ping каждые 30s для keep-alive

### Chat

- Если Sentinel не запущен - сообщения сохраняются в Redis, будут прочитаны при старте
- Max message length: 4000 chars
- Rate limit: 20 messages/min от пользователя

### Approval

- Pending approvals хранятся в Redis hash с TTL 10min
- При timeout - auto-reject + notification в чате
- При multiple pending - показывать все, обрабатывать independently

### Mode Toggle

- При переключении Auto -> Supervised: немедленный эффект, текущие операции завершаются
- При переключении Supervised -> Auto: pending approvals auto-approve

### Redis Failures

- Все endpoints graceful при Redis down (return defaults, не 500)
- WebSocket продолжает работать в memory-only mode
- Reconnect к Redis с backoff

### Config

- Config валидация на backend (min/max intervals)
- Default config при отсутствии в Redis
