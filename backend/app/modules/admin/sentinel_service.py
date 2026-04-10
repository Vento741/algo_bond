"""Сервис для управления состоянием AlgoBond Sentinel через Redis."""

import json
import logging
from datetime import datetime

from redis.asyncio import Redis

from app.modules.admin.sentinel_schemas import (
    SentinelIncident,
    SentinelIncidentsResponse,
    SentinelStatus,
    SentinelStatusUpdate,
)

logger = logging.getLogger(__name__)

AGENT_STATUS_KEY = "algobond:agent:status"
AGENT_COMMAND_KEY = "algobond:agent:command"
AGENT_INCIDENTS_KEY = "algobond:agent:incidents"
AGENT_FIX_QUEUE_KEY = "algobond:agent:fix_queue"


class SentinelService:
    """Управление Sentinel через Redis."""

    def __init__(self, redis: Redis) -> None:
        self.redis = redis

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
