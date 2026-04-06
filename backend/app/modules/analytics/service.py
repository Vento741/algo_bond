"""Бизнес-логика модуля аналитики."""

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.analytics.models import (
    AnalyticsConversion,
    AnalyticsEvent,
    AnalyticsSession,
)
from app.modules.analytics.schemas import (
    ActivePage,
    DailyDataPoint,
    DeviceStats,
    DistributionItem,
    EventBatch,
    EventItem,
    EventListResponse,
    FunnelStep,
    IngestResponse,
    OverviewStats,
    PageStats,
    RealtimeStats,
    SourceStats,
)

# Таймаут сессии - 30 минут неактивности
SESSION_TIMEOUT_MINUTES = 30

# Шаги воронки конверсий (в порядке прохождения)
FUNNEL_STEPS = [
    ("visit", "Визит"),
    ("access_request", "Заявка на доступ"),
    ("register", "Регистрация"),
    ("login", "Вход"),
    ("bot_started", "Запуск бота"),
]


def parse_user_agent(ua: str) -> dict[str, str]:
    """Парсинг User-Agent строки без внешних зависимостей."""
    result = {
        "browser": "Other",
        "browser_version": "",
        "os": "Other",
        "device_type": "desktop",
    }

    # Browser detection
    if m := re.search(r"Edg[e/](\d+)", ua):
        result["browser"], result["browser_version"] = "Edge", m.group(1)
    elif m := re.search(r"Chrome/(\d+)", ua):
        result["browser"], result["browser_version"] = "Chrome", m.group(1)
    elif m := re.search(r"Firefox/(\d+)", ua):
        result["browser"], result["browser_version"] = "Firefox", m.group(1)
    elif m := re.search(r"Version/(\d+).*Safari", ua):
        result["browser"], result["browser_version"] = "Safari", m.group(1)

    # OS detection (порядок важен: iPhone/iPad до Mac OS)
    if "iPhone" in ua or "iPad" in ua or "iOS" in ua:
        result["os"] = "iOS"
    elif "Android" in ua:
        result["os"] = "Android"
    elif "Windows" in ua:
        result["os"] = "Windows"
    elif "Mac OS" in ua:
        result["os"] = "macOS"
    elif "Linux" in ua:
        result["os"] = "Linux"

    # Device type detection
    if "Mobile" in ua or ("Android" in ua and "Tablet" not in ua):
        result["device_type"] = "mobile"
    elif "Tablet" in ua or "iPad" in ua:
        result["device_type"] = "tablet"

    return result


def make_fingerprint(ip: str, user_agent: str) -> str:
    """Создать fingerprint из IP и User-Agent."""
    raw = f"{ip}:{user_agent}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class AnalyticsService:
    """Сервис аналитики."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ingest_events(
        self, batch: EventBatch, ip: str, user_agent: str
    ) -> IngestResponse:
        """Принять пакет событий от трекера.

        Создает или находит сессию по fingerprint,
        вставляет события, обновляет конверсии.
        """
        fingerprint = make_fingerprint(ip, user_agent)
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=SESSION_TIMEOUT_MINUTES)

        # Попытка найти активную сессию по fingerprint
        session = await self._find_active_session(fingerprint, cutoff)

        if session is None:
            # Парсинг UA
            ua_info = parse_user_agent(user_agent)

            # Определить user_id если передан
            user_id = None
            if batch.user_id:
                try:
                    user_id = uuid.UUID(batch.user_id)
                except ValueError:
                    pass

            session = AnalyticsSession(
                fingerprint=fingerprint,
                user_id=user_id,
                ip=ip,
                browser=ua_info["browser"],
                browser_version=ua_info["browser_version"],
                os=ua_info["os"],
                device_type=ua_info["device_type"],
                screen_width=batch.screen_width,
                screen_height=batch.screen_height,
                language=batch.language,
                referrer=batch.referrer,
                utm_source=batch.utm_source,
                utm_medium=batch.utm_medium,
                utm_campaign=batch.utm_campaign,
                started_at=now,
                page_count=0,
                is_bounce=True,
            )
            self.db.add(session)
            await self.db.flush()
        else:
            # Обновить user_id если появился
            if batch.user_id and not session.user_id:
                try:
                    session.user_id = uuid.UUID(batch.user_id)
                except ValueError:
                    pass

        # Вставка событий
        pageview_count = 0
        for ev in batch.events:
            event = AnalyticsEvent(
                session_id=session.id,
                event_type=ev.type,
                page_path=ev.path,
                page_title=ev.title,
                element_id=ev.element,
                scroll_depth=ev.scroll_depth,
                error_message=ev.error,
                extra_data=ev.metadata,
                created_at=ev.timestamp,
            )
            self.db.add(event)

            if ev.type == "pageview":
                pageview_count += 1

            # Обработка конверсий
            if ev.type == "conversion" and ev.conversion_type:
                conversion = AnalyticsConversion(
                    session_id=session.id,
                    user_id=session.user_id,
                    conversion_type=ev.conversion_type,
                    extra_data=ev.metadata,
                    created_at=ev.timestamp,
                )
                self.db.add(conversion)

        # Обновить счетчики сессии
        session.page_count += pageview_count
        if session.page_count > 1:
            session.is_bounce = False
        session.ended_at = now
        if session.started_at:
            started = session.started_at
            # SQLite теряет timezone info - нормализуем
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            session.duration_seconds = int(
                (now - started).total_seconds()
            )

        await self.db.commit()

        return IngestResponse(
            session_id=session.fingerprint,
            events_count=len(batch.events),
        )

    async def _find_active_session(
        self, fingerprint: str, cutoff: datetime
    ) -> AnalyticsSession | None:
        """Найти активную сессию по fingerprint."""
        stmt = (
            select(AnalyticsSession)
            .where(
                AnalyticsSession.fingerprint == fingerprint,
                AnalyticsSession.started_at >= cutoff,
            )
            .order_by(AnalyticsSession.started_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_overview(self, days: int = 7) -> OverviewStats:
        """Агрегированная статистика за период."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Уникальные посетители
        visitors_q = select(
            func.count(distinct(AnalyticsSession.fingerprint))
        ).where(AnalyticsSession.started_at >= since)
        visitors_result = await self.db.execute(visitors_q)
        visitors = visitors_result.scalar() or 0

        # Просмотры страниц
        pageviews_q = select(func.count(AnalyticsEvent.id)).where(
            AnalyticsEvent.created_at >= since,
            AnalyticsEvent.event_type == "pageview",
        )
        pageviews_result = await self.db.execute(pageviews_q)
        pageviews = pageviews_result.scalar() or 0

        # Сессии
        sessions_q = select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.started_at >= since
        )
        sessions_result = await self.db.execute(sessions_q)
        sessions = sessions_result.scalar() or 0

        # Bounce rate
        bounced_q = select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.started_at >= since,
            AnalyticsSession.is_bounce == True,  # noqa: E712
        )
        bounced_result = await self.db.execute(bounced_q)
        bounced = bounced_result.scalar() or 0
        bounce_rate = (bounced / sessions * 100) if sessions > 0 else 0.0

        # Средняя длительность
        avg_dur_q = select(
            func.avg(AnalyticsSession.duration_seconds)
        ).where(
            AnalyticsSession.started_at >= since,
            AnalyticsSession.duration_seconds.isnot(None),
        )
        avg_dur_result = await self.db.execute(avg_dur_q)
        avg_duration = float(avg_dur_result.scalar() or 0)

        # Данные по дням
        daily_data = await self._get_daily_data(since, days)

        return OverviewStats(
            visitors=visitors,
            pageviews=pageviews,
            sessions=sessions,
            bounce_rate=round(bounce_rate, 1),
            avg_duration=round(avg_duration, 1),
            daily_data=daily_data,
        )

    async def _get_daily_data(
        self, since: datetime, days: int
    ) -> list[DailyDataPoint]:
        """Получить данные по дням для графика (2 запроса вместо 3*days)."""
        now = datetime.now(timezone.utc)

        # Сессии и уники по дням - 1 запрос
        date_expr = func.date(AnalyticsSession.started_at)
        sess_q = (
            select(
                date_expr.label("day"),
                func.count(AnalyticsSession.id).label("sessions"),
                func.count(distinct(AnalyticsSession.fingerprint)).label("visitors"),
            )
            .where(AnalyticsSession.started_at >= since)
            .group_by("day")
        )
        sess_r = await self.db.execute(sess_q)
        sess_by_day: dict[str, tuple[int, int]] = {}
        for row in sess_r.all():
            day_str = str(row.day)
            sess_by_day[day_str] = (row.sessions, row.visitors)

        # Просмотры по дням - 1 запрос
        pv_date_expr = func.date(AnalyticsEvent.created_at)
        pv_q = (
            select(
                pv_date_expr.label("day"),
                func.count(AnalyticsEvent.id).label("pageviews"),
            )
            .where(
                AnalyticsEvent.created_at >= since,
                AnalyticsEvent.event_type == "pageview",
            )
            .group_by("day")
        )
        pv_r = await self.db.execute(pv_q)
        pv_by_day: dict[str, int] = {}
        for row in pv_r.all():
            pv_by_day[str(row.day)] = row.pageviews

        # Собрать результат с заполнением пустых дней нулями
        result = []
        for i in range(days):
            day_start = (now - timedelta(days=days - 1 - i)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            day_str = day_start.strftime("%Y-%m-%d")
            sessions, visitors = sess_by_day.get(day_str, (0, 0))
            pageviews = pv_by_day.get(day_str, 0)
            result.append(
                DailyDataPoint(
                    date=day_str,
                    visitors=visitors,
                    pageviews=pageviews,
                    sessions=sessions,
                )
            )

        return result

    async def get_pages(
        self, days: int = 7, limit: int = 20
    ) -> list[PageStats]:
        """Топ страниц с метриками."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Pageview stats
        stmt = (
            select(
                AnalyticsEvent.page_path,
                func.count(AnalyticsEvent.id).label("views"),
                func.count(distinct(AnalyticsEvent.session_id)).label(
                    "unique_visitors"
                ),
            )
            .where(
                AnalyticsEvent.created_at >= since,
                AnalyticsEvent.event_type == "pageview",
                AnalyticsEvent.page_path.isnot(None),
            )
            .group_by(AnalyticsEvent.page_path)
            .order_by(func.count(AnalyticsEvent.id).desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        page_rows = result.all()

        # Max scroll depth per page (from scroll_depth events)
        scroll_stmt = (
            select(
                AnalyticsEvent.page_path,
                func.max(AnalyticsEvent.scroll_depth).label("max_scroll"),
            )
            .where(
                AnalyticsEvent.created_at >= since,
                AnalyticsEvent.event_type == "scroll_depth",
                AnalyticsEvent.page_path.isnot(None),
            )
            .group_by(AnalyticsEvent.page_path)
        )
        scroll_result = await self.db.execute(scroll_stmt)
        scroll_map: dict[str, int] = {
            r.page_path: r.max_scroll for r in scroll_result.all() if r.page_path
        }

        return [
            PageStats(
                path=row.page_path,
                views=row.views,
                unique_visitors=row.unique_visitors,
                avg_scroll=float(scroll_map.get(row.page_path, 0)),
            )
            for row in page_rows
        ]

    async def get_sources(self, days: int = 7) -> list[SourceStats]:
        """Распределение по источникам трафика."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Общее количество сессий за период
        total_q = select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.started_at >= since
        )
        total_r = await self.db.execute(total_q)
        total = total_r.scalar() or 0

        if total == 0:
            return []

        # Группировка по referrer / utm_source
        stmt = (
            select(
                func.coalesce(
                    AnalyticsSession.utm_source,
                    AnalyticsSession.referrer,
                    "direct",
                ).label("source"),
                func.count(AnalyticsSession.id).label("visits"),
            )
            .where(AnalyticsSession.started_at >= since)
            .group_by("source")
            .order_by(func.count(AnalyticsSession.id).desc())
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        return [
            SourceStats(
                source=row.source,
                visits=row.visits,
                percentage=round(row.visits / total * 100, 1),
            )
            for row in rows
        ]

    async def _get_distribution(
        self, column: Any, since: datetime, total: int
    ) -> list[DistributionItem]:
        """Получить распределение по колонке сессий."""
        stmt = (
            select(
                column.label("name"),
                func.count(AnalyticsSession.id).label("cnt"),
            )
            .where(
                AnalyticsSession.started_at >= since,
                column.isnot(None),
            )
            .group_by(column)
            .order_by(func.count(AnalyticsSession.id).desc())
        )
        result = await self.db.execute(stmt)
        return [
            DistributionItem(
                name=row.name,
                count=row.cnt,
                percentage=round(row.cnt / total * 100, 1),
            )
            for row in result.all()
        ]

    async def get_devices(self, days: int = 7) -> DeviceStats:
        """Распределение по браузерам, ОС, устройствам и странам."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        total_q = select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.started_at >= since
        )
        total_r = await self.db.execute(total_q)
        total = total_r.scalar() or 0

        if total == 0:
            return DeviceStats(
                browsers=[], os_list=[], device_types=[], countries=[]
            )

        return DeviceStats(
            browsers=await self._get_distribution(AnalyticsSession.browser, since, total),
            os_list=await self._get_distribution(AnalyticsSession.os, since, total),
            device_types=await self._get_distribution(AnalyticsSession.device_type, since, total),
            countries=await self._get_distribution(AnalyticsSession.country, since, total),
        )

    async def get_funnel(self, days: int = 30) -> list[FunnelStep]:
        """Воронка конверсий."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Первый шаг - визиты (сессии)
        visits_q = select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.started_at >= since
        )
        visits_r = await self.db.execute(visits_q)
        total_visits = visits_r.scalar() or 0

        steps = []
        for step_type, step_name in FUNNEL_STEPS:
            if step_type == "visit":
                count = total_visits
            else:
                conv_q = select(
                    func.count(distinct(AnalyticsConversion.session_id))
                ).where(
                    AnalyticsConversion.created_at >= since,
                    AnalyticsConversion.conversion_type == step_type,
                )
                conv_r = await self.db.execute(conv_q)
                count = conv_r.scalar() or 0

            rate = (count / total_visits * 100) if total_visits > 0 else 0.0
            steps.append(
                FunnelStep(
                    step_name=step_name,
                    count=count,
                    conversion_rate=round(rate, 1),
                )
            )

        return steps

    async def get_realtime(self) -> RealtimeStats:
        """Статистика в реальном времени (последние 5 минут)."""
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

        # Количество активных сессий
        online_q = select(
            func.count(distinct(AnalyticsSession.fingerprint))
        ).where(
            AnalyticsSession.ended_at >= cutoff,
        )
        online_r = await self.db.execute(online_q)
        online_count = online_r.scalar() or 0

        # Активные страницы
        pages_q = (
            select(
                AnalyticsEvent.page_path,
                func.count(distinct(AnalyticsEvent.session_id)).label(
                    "visitors"
                ),
            )
            .where(
                AnalyticsEvent.created_at >= cutoff,
                AnalyticsEvent.event_type == "pageview",
                AnalyticsEvent.page_path.isnot(None),
            )
            .group_by(AnalyticsEvent.page_path)
            .order_by(
                func.count(distinct(AnalyticsEvent.session_id)).desc()
            )
            .limit(10)
        )
        pages_r = await self.db.execute(pages_q)
        active_pages = [
            ActivePage(path=row.page_path, visitors=row.visitors)
            for row in pages_r.all()
        ]

        return RealtimeStats(
            online_count=online_count,
            active_pages=active_pages,
        )

    async def get_events(
        self,
        days: int = 7,
        event_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> EventListResponse:
        """Список событий с фильтрами и пагинацией."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Базовые условия
        conditions = [AnalyticsEvent.created_at >= since]
        if event_type:
            conditions.append(AnalyticsEvent.event_type == event_type)

        # Подсчет
        count_q = select(func.count(AnalyticsEvent.id)).where(*conditions)
        count_r = await self.db.execute(count_q)
        total = count_r.scalar() or 0

        # Выборка с пагинацией + join session + user
        stmt = (
            select(
                AnalyticsEvent,
                AnalyticsSession.ip,
                AnalyticsSession.browser,
                AnalyticsSession.device_type,
                User.email.label("user_email"),
            )
            .join(AnalyticsSession, AnalyticsEvent.session_id == AnalyticsSession.id)
            .outerjoin(User, AnalyticsSession.user_id == User.id)
            .where(*conditions)
            .order_by(AnalyticsEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        items: list[EventItem] = []
        for event, ip, browser, device_type, user_email in rows:
            meta = event.metadata
            if meta is not None and not isinstance(meta, dict):
                meta = None
            items.append(EventItem(
                id=event.id,
                session_id=event.session_id,
                event_type=event.event_type,
                page_path=event.page_path,
                page_title=event.page_title,
                element_id=event.element_id,
                scroll_depth=event.scroll_depth,
                error_message=event.error_message,
                metadata=meta,
                created_at=event.created_at,
                ip=ip,
                user_email=user_email,
                browser=browser,
                device_type=device_type,
            ))

        return EventListResponse(
            items=items,
            total=total,
        )
