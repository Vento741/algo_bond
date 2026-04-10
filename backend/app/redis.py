"""Подключение к Redis."""

from redis.asyncio import ConnectionPool, Redis

from app.config import settings

_pool = ConnectionPool.from_url(
    settings.redis_url,
    max_connections=20,
    decode_responses=True,
)

# Общий Redis-клиент для кеширования (market, strategy)
pool = Redis(connection_pool=_pool)


def get_redis() -> Redis:
    """Dependency: новый Redis-клиент из пула."""
    return Redis(connection_pool=_pool)
