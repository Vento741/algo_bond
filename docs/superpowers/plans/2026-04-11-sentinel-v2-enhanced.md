# Sentinel v2 Enhanced - План реализации

## Backend

### Задача 1: Расширить schemas (sentinel_schemas.py)
- ChatMessage, ChatHistory, ApprovalRequest, ApprovalResponse
- AgentCommand, AgentConfig, HealthHistoryEntry
- CommitEntry, TokenUsage

### Задача 2: Расширить service (sentinel_service.py)
- Chat: save_message, get_chat_history, publish_to_channel
- Approval: create_approval, resolve_approval, get_pending_approvals
- Commands: execute_command (restart, health_check, reconcile, deploy, reset_circuit)
- Config: get_config, update_config (mode, intervals)
- Health history: add_health_entry, get_health_history
- Commits: get_commits (from Redis list)
- Tokens: get_tokens_today

### Задача 3: WebSocket endpoint + новые REST endpoints (sentinel_router.py)
- WS /api/admin/agent/chat/ws
- GET /api/admin/agent/chat/history
- POST /api/admin/agent/command
- POST /api/admin/agent/approval
- GET /api/admin/agent/health-history
- GET /api/admin/agent/commits
- GET /api/admin/agent/tokens
- GET/PUT /api/admin/agent/config

### Задача 4: Тесты
- test_sentinel_api.py - добавить тесты для новых endpoints

## Frontend

### Задача 5: Разбить SentinelSection на компоненты
- components/sentinel/SentinelHeader.tsx - status + mode toggle + actions
- components/sentinel/SentinelStats.tsx - 6 stat cards
- components/sentinel/SentinelMonitors.tsx - monitors & cron
- components/sentinel/SentinelChat.tsx - chat panel + input
- components/sentinel/SentinelTabs.tsx - incidents, health timeline, commits
- hooks/useSentinelWebSocket.ts - WebSocket hook с reconnect

### Задача 6: Обновить SentinelSection.tsx
- Импортировать новые компоненты
- Добавить state management для chat, config, approvals

## Agent

### Задача 7: Обновить sentinel-init-prompt.md
- Протокол чтения chat:in
- Протокол отправки в chat:out
- Approval flow в supervised mode
- Проверка mode перед опасными действиями

## Порядок

1. Backend schemas -> service -> router -> tests (один коммит)
2. Frontend components (один коммит)
3. Init prompt update (один коммит)
4. Push + deploy
