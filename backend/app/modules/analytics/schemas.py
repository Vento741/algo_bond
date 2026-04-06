"""Pydantic v2 схемы модуля аналитики."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# --- Ingest schemas ---


class TrackEvent(BaseModel):
    """Одно событие от фронтенд-трекера."""

    type: str = Field(..., max_length=30)
    path: str | None = Field(None, max_length=500)
    title: str | None = Field(None, max_length=200)
    element: str | None = Field(None, max_length=100)
    scroll_depth: int | None = None
    error: str | None = None
    conversion_type: str | None = Field(None, max_length=30)
    metadata: dict | None = None
    timestamp: datetime


class EventBatch(BaseModel):
    """Пакет событий от фронтенд-трекера."""

    session_id: str | None = None
    events: list[TrackEvent] = Field(max_length=50)
    screen_width: int | None = None
    screen_height: int | None = None
    language: str | None = Field(None, max_length=10)
    referrer: str | None = None
    utm_source: str | None = Field(None, max_length=100)
    utm_medium: str | None = Field(None, max_length=100)
    utm_campaign: str | None = Field(None, max_length=100)
    user_id: str | None = None


class IngestResponse(BaseModel):
    """Ответ на batch ingest."""

    session_id: str
    events_count: int


# --- Admin response schemas ---


class DailyDataPoint(BaseModel):
    """Точка на графике по дням."""

    date: str
    visitors: int
    pageviews: int
    sessions: int


class OverviewStats(BaseModel):
    """Общая статистика аналитики."""

    visitors: int
    pageviews: int
    sessions: int
    bounce_rate: float
    avg_duration: float
    daily_data: list[DailyDataPoint]


class PageStats(BaseModel):
    """Статистика по странице."""

    path: str
    views: int
    unique_visitors: int
    avg_scroll: float | None


class SourceStats(BaseModel):
    """Статистика по источнику трафика."""

    source: str
    visits: int
    percentage: float


class DistributionItem(BaseModel):
    """Элемент распределения (браузер, ОС, устройство, страна)."""

    name: str
    count: int
    percentage: float


class DeviceStats(BaseModel):
    """Статистика по устройствам."""

    browsers: list[DistributionItem]
    os_list: list[DistributionItem]
    device_types: list[DistributionItem]
    countries: list[DistributionItem]


class FunnelStep(BaseModel):
    """Шаг воронки конверсии."""

    step_name: str
    count: int
    conversion_rate: float


class ActivePage(BaseModel):
    """Активная страница в реальном времени."""

    path: str
    visitors: int


class RealtimeStats(BaseModel):
    """Статистика в реальном времени."""

    online_count: int
    active_pages: list[ActivePage]


class EventItem(BaseModel):
    """Событие для списка."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    event_type: str
    page_path: str | None
    page_title: str | None
    element_id: str | None
    scroll_depth: int | None
    error_message: str | None
    extra_data: dict | None
    created_at: datetime


class EventListResponse(BaseModel):
    """Список событий с пагинацией."""

    items: list[EventItem]
    total: int
