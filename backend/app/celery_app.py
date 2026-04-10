"""Конфигурация Celery для фоновых задач."""

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery = Celery(
    "algobond",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery.conf.beat_schedule = {
    "run-active-bots": {
        "task": "trading.run_active_bots",
        "schedule": 60.0,  # каждую минуту (smart skip внутри bot_worker)
    },
    "sync-trading-pairs": {
        "task": "market.sync_trading_pairs",
        "schedule": 21600.0,  # every 6 hours
    },
    "sync-latest-candles": {
        "task": "market.sync_latest_candles",
        "schedule": 60.0,  # каждую минуту
    },
    "beat-heartbeat": {
        "task": "system.beat_heartbeat",
        "schedule": 60.0,
    },
    "cleanup-old-notifications": {
        "task": "notifications.cleanup_old",
        "schedule": 86400.0,  # каждые 24 часа
    },
    "send-daily-pnl-report": {
        "task": "telegram.send_daily_pnl_report",
        "schedule": crontab(hour=23, minute=55),
    },
    "check-margin-warnings": {
        "task": "telegram.check_margin_warnings",
        "schedule": 300.0,  # каждые 5 минут
    },
}

celery.autodiscover_tasks([
    "app.modules.trading",
    "app.modules.backtest",
    "app.modules.market",
    "app.modules.notifications",
    "app.modules.telegram",
], related_name="celery_tasks")


@celery.task(name="system.beat_heartbeat")
def beat_heartbeat_task():
    """Heartbeat задача для мониторинга Celery Beat."""
    import redis as sync_redis
    from app.config import settings
    try:
        r = sync_redis.from_url(settings.redis_url)
        r.set("celery-beat:last_run", str(__import__("time").time()), ex=300)
        r.close()
    except Exception:
        pass
