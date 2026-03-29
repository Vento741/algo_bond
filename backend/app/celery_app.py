"""Конфигурация Celery для фоновых задач."""

from celery import Celery

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
        "schedule": 300.0,  # каждые 5 минут
    },
}

celery.autodiscover_tasks([
    "app.modules.trading",
    "app.modules.backtest",
    "app.modules.market",
    "app.modules.notifications",
], related_name="celery_tasks")
