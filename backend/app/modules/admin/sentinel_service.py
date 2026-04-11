"""Сервис для управления состоянием AlgoBond Sentinel через Redis."""

import json
import logging
import uuid
from datetime import datetime, timezone

from redis.asyncio import Redis

from app.modules.admin.sentinel_schemas import (
    AgentConfig,
    AgentConfigUpdate,
    ApprovalRequest,
    ChatMessage,
    ChatHistoryResponse,
    CommitEntry,
    CommitsResponse,
    HealthHistoryEntry,
    HealthHistoryResponse,
    PendingApprovalsResponse,
    SentinelIncident,
    SentinelIncidentsResponse,
    SentinelStatus,
    SentinelStatusUpdate,
    TokenUsageResponse,
)

logger = logging.getLogger(__name__)

AGENT_STATUS_KEY = "algobond:agent:status"
AGENT_COMMAND_KEY = "algobond:agent:command"
AGENT_INCIDENTS_KEY = "algobond:agent:incidents"
AGENT_FIX_QUEUE_KEY = "algobond:agent:fix_queue"
AGENT_MODE_KEY = "algobond:agent:mode"
AGENT_CONFIG_KEY = "algobond:agent:config"
AGENT_CHAT_KEY = "algobond:agent:chat"
AGENT_CHAT_IN_KEY = "algobond:agent:chat:in"
AGENT_CHAT_OUT_KEY = "algobond:agent:chat:out"
AGENT_APPROVALS_KEY = "algobond:agent:approvals"
AGENT_HEALTH_HISTORY_KEY = "algobond:agent:health_history"
AGENT_COMMITS_KEY = "algobond:agent:commits"
AGENT_TOKENS_KEY = "algobond:agent:tokens_today"

CHAT_MAX_MESSAGES = 200
HEALTH_HISTORY_MAX = 288  # 24h at 5min intervals


class SentinelService:
    """Управление Sentinel через Redis."""

    def __init__(self, redis: Redis) -> None:
        self.redis = redis

    # === Status (existing) ===

    async def get_status(self) -> SentinelStatus:
        """Получить текущий статус агента из Redis hash."""
        data = await self.redis.hgetall(AGENT_STATUS_KEY)
        if not data:
            return SentinelStatus(status="stopped")

        monitors = data.get("monitors", "")
        cron_jobs = data.get("cron_jobs", "")

        started_at = None
        if data.get("started_at"):
            try:
                started_at = datetime.fromisoformat(data["started_at"])
            except ValueError:
                pass

        last_health_check = None
        if data.get("last_health_check"):
            try:
                last_health_check = datetime.fromisoformat(data["last_health_check"])
            except ValueError:
                pass

        return SentinelStatus(
            status=data.get("status", "stopped"),
            started_at=started_at,
            monitors=[m for m in monitors.split(",") if m],
            cron_jobs=[c for c in cron_jobs.split(",") if c],
            incidents_today=int(data.get("incidents_today", 0)),
            fixes_today=int(data.get("fixes_today", 0)),
            last_health_check=last_health_check,
            last_health_result=data.get("last_health_result"),
        )

    async def update_status(self, update: SentinelStatusUpdate) -> SentinelStatus:
        """Обновить статус агента (вызывается агентом через X-Agent-Token)."""
        fields: dict[str, str] = {}
        if update.status is not None:
            fields["status"] = update.status
        if update.started_at is not None:
            fields["started_at"] = update.started_at.isoformat()
        if update.monitors is not None:
            fields["monitors"] = update.monitors
        if update.cron_jobs is not None:
            fields["cron_jobs"] = update.cron_jobs
        if update.incidents_today is not None:
            fields["incidents_today"] = str(update.incidents_today)
        if update.fixes_today is not None:
            fields["fixes_today"] = str(update.fixes_today)
        if update.last_health_check is not None:
            fields["last_health_check"] = update.last_health_check.isoformat()
        if update.last_health_result is not None:
            fields["last_health_result"] = update.last_health_result

        if fields:
            await self.redis.hset(AGENT_STATUS_KEY, mapping=fields)
            logger.info("Sentinel status updated: %s", list(fields.keys()))

        return await self.get_status()

    async def toggle(self, action: str) -> dict[str, str]:
        """Отправить команду start/stop агенту через Redis."""
        if action not in ("start", "stop"):
            raise ValueError(f"Invalid action: {action}. Must be 'start' or 'stop'")

        await self.redis.set(AGENT_COMMAND_KEY, action)
        logger.info("Sentinel command sent: %s", action)
        return {"command": action, "message": f"Command '{action}' sent to agent"}

    async def get_incidents(self, limit: int = 20, offset: int = 0) -> SentinelIncidentsResponse:
        """Получить список инцидентов из Redis list."""
        total = await self.redis.llen(AGENT_INCIDENTS_KEY)
        raw_items = await self.redis.lrange(AGENT_INCIDENTS_KEY, offset, offset + limit - 1)

        items: list[SentinelIncident] = []
        for raw in raw_items:
            try:
                data = json.loads(raw)
                items.append(SentinelIncident(**data))
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse incident: %s - %s", raw, e)

        return SentinelIncidentsResponse(items=items, total=total)

    # === Chat ===

    async def save_chat_message(self, message: ChatMessage) -> None:
        """Сохранить сообщение в историю чата."""
        raw = message.model_dump_json()
        await self.redis.rpush(AGENT_CHAT_KEY, raw)
        await self.redis.ltrim(AGENT_CHAT_KEY, -CHAT_MAX_MESSAGES, -1)

    async def get_chat_history(self, limit: int = 50) -> ChatHistoryResponse:
        """Получить последние N сообщений чата."""
        total = await self.redis.llen(AGENT_CHAT_KEY)
        raw_items = await self.redis.lrange(AGENT_CHAT_KEY, -limit, -1)

        messages: list[ChatMessage] = []
        for raw in raw_items:
            try:
                data = json.loads(raw)
                messages.append(ChatMessage(**data))
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse chat message: %s - %s", raw, e)

        return ChatHistoryResponse(messages=messages, total=total)

    async def publish_chat_message(self, channel: str, message: ChatMessage) -> None:
        """Опубликовать сообщение в Redis pub/sub канал."""
        await self.redis.publish(channel, message.model_dump_json())

    # === Approval ===

    async def get_pending_approvals(self) -> PendingApprovalsResponse:
        """Получить список pending approvals."""
        data = await self.redis.hgetall(AGENT_APPROVALS_KEY)
        items: list[ApprovalRequest] = []
        for _key, raw in data.items():
            try:
                parsed = json.loads(raw)
                items.append(ApprovalRequest(**parsed))
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse approval: %s", e)

        return PendingApprovalsResponse(items=items, total=len(items))

    async def resolve_approval(self, approval_id: str, decision: str) -> bool:
        """Одобрить или отклонить pending approval."""
        exists = await self.redis.hexists(AGENT_APPROVALS_KEY, approval_id)
        if not exists:
            return False

        await self.redis.hdel(AGENT_APPROVALS_KEY, approval_id)

        # Публикуем решение в chat:in для Sentinel
        msg = ChatMessage(
            id=str(uuid.uuid4()),
            type="approval_response",
            content=f"{decision}: {approval_id}",
            timestamp=datetime.now(timezone.utc),
            metadata={"approval_id": approval_id, "decision": decision},
        )
        await self.save_chat_message(msg)
        await self.publish_chat_message(AGENT_CHAT_IN_KEY, msg)
        return True

    # === Commands ===

    async def execute_command(self, command: str, params: dict | None = None) -> dict[str, str]:
        """Отправить команду Sentinel через Redis pub/sub."""
        valid_commands = {"restart", "health_check", "reconcile", "deploy", "reset_circuit"}
        if command not in valid_commands:
            raise ValueError(f"Invalid command: {command}. Valid: {valid_commands}")

        payload = json.dumps({"command": command, "params": params or {}, "ts": datetime.now(timezone.utc).isoformat()})
        await self.redis.publish(AGENT_CHAT_IN_KEY, payload)

        # Также сохраняем как user_message в чат
        msg = ChatMessage(
            id=str(uuid.uuid4()),
            type="user_message",
            content=f"/{command}" + (f" {json.dumps(params)}" if params else ""),
            timestamp=datetime.now(timezone.utc),
            metadata={"command": command, "params": params},
        )
        await self.save_chat_message(msg)

        return {"command": command, "status": "sent", "message": f"Command '{command}' sent to Sentinel"}

    # === Config ===

    async def get_config(self) -> AgentConfig:
        """Получить текущую конфигурацию Sentinel."""
        raw = await self.redis.get(AGENT_CONFIG_KEY)
        if raw:
            try:
                data = json.loads(raw)
                return AgentConfig(**data)
            except (json.JSONDecodeError, TypeError):
                pass

        # Fallback: проверить отдельный key mode
        mode = await self.redis.get(AGENT_MODE_KEY)
        if mode:
            return AgentConfig(mode=mode)
        return AgentConfig()

    async def update_config(self, update: AgentConfigUpdate) -> AgentConfig:
        """Обновить конфигурацию Sentinel."""
        current = await self.get_config()
        current_dict = current.model_dump()

        for field, value in update.model_dump(exclude_none=True).items():
            current_dict[field] = value

        new_config = AgentConfig(**current_dict)
        await self.redis.set(AGENT_CONFIG_KEY, new_config.model_dump_json())

        # Синхронизируем отдельный mode key для обратной совместимости
        await self.redis.set(AGENT_MODE_KEY, new_config.mode)

        logger.info("Sentinel config updated: %s", update.model_dump(exclude_none=True))
        return new_config

    # === Health History ===

    async def get_health_history(self) -> HealthHistoryResponse:
        """Получить 24ч таймлайн health checks."""
        raw_items = await self.redis.lrange(AGENT_HEALTH_HISTORY_KEY, 0, HEALTH_HISTORY_MAX - 1)

        entries: list[HealthHistoryEntry] = []
        for raw in raw_items:
            try:
                data = json.loads(raw)
                entries.append(HealthHistoryEntry(**data))
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse health entry: %s", e)

        return HealthHistoryResponse(entries=entries)

    # === Commits ===

    async def get_commits(self, limit: int = 20) -> CommitsResponse:
        """Получить последние sentinel коммиты из Redis."""
        total = await self.redis.llen(AGENT_COMMITS_KEY)
        raw_items = await self.redis.lrange(AGENT_COMMITS_KEY, 0, limit - 1)

        commits: list[CommitEntry] = []
        for raw in raw_items:
            try:
                data = json.loads(raw)
                commits.append(CommitEntry(**data))
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse commit: %s", e)

        return CommitsResponse(commits=commits, total=total)

    # === Tokens ===

    async def get_tokens_usage(self) -> TokenUsageResponse:
        """Получить использование токенов за сегодня."""
        tokens_raw = await self.redis.get(AGENT_TOKENS_KEY)
        tokens = int(tokens_raw) if tokens_raw else 0

        # Получить timestamp последнего обновления
        last_updated = None
        ts_raw = await self.redis.get(f"{AGENT_TOKENS_KEY}:updated_at")
        if ts_raw:
            try:
                last_updated = datetime.fromisoformat(ts_raw)
            except ValueError:
                pass

        return TokenUsageResponse(
            tokens_today=tokens,
            last_updated=last_updated,
        )
