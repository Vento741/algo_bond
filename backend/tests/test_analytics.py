"""Тесты модуля аналитики."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models import (
    AnalyticsConversion,
    AnalyticsEvent,
    AnalyticsSession,
)
from app.modules.analytics.schemas import EventBatch
from app.modules.analytics.service import AnalyticsService, make_fingerprint, parse_user_agent
from app.modules.auth.models import User

pytestmark = pytest.mark.asyncio

# Тестовые данные
TEST_IP = "192.168.1.1"
TEST_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
TEST_FINGERPRINT = make_fingerprint(TEST_IP, TEST_UA)


def _make_event_batch(
    events: list[dict] | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
) -> dict:
    """Создать тело запроса EventBatch."""
    now = datetime.now(timezone.utc).isoformat()
    if events is None:
        events = [
            {"type": "pageview", "path": "/", "title": "Главная", "timestamp": now},
        ]
    return {
        "session_id": session_id,
        "events": events,
        "screen_width": 1920,
        "screen_height": 1080,
        "language": "ru",
        "referrer": "https://google.com",
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "spring",
        "user_id": user_id,
    }


@pytest_asyncio.fixture
async def analytics_session(db_session: AsyncSession) -> AnalyticsSession:
    """Создать тестовую аналитическую сессию."""
    now = datetime.now(timezone.utc)
    session = AnalyticsSession(
        fingerprint=TEST_FINGERPRINT,
        ip=TEST_IP,
        browser="Chrome",
        browser_version="120",
        os="Windows",
        device_type="desktop",
        screen_width=1920,
        screen_height=1080,
        language="ru",
        referrer="https://google.com",
        utm_source="google",
        started_at=now,
        ended_at=now,
        duration_seconds=60,
        page_count=3,
        is_bounce=False,
    )
    db_session.add(session)
    await db_session.flush()

    # Добавить события
    for i, path in enumerate(["/", "/strategies", "/bots"]):
        event = AnalyticsEvent(
            session_id=session.id,
            event_type="pageview",
            page_path=path,
            page_title=f"Page {i}",
            scroll_depth=50 + i * 25,
            created_at=now + timedelta(seconds=i * 20),
        )
        db_session.add(event)

    # Добавить scroll-событие
    scroll_event = AnalyticsEvent(
        session_id=session.id,
        event_type="scroll",
        page_path="/",
        scroll_depth=75,
        created_at=now + timedelta(seconds=5),
    )
    db_session.add(scroll_event)

    # Добавить конверсию
    conversion = AnalyticsConversion(
        session_id=session.id,
        conversion_type="access_request",
        extra_data={"telegram": "@test"},
        created_at=now,
    )
    db_session.add(conversion)

    await db_session.commit()
    await db_session.refresh(session)
    return session


# === Unit-тесты UA parser ===


class TestParseUserAgent:
    """Тесты парсера User-Agent."""

    def test_chrome_windows(self) -> None:
        """Chrome на Windows."""
        result = parse_user_agent(TEST_UA)
        assert result["browser"] == "Chrome"
        assert result["browser_version"] == "120"
        assert result["os"] == "Windows"
        assert result["device_type"] == "desktop"

    def test_firefox_linux(self) -> None:
        """Firefox на Linux."""
        ua = "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121"
        result = parse_user_agent(ua)
        assert result["browser"] == "Firefox"
        assert result["browser_version"] == "121"
        assert result["os"] == "Linux"

    def test_safari_mobile(self) -> None:
        """Safari на iPhone."""
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Mobile/15E148 Safari/604.1"
        result = parse_user_agent(ua)
        assert result["browser"] == "Safari"
        assert result["os"] == "iOS"
        assert result["device_type"] == "mobile"

    def test_edge(self) -> None:
        """Edge browser."""
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120"
        result = parse_user_agent(ua)
        assert result["browser"] == "Edge"
        assert result["os"] == "Windows"

    def test_tablet(self) -> None:
        """iPad detection."""
        ua = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        result = parse_user_agent(ua)
        assert result["device_type"] == "tablet"


# === Тесты ingestion через service ===


class TestIngestEvents:
    """Тесты приема событий."""

    async def test_ingest_creates_session(
        self, db_session: AsyncSession
    ) -> None:
        """Ingest создает новую сессию если не существует."""
        service = AnalyticsService(db_session)
        batch_data = _make_event_batch()

        batch = EventBatch(**batch_data)
        result = await service.ingest_events(batch, TEST_IP, TEST_UA)

        assert result.session_id == TEST_FINGERPRINT
        assert result.events_count == 1

        stmt = select(AnalyticsSession).where(
            AnalyticsSession.fingerprint == TEST_FINGERPRINT
        )
        db_result = await db_session.execute(stmt)
        session = db_result.scalar_one()
        assert session.browser == "Chrome"
        assert session.os == "Windows"
        assert session.screen_width == 1920
        assert session.utm_source == "google"

    async def test_ingest_reuses_session(
        self, db_session: AsyncSession
    ) -> None:
        """Повторный ingest с тем же fingerprint переиспользует сессию (в пределах 30 мин)."""
        service = AnalyticsService(db_session)

        # Первый batch
        batch1 = EventBatch(**_make_event_batch())
        await service.ingest_events(batch1, TEST_IP, TEST_UA)

        # Второй batch
        now = datetime.now(timezone.utc).isoformat()
        batch2 = EventBatch(
            **_make_event_batch(
                events=[
                    {
                        "type": "pageview",
                        "path": "/strategies",
                        "title": "Стратегии",
                        "timestamp": now,
                    }
                ]
            )
        )
        await service.ingest_events(batch2, TEST_IP, TEST_UA)

        count_q = select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.fingerprint == TEST_FINGERPRINT
        )
        count_r = await db_session.execute(count_q)
        assert count_r.scalar() == 1

        # Но два события
        ev_count_q = select(func.count(AnalyticsEvent.id))
        ev_count_r = await db_session.execute(ev_count_q)
        assert ev_count_r.scalar() == 2

    async def test_ingest_creates_events(
        self, db_session: AsyncSession
    ) -> None:
        """Ingest создает события в БД."""
        service = AnalyticsService(db_session)
        now = datetime.now(timezone.utc).isoformat()

        batch = EventBatch(
            **_make_event_batch(
                events=[
                    {"type": "pageview", "path": "/", "title": "Главная", "timestamp": now},
                    {"type": "click", "path": "/", "element": "cta-button", "timestamp": now},
                    {"type": "scroll", "path": "/", "scroll_depth": 75, "timestamp": now},
                ]
            )
        )
        result = await service.ingest_events(batch, TEST_IP, TEST_UA)
        assert result.events_count == 3

        stmt = select(AnalyticsEvent).order_by(AnalyticsEvent.created_at)
        db_result = await db_session.execute(stmt)
        events = db_result.scalars().all()
        assert len(events) == 3
        assert events[0].event_type == "pageview"
        assert events[1].event_type == "click"
        assert events[1].element_id == "cta-button"
        assert events[2].scroll_depth == 75

    async def test_ingest_tracks_conversion(
        self, db_session: AsyncSession
    ) -> None:
        """Ingest создает запись конверсии для событий типа conversion."""
        service = AnalyticsService(db_session)
        now = datetime.now(timezone.utc).isoformat()

        batch = EventBatch(
            **_make_event_batch(
                events=[
                    {
                        "type": "conversion",
                        "conversion_type": "register",
                        "metadata": {"method": "email"},
                        "timestamp": now,
                    }
                ]
            )
        )
        await service.ingest_events(batch, TEST_IP, TEST_UA)

        stmt = select(AnalyticsConversion)
        db_result = await db_session.execute(stmt)
        conversion = db_result.scalar_one()
        assert conversion.conversion_type == "register"
        assert conversion.extra_data == {"method": "email"}

    async def test_ingest_updates_page_count(
        self, db_session: AsyncSession
    ) -> None:
        """Ingest обновляет page_count и is_bounce в сессии."""
        service = AnalyticsService(db_session)
        now = datetime.now(timezone.utc).isoformat()

        # Один pageview - bounce
        batch1 = EventBatch(**_make_event_batch())
        await service.ingest_events(batch1, TEST_IP, TEST_UA)

        stmt = select(AnalyticsSession).where(
            AnalyticsSession.fingerprint == TEST_FINGERPRINT
        )
        r = await db_session.execute(stmt)
        sess = r.scalar_one()
        assert sess.page_count == 1
        assert sess.is_bounce is True

        # Второй pageview - не bounce
        batch2 = EventBatch(
            **_make_event_batch(
                events=[
                    {
                        "type": "pageview",
                        "path": "/about",
                        "title": "О нас",
                        "timestamp": now,
                    }
                ]
            )
        )
        await service.ingest_events(batch2, TEST_IP, TEST_UA)

        await db_session.refresh(sess)
        assert sess.page_count == 2
        assert sess.is_bounce is False


# === API endpoint тесты ===


class TestIngestEndpoint:
    """Тесты POST /api/analytics/events."""

    async def test_ingest_endpoint(self, client: AsyncClient) -> None:
        """Успешный ingest через API."""
        resp = await client.post(
            "/api/analytics/events",
            json=_make_event_batch(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        assert data["events_count"] == 1

    async def test_ingest_empty_events(self, client: AsyncClient) -> None:
        """Ingest с пустым списком событий."""
        resp = await client.post(
            "/api/analytics/events",
            json={"events": []},
        )
        assert resp.status_code == 200
        assert resp.json()["events_count"] == 0


class TestAdminEndpoints:
    """Тесты административных эндпоинтов аналитики."""

    async def test_admin_required(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        """Обычный пользователь не может просматривать аналитику."""
        resp = await client.get(
            "/api/admin/analytics/overview", headers=auth_headers
        )
        assert resp.status_code == 403

    async def test_overview_stats(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Получение overview статистики."""
        resp = await client.get(
            "/api/admin/analytics/overview?days=7",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["visitors"] >= 1
        assert data["pageviews"] >= 3
        assert data["sessions"] >= 1
        assert "bounce_rate" in data
        assert "avg_duration" in data
        assert "daily_data" in data
        assert isinstance(data["daily_data"], list)

    async def test_pages_stats(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Получение статистики по страницам."""
        resp = await client.get(
            "/api/admin/analytics/pages?days=7",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # Проверяем структуру
        page = data[0]
        assert "path" in page
        assert "views" in page
        assert "unique_visitors" in page

    async def test_sources_stats(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Получение статистики по источникам."""
        resp = await client.get(
            "/api/admin/analytics/sources?days=7",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        source = data[0]
        assert "source" in source
        assert "visits" in source
        assert "percentage" in source

    async def test_devices_stats(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Получение статистики по устройствам."""
        resp = await client.get(
            "/api/admin/analytics/devices?days=7",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "browsers" in data
        assert "os_list" in data
        assert "device_types" in data
        assert "countries" in data
        # Проверяем что данные есть
        assert len(data["browsers"]) >= 1
        assert data["browsers"][0]["name"] == "Chrome"

    async def test_funnel_stats(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Получение воронки конверсий."""
        resp = await client.get(
            "/api/admin/analytics/funnel?days=30",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 5  # 5 шагов в FUNNEL_STEPS
        # Первый шаг - визиты
        assert data[0]["step_name"] == "Визит"
        assert data[0]["count"] >= 1
        assert data[0]["conversion_rate"] == 100.0
        # Второй шаг - заявка на доступ
        assert data[1]["step_name"] == "Заявка на доступ"
        assert data[1]["count"] >= 1

    async def test_realtime_stats(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Получение статистики в реальном времени."""
        resp = await client.get(
            "/api/admin/analytics/realtime",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "online_count" in data
        assert "active_pages" in data
        # Сессия только что создана - должна быть online
        assert data["online_count"] >= 1

    async def test_events_list(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Получение списка событий."""
        resp = await client.get(
            "/api/admin/analytics/events?days=7",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 4  # 3 pageviews + 1 scroll
        assert len(data["items"]) >= 4

    async def test_events_filter_by_type(
        self,
        client: AsyncClient,
        admin_headers: dict,
        analytics_session: AnalyticsSession,
    ) -> None:
        """Фильтрация событий по типу."""
        resp = await client.get(
            "/api/admin/analytics/events?days=7&type=pageview",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 3
        for item in data["items"]:
            assert item["event_type"] == "pageview"

    async def test_overview_empty(
        self,
        client: AsyncClient,
        admin_headers: dict,
    ) -> None:
        """Overview при пустой БД."""
        resp = await client.get(
            "/api/admin/analytics/overview?days=7",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["visitors"] == 0
        assert data["pageviews"] == 0
        assert data["sessions"] == 0
        assert data["bounce_rate"] == 0.0

    async def test_unauthorized_access(self, client: AsyncClient) -> None:
        """Неавторизованный запрос к admin-эндпоинтам."""
        resp = await client.get("/api/admin/analytics/overview")
        assert resp.status_code == 401
