# Telegram Bot + Monitor Auto-Fix Pipeline - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Интегрировать Telegram-бота (@algo_bond_bot) в AlgoBond - уведомления, управление ботами, WebApp Mini App, Monitor auto-fix pipeline.

**Architecture:** Новый модуль `backend/app/modules/telegram/` с aiogram 3.27+ webhook через FastAPI. Фронтенд расширяется `/tg/*` роутами для Mini App. Hooks pipeline в `.claude/settings.json`.

**Tech Stack:** aiogram 3.27+, FastAPI webhook, @tma.js/sdk-react, HMAC-SHA256, Redis pub/sub, Celery Beat

**Spec:** `docs/superpowers/specs/2026-04-10-telegram-bot-monitor-pipeline-design.md`

---

## File Map

### Создать (backend)

| Файл | Ответственность |
|------|----------------|
| `backend/app/modules/telegram/__init__.py` | Экспорт модуля |
| `backend/app/modules/telegram/models.py` | TelegramLink, TelegramDeepLinkToken |
| `backend/app/modules/telegram/schemas.py` | Pydantic v2 схемы |
| `backend/app/modules/telegram/service.py` | TelegramService - привязка, отправка |
| `backend/app/modules/telegram/router.py` | FastAPI endpoints (webhook, link, webapp auth) |
| `backend/app/modules/telegram/bot.py` | Bot instance, Dispatcher, setup/shutdown |
| `backend/app/modules/telegram/webapp_auth.py` | initData HMAC-SHA256 валидация |
| `backend/app/modules/telegram/notifications.py` | TelegramNotifier - отправка в TG |
| `backend/app/modules/telegram/keyboards.py` | InlineKeyboard builders |
| `backend/app/modules/telegram/formatters.py` | Форматирование сообщений (HTML) |
| `backend/app/modules/telegram/handlers/__init__.py` | Регистрация роутеров |
| `backend/app/modules/telegram/handlers/start.py` | /start, deep link |
| `backend/app/modules/telegram/handlers/status.py` | /status, /pnl, /balance, /positions |
| `backend/app/modules/telegram/handlers/help.py` | /help, /app, /settings |
| `backend/app/modules/telegram/handlers/admin.py` | /admin, /health, /logs, /users |
| `backend/app/modules/telegram/handlers/callbacks.py` | Inline-кнопки |
| `backend/app/modules/telegram/middleware.py` | Auth, Admin, DbSession middleware |
| `backend/app/modules/telegram/celery_tasks.py` | Daily P&L report, margin warnings |

### Создать (тесты)

| Файл | Ответственность |
|------|----------------|
| `backend/tests/test_telegram_models.py` | Модели TelegramLink, DeepLinkToken |
| `backend/tests/test_telegram_service.py` | TelegramService (привязка, отправка) |
| `backend/tests/test_telegram_router.py` | API endpoints |
| `backend/tests/test_telegram_webapp_auth.py` | HMAC-SHA256 валидация |
| `backend/tests/test_telegram_notifications.py` | Интеграция с NotificationService |
| `backend/tests/test_telegram_handlers.py` | Bot handlers |

### Создать (frontend)

| Файл | Ответственность |
|------|----------------|
| `frontend/src/layouts/TelegramLayout.tsx` | Layout для Mini App (bottom nav, no sidebar) |
| `frontend/src/pages/tg/TgDashboard.tsx` | Компактный дашборд |
| `frontend/src/pages/tg/TgBots.tsx` | Список ботов + старт/стоп |
| `frontend/src/pages/tg/TgBotDetail.tsx` | Детали бота, позиции |
| `frontend/src/pages/tg/TgStrategies.tsx` | Стратегии |
| `frontend/src/pages/tg/TgChart.tsx` | Упрощенный чарт |
| `frontend/src/pages/tg/TgBacktest.tsx` | Запуск/результаты |
| `frontend/src/pages/tg/TgSettings.tsx` | Настройки уведомлений |
| `frontend/src/components/tg/TgBottomNav.tsx` | Bottom navigation (5 табов) |
| `frontend/src/components/tg/TgHeader.tsx` | Compact header + BackButton |
| `frontend/src/components/tg/TgCard.tsx` | Touch-friendly card |
| `frontend/src/components/tg/TgPnlWidget.tsx` | Компактный P&L виджет |
| `frontend/src/hooks/useTelegramAuth.ts` | initData -> JWT авторизация |
| `frontend/src/stores/telegram.ts` | Zustand store для TG state |
| `frontend/src/lib/telegram.ts` | WebApp SDK helpers |

### Создать (hooks)

| Файл | Ответственность |
|------|----------------|
| `.claude/hooks/auto-lint.sh` | ruff + prettier после Edit/Write |
| `.claude/hooks/safety-guard.sh` | Блок опасных команд |
| `.claude/hooks/circuit-breaker.sh` | Подсчет failures, алерт в TG |
| `.claude/agents/telegram-dev.md` | Агент telegram-dev |

### Модифицировать

| Файл | Что меняется |
|------|-------------|
| `backend/app/config.py:50` | Добавить telegram_* поля в Settings |
| `backend/app/main.py:28-54` | Добавить setup/shutdown telegram bot в lifespan |
| `backend/app/main.py:90-91` | Добавить include_router(telegram_router) |
| `backend/app/modules/notifications/models.py:67-72` | Добавить telegram_* и finance/security колонки |
| `backend/app/modules/notifications/service.py:61-62` | Добавить вызов TelegramNotifier после Redis publish |
| `backend/app/modules/notifications/schemas.py` | Добавить telegram поля в схемы |
| `backend/app/modules/notifications/enums.py` | Добавить finance и security категории |
| `backend/app/celery_app.py:41-44` | Добавить telegram tasks в beat_schedule |
| `backend/requirements.txt` | Добавить aiogram>=3.27.0,<4.0 |
| `frontend/src/App.tsx:42-93` | Добавить /tg/* роуты |
| `frontend/src/pages/Settings.tsx` | Добавить секцию Telegram + TG колонку |
| `frontend/src/types/api.ts` | Добавить TelegramLink, TelegramSettings типы |
| `frontend/package.json` | Добавить @tma.js/sdk-react, @tma.js/sdk |
| `docker-compose.yml` | Добавить TELEGRAM_* env vars |
| `.env.example` | Добавить TELEGRAM_* переменные |
| `.claude/settings.json` | Добавить hooks конфигурацию |

---

## Task 1: Конфигурация и зависимости

**Files:**
- Modify: `backend/app/config.py:50`
- Modify: `backend/requirements.txt`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Добавить Telegram-поля в Settings**

В `backend/app/config.py`, после `bybit_demo: bool = False` (строка 50), добавить:

```python
    # Telegram
    telegram_bot_token: str = ""
    telegram_webhook_secret: str = ""
    telegram_admin_chat_id: int = 0
    telegram_webapp_url: str = ""
```

- [ ] **Step 2: Добавить aiogram в зависимости**

В `backend/requirements.txt` добавить:

```
aiogram>=3.27.0,<4.0
```

- [ ] **Step 3: Обновить .env.example**

Добавить секцию в конец `.env.example`:

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_SECRET=generate_random_64_hex
TELEGRAM_ADMIN_CHAT_ID=0
TELEGRAM_WEBAPP_URL=https://algo.dev-james.bond/tg
```

- [ ] **Step 4: Обновить docker-compose.yml**

В секцию `api.environment` добавить:

```yaml
    - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    - TELEGRAM_WEBHOOK_SECRET=${TELEGRAM_WEBHOOK_SECRET}
    - TELEGRAM_ADMIN_CHAT_ID=${TELEGRAM_ADMIN_CHAT_ID}
    - TELEGRAM_WEBAPP_URL=${TELEGRAM_WEBAPP_URL}
```

- [ ] **Step 5: Проверить что config загружается**

Run: `cd backend && python -c "from app.config import settings; print(settings.telegram_bot_token)"`
Expected: пустая строка (default)

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/requirements.txt .env.example docker-compose.yml
git commit -m "feat(telegram): add config, dependencies, env vars"
```

---

## Task 2: Модели БД и миграция

**Files:**
- Create: `backend/app/modules/telegram/__init__.py`
- Create: `backend/app/modules/telegram/models.py`
- Modify: `backend/app/modules/notifications/models.py:67-72`
- Test: `backend/tests/test_telegram_models.py`

- [ ] **Step 1: Написать тест для моделей**

Создать `backend/tests/test_telegram_models.py`:

```python
"""Тесты моделей Telegram."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.modules.telegram.models import TelegramDeepLinkToken, TelegramLink


@pytest.mark.asyncio
async def test_create_telegram_link(setup_db, get_test_db):
    """Создание привязки Telegram аккаунта."""
    async with get_test_db() as db:
        user_id = uuid.uuid4()
        link = TelegramLink(
            user_id=user_id,
            telegram_id=123456789,
            telegram_username="testuser",
            chat_id=123456789,
            is_active=True,
        )
        db.add(link)
        await db.flush()

        result = await db.execute(
            select(TelegramLink).where(TelegramLink.telegram_id == 123456789)
        )
        saved = result.scalar_one()
        assert saved.user_id == user_id
        assert saved.telegram_username == "testuser"
        assert saved.is_active is True
        assert saved.linked_at is not None


@pytest.mark.asyncio
async def test_create_deep_link_token(setup_db, get_test_db):
    """Создание токена для deep link привязки."""
    async with get_test_db() as db:
        user_id = uuid.uuid4()
        token = TelegramDeepLinkToken(
            user_id=user_id,
            token="a" * 32,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        db.add(token)
        await db.flush()

        result = await db.execute(
            select(TelegramDeepLinkToken).where(
                TelegramDeepLinkToken.token == "a" * 32
            )
        )
        saved = result.scalar_one()
        assert saved.user_id == user_id
        assert saved.used is False


@pytest.mark.asyncio
async def test_deep_link_token_expired(setup_db, get_test_db):
    """Проверка что expired токен определяется корректно."""
    async with get_test_db() as db:
        token = TelegramDeepLinkToken(
            user_id=uuid.uuid4(),
            token="b" * 32,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        db.add(token)
        await db.flush()

        result = await db.execute(
            select(TelegramDeepLinkToken).where(
                TelegramDeepLinkToken.token == "b" * 32,
                TelegramDeepLinkToken.expires_at > datetime.now(timezone.utc),
                TelegramDeepLinkToken.used == False,
            )
        )
        assert result.scalar_one_or_none() is None
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend && pytest tests/test_telegram_models.py -v`
Expected: FAIL - `ModuleNotFoundError: No module named 'app.modules.telegram'`

- [ ] **Step 3: Создать модуль telegram с моделями**

Создать `backend/app/modules/telegram/__init__.py`:
```python
"""Модуль интеграции с Telegram."""
```

Создать `backend/app/modules/telegram/models.py`:

```python
"""Модели Telegram: TelegramLink, TelegramDeepLinkToken."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TelegramLink(Base):
    """Привязка Telegram аккаунта к пользователю AlgoBond."""

    __tablename__ = "telegram_links"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    telegram_id: Mapped[int] = mapped_column(
        BigInteger, nullable=False, unique=True, index=True
    )
    telegram_username: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    chat_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class TelegramDeepLinkToken(Base):
    """Одноразовый токен для привязки через deep link."""

    __tablename__ = "telegram_deep_link_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

- [ ] **Step 4: Расширить NotificationPreference**

В `backend/app/modules/notifications/models.py`, после строки 72 (`billing_enabled`), добавить:

```python
    # Telegram канал
    telegram_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    positions_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    bots_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    orders_telegram: Mapped[bool] = mapped_column(Boolean, default=False)
    backtest_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    system_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    finance_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    security_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    # Новые web-канал категории
    finance_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    security_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
```

- [ ] **Step 5: Запустить тесты**

Run: `cd backend && pytest tests/test_telegram_models.py -v`
Expected: PASS (3 тестов)

- [ ] **Step 6: Проверить существующие тесты**

Run: `cd backend && pytest tests/ -v --timeout=60`
Expected: все 148+ тестов проходят

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/telegram/ backend/app/modules/notifications/models.py backend/tests/test_telegram_models.py
git commit -m "feat(telegram): add models TelegramLink, DeepLinkToken, extend NotificationPreference"
```

---

## Task 3: Schemas (Pydantic v2)

**Files:**
- Create: `backend/app/modules/telegram/schemas.py`
- Modify: `backend/app/modules/notifications/schemas.py`

- [ ] **Step 1: Создать schemas.py**

Создать `backend/app/modules/telegram/schemas.py`:

```python
"""Pydantic v2 схемы для Telegram модуля."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TelegramLinkResponse(BaseModel):
    """Статус привязки Telegram."""

    model_config = ConfigDict(from_attributes=True)

    is_linked: bool
    telegram_username: str | None = None
    linked_at: datetime | None = None
    telegram_enabled: bool = False


class TelegramLinkCreate(BaseModel):
    """Ответ на создание deep link."""

    deep_link_url: str
    token: str
    expires_in_seconds: int = 900


class TelegramWebAppAuthRequest(BaseModel):
    """Запрос аутентификации через WebApp."""

    init_data: str


class TelegramWebAppAuthResponse(BaseModel):
    """JWT токены после WebApp аутентификации."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TelegramSettingsResponse(BaseModel):
    """Настройки Telegram-уведомлений."""

    model_config = ConfigDict(from_attributes=True)

    telegram_enabled: bool
    positions_telegram: bool
    bots_telegram: bool
    orders_telegram: bool
    backtest_telegram: bool
    system_telegram: bool
    finance_telegram: bool
    security_telegram: bool


class TelegramSettingsUpdate(BaseModel):
    """Обновление настроек Telegram-уведомлений."""

    telegram_enabled: bool | None = None
    positions_telegram: bool | None = None
    bots_telegram: bool | None = None
    orders_telegram: bool | None = None
    backtest_telegram: bool | None = None
    system_telegram: bool | None = None
    finance_telegram: bool | None = None
    security_telegram: bool | None = None


class AdminNotifyRequest(BaseModel):
    """Отправка произвольного уведомления админу."""

    message: str
    parse_mode: str = "HTML"
```

- [ ] **Step 2: Расширить notification schemas**

В `backend/app/modules/notifications/schemas.py`, добавить telegram-поля в `NotificationPreferencesResponse` и `NotificationPreferencesUpdate` (по аналогии с существующими полями `positions_enabled`, `bots_enabled` и т.д.):

Добавить в оба класса:
```python
    telegram_enabled: bool
    positions_telegram: bool
    bots_telegram: bool
    orders_telegram: bool
    backtest_telegram: bool
    system_telegram: bool
    finance_telegram: bool
    security_telegram: bool
    finance_enabled: bool
    security_enabled: bool
```

Для `Update` класса - все поля `Optional` (`bool | None = None`).

- [ ] **Step 3: Проверить импорт**

Run: `cd backend && python -c "from app.modules.telegram.schemas import TelegramLinkResponse; print('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/telegram/schemas.py backend/app/modules/notifications/schemas.py
git commit -m "feat(telegram): add Pydantic schemas, extend notification schemas"
```

---

## Task 4: WebApp Auth (HMAC-SHA256)

**Files:**
- Create: `backend/app/modules/telegram/webapp_auth.py`
- Test: `backend/tests/test_telegram_webapp_auth.py`

- [ ] **Step 1: Написать тесты**

Создать `backend/tests/test_telegram_webapp_auth.py`:

```python
"""Тесты валидации Telegram WebApp initData."""

import hashlib
import hmac
import json
import time
from urllib.parse import quote

import pytest

from app.modules.telegram.webapp_auth import validate_init_data, parse_init_data


BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"


def _make_init_data(bot_token: str, user_data: dict, auth_date: int | None = None) -> str:
    """Генерирует валидный initData для тестов."""
    if auth_date is None:
        auth_date = int(time.time())

    user_json = json.dumps(user_data, separators=(",", ":"))
    params = {
        "user": user_json,
        "auth_date": str(auth_date),
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
    }

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    hash_value = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    params["hash"] = hash_value

    return "&".join(f"{k}={quote(v)}" for k, v in params.items())


def test_validate_valid_init_data():
    """Валидный initData проходит проверку."""
    user = {"id": 123456789, "first_name": "Test", "username": "testuser"}
    init_data = _make_init_data(BOT_TOKEN, user)
    assert validate_init_data(init_data, BOT_TOKEN) is True


def test_validate_invalid_hash():
    """Невалидный hash отклоняется."""
    user = {"id": 123456789, "first_name": "Test"}
    init_data = _make_init_data(BOT_TOKEN, user)
    init_data = init_data.replace(init_data.split("hash=")[1][:10], "0000000000")
    assert validate_init_data(init_data, BOT_TOKEN) is False


def test_validate_missing_hash():
    """initData без hash отклоняется."""
    assert validate_init_data("user=%7B%7D&auth_date=123", BOT_TOKEN) is False


def test_validate_expired_data():
    """initData старше 1 часа отклоняется."""
    user = {"id": 123456789, "first_name": "Test"}
    old_auth_date = int(time.time()) - 7200  # 2 часа назад
    init_data = _make_init_data(BOT_TOKEN, user, auth_date=old_auth_date)
    assert validate_init_data(init_data, BOT_TOKEN, max_age=3600) is False


def test_parse_init_data():
    """Извлечение user данных из initData."""
    user = {"id": 123456789, "first_name": "Test", "username": "testuser"}
    init_data = _make_init_data(BOT_TOKEN, user)
    parsed = parse_init_data(init_data)
    assert parsed["user"]["id"] == 123456789
    assert parsed["user"]["username"] == "testuser"
```

- [ ] **Step 2: Запустить тесты, убедиться что падают**

Run: `cd backend && pytest tests/test_telegram_webapp_auth.py -v`
Expected: FAIL - `ModuleNotFoundError`

- [ ] **Step 3: Реализовать webapp_auth.py**

Создать `backend/app/modules/telegram/webapp_auth.py`:

```python
"""Валидация Telegram WebApp initData (HMAC-SHA256)."""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, unquote


def validate_init_data(
    init_data: str,
    bot_token: str,
    max_age: int = 86400,
) -> bool:
    """Проверить подпись initData от Telegram WebApp.

    Args:
        init_data: Raw initData строка из Telegram WebApp.
        bot_token: Токен бота для проверки подписи.
        max_age: Максимальный возраст данных в секундах (default 24h).

    Returns:
        True если подпись валидна и данные не устарели.
    """
    try:
        parsed = parse_qs(init_data, keep_blank_values=True)
        hash_list = parsed.pop("hash", [])
        if not hash_list:
            return False
        received_hash = hash_list[0]

        # Проверить auth_date
        auth_date_list = parsed.get("auth_date", ["0"])
        auth_date = int(auth_date_list[0])
        if max_age > 0 and (time.time() - auth_date) > max_age:
            return False

        # Построить data-check-string (отсортированные ключи)
        data_check_string = "\n".join(
            f"{k}={v[0]}" for k, v in sorted(parsed.items())
        )

        # HMAC-SHA256
        secret_key = hmac.new(
            b"WebAppData", bot_token.encode(), hashlib.sha256
        ).digest()
        computed_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(computed_hash, received_hash)
    except Exception:
        return False


def parse_init_data(init_data: str) -> dict:
    """Извлечь данные из initData.

    Returns:
        dict с ключами: user (dict), auth_date (int), query_id (str).
    """
    parsed = parse_qs(init_data, keep_blank_values=True)
    result: dict = {}

    user_raw = parsed.get("user", [None])[0]
    if user_raw:
        result["user"] = json.loads(unquote(user_raw))

    auth_date = parsed.get("auth_date", ["0"])[0]
    result["auth_date"] = int(auth_date)

    query_id = parsed.get("query_id", [None])[0]
    if query_id:
        result["query_id"] = query_id

    return result
```

- [ ] **Step 4: Запустить тесты**

Run: `cd backend && pytest tests/test_telegram_webapp_auth.py -v`
Expected: PASS (5 тестов)

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/telegram/webapp_auth.py backend/tests/test_telegram_webapp_auth.py
git commit -m "feat(telegram): webapp initData HMAC-SHA256 validation"
```

---

## Task 5: TelegramService (привязка, отвязка)

**Files:**
- Create: `backend/app/modules/telegram/service.py`
- Test: `backend/tests/test_telegram_service.py`

- [ ] **Step 1: Написать тесты**

Создать `backend/tests/test_telegram_service.py`:

```python
"""Тесты TelegramService: привязка, отвязка, токены."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.modules.telegram.models import TelegramDeepLinkToken, TelegramLink
from app.modules.telegram.service import TelegramService


@pytest.mark.asyncio
async def test_generate_deep_link_token(setup_db, get_test_db):
    """Генерация deep link токена."""
    async with get_test_db() as db:
        service = TelegramService(db)
        user_id = uuid.uuid4()
        result = await service.generate_deep_link_token(user_id)

        assert result.token is not None
        assert len(result.token) == 32
        assert result.expires_at > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_link_telegram(setup_db, get_test_db):
    """Привязка Telegram через deep link token."""
    async with get_test_db() as db:
        service = TelegramService(db)
        user_id = uuid.uuid4()

        # Создать токен
        token_obj = await service.generate_deep_link_token(user_id)

        # Привязать
        link = await service.link_telegram(
            token=token_obj.token,
            telegram_id=123456789,
            telegram_username="testuser",
            chat_id=123456789,
        )
        assert link is not None
        assert link.user_id == user_id
        assert link.telegram_id == 123456789


@pytest.mark.asyncio
async def test_link_expired_token(setup_db, get_test_db):
    """Expired токен не привязывает."""
    async with get_test_db() as db:
        service = TelegramService(db)
        user_id = uuid.uuid4()

        # Создать expired токен
        token_obj = TelegramDeepLinkToken(
            user_id=user_id,
            token="c" * 32,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        db.add(token_obj)
        await db.flush()

        link = await service.link_telegram(
            token="c" * 32,
            telegram_id=111,
            telegram_username="test",
            chat_id=111,
        )
        assert link is None


@pytest.mark.asyncio
async def test_link_used_token(setup_db, get_test_db):
    """Использованный токен не привязывает повторно."""
    async with get_test_db() as db:
        service = TelegramService(db)
        user_id = uuid.uuid4()

        token_obj = await service.generate_deep_link_token(user_id)
        # Первая привязка
        await service.link_telegram(
            token=token_obj.token,
            telegram_id=222,
            telegram_username="user1",
            chat_id=222,
        )
        # Вторая привязка с тем же токеном
        link = await service.link_telegram(
            token=token_obj.token,
            telegram_id=333,
            telegram_username="user2",
            chat_id=333,
        )
        assert link is None


@pytest.mark.asyncio
async def test_unlink_telegram(setup_db, get_test_db):
    """Отвязка Telegram."""
    async with get_test_db() as db:
        service = TelegramService(db)
        user_id = uuid.uuid4()

        # Привязать
        token_obj = await service.generate_deep_link_token(user_id)
        await service.link_telegram(
            token=token_obj.token,
            telegram_id=444,
            telegram_username="user3",
            chat_id=444,
        )

        # Отвязать
        result = await service.unlink_telegram(user_id)
        assert result is True

        link = await service.get_link_by_user_id(user_id)
        assert link is None


@pytest.mark.asyncio
async def test_get_link_by_telegram_id(setup_db, get_test_db):
    """Получение привязки по telegram_id."""
    async with get_test_db() as db:
        service = TelegramService(db)
        user_id = uuid.uuid4()

        token_obj = await service.generate_deep_link_token(user_id)
        await service.link_telegram(
            token=token_obj.token,
            telegram_id=555,
            telegram_username="user4",
            chat_id=555,
        )

        link = await service.get_link_by_telegram_id(555)
        assert link is not None
        assert link.user_id == user_id
```

- [ ] **Step 2: Запустить тесты, убедиться что падают**

Run: `cd backend && pytest tests/test_telegram_service.py -v`
Expected: FAIL

- [ ] **Step 3: Реализовать TelegramService**

Создать `backend/app/modules/telegram/service.py`:

```python
"""Сервис Telegram: привязка, отвязка, токены, отправка."""

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.telegram.models import TelegramDeepLinkToken, TelegramLink

logger = logging.getLogger(__name__)


class TelegramService:
    """Сервис для управления Telegram-интеграцией."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def generate_deep_link_token(
        self, user_id: uuid.UUID, ttl_minutes: int = 15
    ) -> TelegramDeepLinkToken:
        """Создать одноразовый токен для deep link привязки."""
        # Удалить старые неиспользованные токены этого юзера
        await self.db.execute(
            delete(TelegramDeepLinkToken).where(
                TelegramDeepLinkToken.user_id == user_id,
                TelegramDeepLinkToken.used == False,
            )
        )

        token = TelegramDeepLinkToken(
            user_id=user_id,
            token=secrets.token_hex(16),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
        )
        self.db.add(token)
        await self.db.flush()
        await self.db.commit()
        return token

    async def link_telegram(
        self,
        token: str,
        telegram_id: int,
        telegram_username: str | None,
        chat_id: int,
    ) -> TelegramLink | None:
        """Привязать Telegram аккаунт через deep link токен.

        Returns:
            TelegramLink если привязка успешна, None если токен невалидный.
        """
        # Найти валидный токен
        result = await self.db.execute(
            select(TelegramDeepLinkToken).where(
                TelegramDeepLinkToken.token == token,
                TelegramDeepLinkToken.used == False,
                TelegramDeepLinkToken.expires_at > datetime.now(timezone.utc),
            )
        )
        token_obj = result.scalar_one_or_none()
        if token_obj is None:
            return None

        # Пометить токен использованным
        token_obj.used = True

        # Удалить старую привязку если была
        await self.db.execute(
            delete(TelegramLink).where(
                TelegramLink.user_id == token_obj.user_id
            )
        )

        # Создать привязку
        link = TelegramLink(
            user_id=token_obj.user_id,
            telegram_id=telegram_id,
            telegram_username=telegram_username,
            chat_id=chat_id,
            is_active=True,
        )
        self.db.add(link)
        await self.db.flush()
        await self.db.commit()
        return link

    async def unlink_telegram(self, user_id: uuid.UUID) -> bool:
        """Отвязать Telegram аккаунт."""
        result = await self.db.execute(
            delete(TelegramLink).where(TelegramLink.user_id == user_id)
        )
        await self.db.commit()
        return (result.rowcount or 0) > 0

    async def get_link_by_user_id(
        self, user_id: uuid.UUID
    ) -> TelegramLink | None:
        """Получить привязку по user_id."""
        result = await self.db.execute(
            select(TelegramLink).where(TelegramLink.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_link_by_telegram_id(
        self, telegram_id: int
    ) -> TelegramLink | None:
        """Получить привязку по telegram_id."""
        result = await self.db.execute(
            select(TelegramLink).where(TelegramLink.telegram_id == telegram_id)
        )
        return result.scalar_one_or_none()
```

- [ ] **Step 4: Запустить тесты**

Run: `cd backend && pytest tests/test_telegram_service.py -v`
Expected: PASS (6 тестов)

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/telegram/service.py backend/tests/test_telegram_service.py
git commit -m "feat(telegram): TelegramService - deep link, link, unlink"
```

---

## Task 6: Bot instance, Dispatcher, Middleware

**Files:**
- Create: `backend/app/modules/telegram/bot.py`
- Create: `backend/app/modules/telegram/middleware.py`
- Create: `backend/app/modules/telegram/keyboards.py`
- Create: `backend/app/modules/telegram/formatters.py`

- [ ] **Step 1: Создать bot.py**

Создать `backend/app/modules/telegram/bot.py`:

```python
"""Telegram Bot instance, Dispatcher, lifecycle."""

import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from app.config import settings

logger = logging.getLogger(__name__)

# Глобальный Bot instance (для отправки из любого контекста)
bot: Bot | None = None
dp: Dispatcher | None = None


def get_bot() -> Bot:
    """Получить Bot instance. Raises если не инициализирован."""
    if bot is None:
        raise RuntimeError("Telegram bot не инициализирован")
    return bot


async def setup_telegram_bot() -> None:
    """Инициализация бота при старте FastAPI."""
    global bot, dp

    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан, бот отключен")
        return

    bot = Bot(
        token=settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    dp = Dispatcher()

    # Подключить middleware
    from app.modules.telegram.middleware import DbSessionMiddleware
    from app.database import async_session
    dp.update.middleware(DbSessionMiddleware(session_pool=async_session))

    # Подключить handlers
    from app.modules.telegram.handlers import register_handlers
    register_handlers(dp)

    # Установить webhook
    webhook_url = f"https://algo.dev-james.bond/api/telegram/webhook"
    if settings.app_env == "development":
        logger.info("Dev mode: webhook не устанавливается")
        return

    await bot.set_webhook(
        url=webhook_url,
        secret_token=settings.telegram_webhook_secret,
        allowed_updates=["message", "callback_query", "web_app_data"],
    )
    logger.info("Telegram webhook установлен: %s", webhook_url)


async def shutdown_telegram_bot() -> None:
    """Завершение бота при остановке FastAPI."""
    global bot, dp
    if bot is None:
        return

    try:
        await bot.delete_webhook(drop_pending_updates=True)
    except Exception:
        logger.exception("Ошибка удаления webhook")

    await bot.session.close()
    bot = None
    dp = None
    logger.info("Telegram бот остановлен")
```

- [ ] **Step 2: Создать middleware.py**

Создать `backend/app/modules/telegram/middleware.py`:

```python
"""Middleware для Telegram бота: DB session, Auth, Admin."""

import logging
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery, TelegramObject
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.telegram.service import TelegramService

logger = logging.getLogger(__name__)


class DbSessionMiddleware(BaseMiddleware):
    """Инжектит AsyncSession в каждый handler."""

    def __init__(self, session_pool: async_sessionmaker[AsyncSession]) -> None:
        super().__init__()
        self.session_pool = session_pool

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        async with self.session_pool() as session:
            data["session"] = session
            return await handler(event, data)


class AuthMiddleware(BaseMiddleware):
    """Проверяет привязку TelegramLink."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = None
        if isinstance(event, Message) and event.from_user:
            user = event.from_user
        elif isinstance(event, CallbackQuery) and event.from_user:
            user = event.from_user

        if user is None:
            return

        session: AsyncSession = data["session"]
        service = TelegramService(session)
        link = await service.get_link_by_telegram_id(user.id)

        if link is None or not link.is_active:
            if isinstance(event, Message):
                await event.answer(
                    "Аккаунт не привязан. Привяжите в ЛК: Настройки -> Telegram"
                )
            elif isinstance(event, CallbackQuery):
                await event.answer("Аккаунт не привязан", show_alert=True)
            return

        data["user_link"] = link
        data["user_id"] = link.user_id
        return await handler(event, data)


class AdminMiddleware(BaseMiddleware):
    """Пропускает только пользователей с role=ADMIN."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        from app.modules.auth.models import UserRole
        from sqlalchemy import select
        from app.modules.auth.models import User

        session: AsyncSession = data["session"]
        user_id = data.get("user_id")
        if user_id is None:
            return

        result = await session.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if user is None or user.role != UserRole.ADMIN:
            if isinstance(event, Message):
                await event.answer("Только для администраторов")
            elif isinstance(event, CallbackQuery):
                await event.answer("Только для администраторов", show_alert=True)
            return

        data["user"] = user
        return await handler(event, data)
```

- [ ] **Step 3: Создать keyboards.py**

Создать `backend/app/modules/telegram/keyboards.py`:

```python
"""Inline-клавиатуры для Telegram бота."""

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.config import settings


def webapp_button(text: str = "Открыть платформу", path: str = "") -> InlineKeyboardMarkup:
    """Кнопка для открытия WebApp."""
    url = f"{settings.telegram_webapp_url}{path}" if path else settings.telegram_webapp_url
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))]
    ])


def bot_control_buttons(bot_id: str, is_running: bool) -> InlineKeyboardMarkup:
    """Кнопки управления ботом (старт/стоп)."""
    if is_running:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Остановить", callback_data=f"bot_stop:{bot_id}")],
            [InlineKeyboardButton(text="Подробнее", web_app=WebAppInfo(
                url=f"{settings.telegram_webapp_url}/bots/{bot_id}"
            ))],
        ])
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Запустить", callback_data=f"bot_start:{bot_id}")],
    ])


def position_buttons(position_id: str) -> InlineKeyboardMarkup:
    """Кнопка закрытия позиции."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="Закрыть позицию",
            callback_data=f"close_pos:{position_id}",
        )],
    ])


def confirm_close_position(position_id: str) -> InlineKeyboardMarkup:
    """Подтверждение закрытия позиции."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Да, закрыть", callback_data=f"confirm_close:{position_id}"),
            InlineKeyboardButton(text="Отмена", callback_data="cancel"),
        ],
    ])


def admin_panel() -> InlineKeyboardMarkup:
    """Кнопки админ-панели."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Health Check", callback_data="admin_health")],
        [InlineKeyboardButton(text="Логи API", callback_data="admin_logs")],
        [InlineKeyboardButton(text="Пользователи", callback_data="admin_users")],
        [InlineKeyboardButton(text="Открыть админку", web_app=WebAppInfo(
            url=f"{settings.telegram_webapp_url}/../admin"
        ))],
    ])
```

- [ ] **Step 4: Создать formatters.py**

Создать `backend/app/modules/telegram/formatters.py`:

```python
"""Форматирование Telegram-сообщений (HTML)."""

from decimal import Decimal


def format_position_opened(
    symbol: str,
    side: str,
    entry_price: Decimal,
    quantity: Decimal,
    stop_loss: Decimal | None,
    take_profits: list[Decimal] | None,
    bot_name: str,
) -> str:
    """Форматирование уведомления об открытии позиции."""
    lines = [
        "📈 <b>Позиция открыта</b>",
        "━━━━━━━━━━━━━━━━━",
        f"{side} {symbol} @ {entry_price:,.2f}",
        f"Размер: {quantity}",
    ]
    if stop_loss:
        sl_pct = ((stop_loss - entry_price) / entry_price * 100)
        lines.append(f"SL: {stop_loss:,.2f} ({sl_pct:+.2f}%)")
    if take_profits:
        for i, tp in enumerate(take_profits, 1):
            tp_pct = ((tp - entry_price) / entry_price * 100)
            lines.append(f"TP{i}: {tp:,.2f} ({tp_pct:+.2f}%)")
    lines.append(f"Бот: {bot_name}")
    return "\n".join(lines)


def format_position_closed(
    symbol: str,
    side: str,
    pnl: Decimal,
    pnl_pct: Decimal,
    reason: str,
) -> str:
    """Форматирование уведомления о закрытии позиции."""
    emoji = "💚" if pnl >= 0 else "🔴"
    return "\n".join([
        f"{emoji} <b>Позиция закрыта</b>",
        "━━━━━━━━━━━━━━━━━",
        f"{side} {symbol}",
        f"P&L: {pnl:+,.2f} USDT ({pnl_pct:+.2f}%)",
        f"Причина: {reason}",
    ])


def format_daily_report(
    total_pnl: Decimal,
    trades_count: int,
    wins: int,
    losses: int,
    best_trade: str,
    best_pnl: Decimal,
    worst_trade: str,
    worst_pnl: Decimal,
    balance: Decimal,
) -> str:
    """Форматирование дневного отчета P&L."""
    win_rate = (wins / trades_count * 100) if trades_count > 0 else 0
    emoji = "💰" if total_pnl >= 0 else "📉"
    return "\n".join([
        f"{emoji} <b>Дневной отчет</b>",
        "━━━━━━━━━━━━━━━━━",
        f"P&L: {total_pnl:+,.2f} USDT",
        f"Сделок: {trades_count} (Win: {wins} | Loss: {losses})",
        f"Win Rate: {win_rate:.0f}%",
        f"Лучшая: {best_pnl:+,.2f} USDT ({best_trade})",
        f"Худшая: {worst_pnl:+,.2f} USDT ({worst_trade})",
        f"Баланс: {balance:,.2f} USDT",
    ])


def format_bot_status(
    name: str,
    symbol: str,
    timeframe: str,
    status: str,
    pnl: Decimal,
    trades: int,
    win_rate: Decimal,
) -> str:
    """Форматирование статуса бота."""
    status_emoji = {"running": "🟢", "stopped": "⬜", "error": "🔴"}.get(status, "⚪")
    return "\n".join([
        f"{status_emoji} <b>{name}</b>",
        f"{symbol} {timeframe} | {status.upper()}",
        f"P&L: {pnl:+,.2f} USDT | Сделок: {trades} | WR: {win_rate:.0f}%",
    ])


def format_autofix_report(
    error: str,
    file_path: str,
    line: int,
    root_cause: str,
    solution: str,
    tests_passed: int,
    tests_total: int,
    deploy_status: str,
    health_status: str,
    commit_message: str,
) -> str:
    """Форматирование отчета об авто-исправлении."""
    return "\n".join([
        "🔴 <b>Авто-исправление</b>",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "⚠️ <b>Ошибка</b>",
        f"{error} в {file_path}:{line}",
        "",
        "🔍 <b>Причина</b>",
        root_cause,
        "",
        "🛠 <b>Решение</b>",
        solution,
        "",
        "✅ <b>Проверка</b>",
        f"Тесты: {tests_passed}/{tests_total} пройдены",
        f"Деплой: {deploy_status}",
        f"Здоровье: {health_status}",
        "",
        f"📎 Коммит: {commit_message}",
    ])


def format_margin_warning(
    margin_pct: Decimal,
    balance: Decimal,
    used_margin: Decimal,
) -> str:
    """Форматирование предупреждения о марже."""
    return "\n".join([
        "⚠️ <b>Предупреждение: высокая маржа</b>",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        f"Маржа: {margin_pct:.1f}%",
        f"Баланс: {balance:,.2f} USDT",
        f"Использовано: {used_margin:,.2f} USDT",
        "",
        "Рассмотрите уменьшение позиций.",
    ])
```

- [ ] **Step 5: Проверить импорты**

Run: `cd backend && python -c "from app.modules.telegram.bot import setup_telegram_bot; print('OK')"`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/telegram/bot.py backend/app/modules/telegram/middleware.py backend/app/modules/telegram/keyboards.py backend/app/modules/telegram/formatters.py
git commit -m "feat(telegram): bot instance, middleware, keyboards, formatters"
```

---

## Task 7: Bot Handlers (/start, /help, /status, /admin)

**Files:**
- Create: `backend/app/modules/telegram/handlers/__init__.py`
- Create: `backend/app/modules/telegram/handlers/start.py`
- Create: `backend/app/modules/telegram/handlers/help.py`
- Create: `backend/app/modules/telegram/handlers/status.py`
- Create: `backend/app/modules/telegram/handlers/admin.py`
- Create: `backend/app/modules/telegram/handlers/callbacks.py`
- Test: `backend/tests/test_telegram_handlers.py`

Этот таск крупный - реализовать все handlers и их тесты. Агент должен:

- [ ] **Step 1: Создать handlers/__init__.py с регистрацией роутеров**

```python
"""Регистрация Telegram-handler роутеров."""

from aiogram import Dispatcher, Router

from app.modules.telegram.middleware import AdminMiddleware, AuthMiddleware


def register_handlers(dp: Dispatcher) -> None:
    """Зарегистрировать все handler-роутеры."""
    from app.modules.telegram.handlers.start import router as start_router
    from app.modules.telegram.handlers.help import router as help_router
    from app.modules.telegram.handlers.status import router as status_router
    from app.modules.telegram.handlers.admin import router as admin_router
    from app.modules.telegram.handlers.callbacks import router as callbacks_router

    # user_router с AuthMiddleware
    user_router = Router(name="user")
    user_router.message.middleware(AuthMiddleware())
    user_router.callback_query.middleware(AuthMiddleware())
    user_router.include_routers(status_router, callbacks_router)

    # admin_router с Auth + Admin middleware
    admin_secured = Router(name="admin_secured")
    admin_secured.message.middleware(AuthMiddleware())
    admin_secured.message.middleware(AdminMiddleware())
    admin_secured.callback_query.middleware(AuthMiddleware())
    admin_secured.callback_query.middleware(AdminMiddleware())
    admin_secured.include_router(admin_router)

    # start_router и help_router без AuthMiddleware
    dp.include_routers(start_router, help_router, user_router, admin_secured)
```

- [ ] **Step 2: Реализовать start.py** - /start с deep link привязкой, приветствие без токена
- [ ] **Step 3: Реализовать help.py** - /help список команд, /app и /settings кнопки WebApp
- [ ] **Step 4: Реализовать status.py** - /status, /pnl, /balance, /positions с inline-кнопками
- [ ] **Step 5: Реализовать admin.py** - /admin, /health, /logs, /users
- [ ] **Step 6: Реализовать callbacks.py** - bot_start, bot_stop, close_pos, confirm_close, admin_*
- [ ] **Step 7: Написать тесты для handlers** (мок Bot, мок DB)
- [ ] **Step 8: Запустить все тесты**

Run: `cd backend && pytest tests/ -v --timeout=60`
Expected: все тесты проходят

- [ ] **Step 9: Commit**

```bash
git add backend/app/modules/telegram/handlers/ backend/tests/test_telegram_handlers.py
git commit -m "feat(telegram): bot handlers - start, help, status, admin, callbacks"
```

---

## Task 8: FastAPI Router (webhook, link, webapp auth)

**Files:**
- Create: `backend/app/modules/telegram/router.py`
- Modify: `backend/app/main.py:26,49,91`
- Test: `backend/tests/test_telegram_router.py`

- [ ] **Step 1: Написать тесты для router**

Создать `backend/tests/test_telegram_router.py` с тестами для:
- POST /api/telegram/link (генерация deep link)
- GET /api/telegram/link (статус привязки)
- DELETE /api/telegram/link (отвязка)
- POST /api/telegram/webapp/auth (валидация initData)
- POST /api/telegram/webhook (с моком Bot)
- GET /api/telegram/settings
- PATCH /api/telegram/settings

- [ ] **Step 2: Запустить тесты, убедиться что падают**

Run: `cd backend && pytest tests/test_telegram_router.py -v`
Expected: FAIL

- [ ] **Step 3: Реализовать router.py**

Создать `backend/app/modules/telegram/router.py` с endpoint'ами по спецификации (секция 3.3).

- [ ] **Step 4: Подключить router в main.py**

В `backend/app/main.py`:
- Добавить import: `from app.modules.telegram.router import router as telegram_router`
- В lifespan (после строки 48 `yield`): добавить `await shutdown_telegram_bot()` перед ws_bridge stop
- Перед `yield` (строка 49): добавить `await setup_telegram_bot()`
- После строки 91: `app.include_router(telegram_router)`

- [ ] **Step 5: Запустить тесты**

Run: `cd backend && pytest tests/test_telegram_router.py -v`
Expected: PASS

- [ ] **Step 6: Запустить ВСЕ тесты**

Run: `cd backend && pytest tests/ -v --timeout=60`
Expected: все тесты проходят (148 существующих + новые)

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/telegram/router.py backend/app/main.py backend/tests/test_telegram_router.py
git commit -m "feat(telegram): FastAPI router, webhook, deep link, webapp auth"
```

---

## Task 9: TelegramNotifier - интеграция с NotificationService

**Files:**
- Create: `backend/app/modules/telegram/notifications.py`
- Modify: `backend/app/modules/notifications/service.py:61-62`
- Modify: `backend/app/modules/notifications/enums.py`
- Test: `backend/tests/test_telegram_notifications.py`

- [ ] **Step 1: Написать тесты**

Тесты для:
- Уведомление с telegram_enabled=true -> bot.send_message вызван
- Уведомление с telegram_enabled=false -> bot.send_message НЕ вызван
- Уведомление positions_telegram=false -> не отправлено
- system категория + role=USER -> не отправлено
- CRITICAL priority -> отправлено всегда

- [ ] **Step 2: Добавить finance и security категории в enums.py**

В `backend/app/modules/notifications/enums.py` добавить:
- Новые типы: `DAILY_PNL_REPORT`, `BALANCE_CHANGED`, `MARGIN_WARNING`, `NEW_LOGIN`, `API_KEY_CHANGED`
- Новые категории в NOTIFICATION_CATEGORIES: `"finance"`, `"security"`

- [ ] **Step 3: Реализовать TelegramNotifier**

Создать `backend/app/modules/telegram/notifications.py` - класс который:
- Получает notification
- Проверяет TelegramLink, preferences
- Форматирует через formatters.py
- Отправляет через bot.send_message()

- [ ] **Step 4: Интегрировать в NotificationService.create()**

В `backend/app/modules/notifications/service.py`, после строки 62 (`await self._publish_to_redis(notification)`), добавить:

```python
        # Отправить в Telegram
        await self._send_to_telegram(notification)
```

И метод:
```python
    async def _send_to_telegram(self, notification: Notification) -> None:
        """Отправить уведомление в Telegram если включено."""
        try:
            from app.modules.telegram.notifications import TelegramNotifier
            notifier = TelegramNotifier(self.db)
            await notifier.on_notification(notification)
        except Exception:
            logger.exception("Ошибка отправки в Telegram")
```

- [ ] **Step 5: Запустить тесты**

Run: `cd backend && pytest tests/test_telegram_notifications.py -v`
Expected: PASS

- [ ] **Step 6: Запустить ВСЕ тесты**

Run: `cd backend && pytest tests/ -v --timeout=60`
Expected: все проходят

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/telegram/notifications.py backend/app/modules/notifications/service.py backend/app/modules/notifications/enums.py backend/tests/test_telegram_notifications.py
git commit -m "feat(telegram): TelegramNotifier integration with NotificationService"
```

---

## Task 10: Celery Tasks (daily P&L, margin warnings)

**Files:**
- Create: `backend/app/modules/telegram/celery_tasks.py`
- Modify: `backend/app/celery_app.py:41-44`

- [ ] **Step 1: Создать celery_tasks.py**

Задачи:
- `telegram.send_daily_pnl_report` - собирает P&L всех ботов за день, отправляет каждому юзеру с telegram_enabled=true
- `telegram.check_margin_warnings` - проверяет маржу, отправляет warning при >80%

- [ ] **Step 2: Добавить в beat_schedule**

В `backend/app/celery_app.py`, в `beat_schedule` добавить:

```python
    "send-daily-pnl-report": {
        "task": "telegram.send_daily_pnl_report",
        "schedule": crontab(hour=23, minute=55),
    },
    "check-margin-warnings": {
        "task": "telegram.check_margin_warnings",
        "schedule": 300.0,
    },
```

И добавить `"app.modules.telegram"` в `autodiscover_tasks`.

- [ ] **Step 3: Проверить что tasks регистрируются**

Run: `cd backend && python -c "from app.celery_app import celery; print([t for t in celery.tasks if 'telegram' in t])"`
Expected: список с telegram tasks

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/telegram/celery_tasks.py backend/app/celery_app.py
git commit -m "feat(telegram): celery tasks - daily P&L report, margin warnings"
```

---

## Task 11: Frontend - Settings page (Telegram секция + TG колонка)

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Добавить TypeScript типы**

В `frontend/src/types/api.ts` добавить:

```typescript
export interface TelegramLinkStatus {
  is_linked: boolean;
  telegram_username: string | null;
  linked_at: string | null;
  telegram_enabled: boolean;
}

export interface TelegramLinkCreate {
  deep_link_url: string;
  token: string;
  expires_in_seconds: number;
}

export interface TelegramSettings {
  telegram_enabled: boolean;
  positions_telegram: boolean;
  bots_telegram: boolean;
  orders_telegram: boolean;
  backtest_telegram: boolean;
  system_telegram: boolean;
  finance_telegram: boolean;
  security_telegram: boolean;
}
```

- [ ] **Step 2: Добавить секцию "Telegram" в Settings.tsx**

Между "Биржевые аккаунты" и "Уведомления":
- 3 состояния: не привязан, привязан, привязан+настройки
- Deep link привязка с polling
- Кнопка отвязки

- [ ] **Step 3: Расширить секцию "Уведомления"**

Добавить колонку TG к каждой категории (Web + TG двойные тогглы).
Добавить категории "Финансы" и "Безопасность".
TG колонка disabled если не привязан или telegram_enabled=false.

- [ ] **Step 4: Проверить сборку**

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Settings.tsx frontend/src/types/api.ts
git commit -m "feat(telegram): settings page - telegram link, notification channels"
```

---

## Task 12: Frontend - Telegram WebApp (Mini App)

**Files:**
- Create: все файлы из frontend/src/pages/tg/, components/tg/, hooks/, stores/, lib/
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/package.json`

- [ ] **Step 1: Установить зависимости**

Run: `cd frontend && npm install @tma.js/sdk-react @tma.js/sdk`

- [ ] **Step 2: Создать lib/telegram.ts** - SDK helpers, isTelegramWebApp() detection
- [ ] **Step 3: Создать stores/telegram.ts** - Zustand store для TG state
- [ ] **Step 4: Создать hooks/useTelegramAuth.ts** - initData -> JWT авторизация
- [ ] **Step 5: Создать TelegramLayout.tsx** - bottom nav, compact header, no sidebar
- [ ] **Step 6: Создать components/tg/** - TgBottomNav, TgHeader, TgCard, TgPnlWidget
- [ ] **Step 7: Создать pages/tg/** - TgDashboard, TgBots, TgBotDetail, TgStrategies, TgChart, TgBacktest, TgSettings
- [ ] **Step 8: Добавить /tg/* роуты в App.tsx**

В `frontend/src/App.tsx` добавить TelegramLayout и /tg/* роуты.

- [ ] **Step 9: Проверить сборку**

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/layouts/ frontend/src/pages/tg/ frontend/src/components/tg/ frontend/src/hooks/useTelegramAuth.ts frontend/src/stores/telegram.ts frontend/src/lib/telegram.ts frontend/src/App.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(telegram): WebApp Mini App - layout, pages, auth, routing"
```

---

## Task 13: Hooks Pipeline (auto-lint, safety-guard, circuit-breaker)

**Files:**
- Create: `.claude/hooks/auto-lint.sh`
- Create: `.claude/hooks/safety-guard.sh`
- Create: `.claude/hooks/circuit-breaker.sh`
- Modify: `.claude/settings.json`

- [ ] **Step 1: Создать auto-lint.sh**

Скрипт из спецификации секция 7.2 - ruff для Python, prettier для TypeScript.

- [ ] **Step 2: Создать safety-guard.sh**

Блок rm -rf, DROP TABLE, git push --force, cat .env и других опасных команд.

- [ ] **Step 3: Создать circuit-breaker.sh**

Подсчет consecutive failures, алерт в Telegram при 3+, сброс при успехе.

- [ ] **Step 4: Обновить .claude/settings.json**

Добавить hooks конфигурацию:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/auto-lint.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/safety-guard.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Проверь что все тесты проходят: cd backend && pytest tests/ -v. Если тесты падают - верни {\"ok\": false, \"reason\": \"какие тесты упали\"}. Проверь stop_hook_active - если true, разреши остановку.",
            "timeout": 180
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'AlgoBond: pytest tests/ -v перед коммитом. Deploy: ssh jeremy-vps. Порт 8100. Telegram bot в .env.'"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 5: Проверить hooks через /hooks**

Запустить `/hooks` в Claude Code, убедиться что все 4 хука видны.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/ .claude/settings.json
git commit -m "feat(hooks): auto-lint, safety-guard, circuit-breaker, stop verification"
```

---

## Task 14: Агент telegram-dev + Миграция БД

**Files:**
- Create: `.claude/agents/telegram-dev.md`
- Alembic migration

- [ ] **Step 1: Создать агент telegram-dev**

Создать `.claude/agents/telegram-dev.md`:

```markdown
---
name: telegram-dev
model: sonnet
description: Telegram бот и WebApp разработчик. aiogram 3.x, webhook, Mini App, уведомления.
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - mcp__plugin_context7_context7__resolve-library-id
  - mcp__plugin_context7_context7__query-docs
---

Ты - специализированный разработчик Telegram-интеграции для платформы AlgoBond.

## Стек
- aiogram 3.27+ (ОБЯЗАТЕЛЬНО проверяй актуальную документацию через context7)
- FastAPI webhook mode
- @tma.js/sdk-react для WebApp
- SQLAlchemy 2.0 async
- Pydantic v2

## Правила
- Type hints на всех функциях
- Docstrings на русском
- HTML parse_mode для Telegram сообщений
- Мокать Bot.send_message в тестах
- Проверять актуальные API aiogram через context7 перед реализацией
```

- [ ] **Step 2: Создать Alembic миграцию (на VPS)**

Run: `ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec api alembic revision --autogenerate -m 'add telegram tables and notification preferences'"`

- [ ] **Step 3: Применить миграцию (на VPS)**

Run: `ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec api alembic upgrade head"`

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/telegram-dev.md
git commit -m "feat(telegram): add telegram-dev agent, run DB migration"
```

---

## Task 15: Деплой и верификация

**Files:** нет новых файлов

- [ ] **Step 1: Запустить все тесты локально**

Run: `cd backend && pytest tests/ -v --timeout=60`
Expected: ~176 тестов проходят

- [ ] **Step 2: Проверить frontend build**

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 3: Push на GitHub**

Run: `git push origin main`

- [ ] **Step 4: Деплой на VPS**

Run: `ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api frontend"`

- [ ] **Step 5: Health check**

Run: `ssh jeremy-vps "curl -sf http://localhost:8100/health"`
Expected: `{"status":"ok","app":"AlgoBond","version":"0.9.0"}`

- [ ] **Step 6: Проверить webhook бота**

Run: `curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"`
Expected: webhook URL установлен, no errors

- [ ] **Step 7: Проверить /start в Telegram**

Отправить `/start` боту @algo_bond_bot. Ожидается приветственное сообщение.

- [ ] **Step 8: Привязать админский аккаунт**

1. В ЛК -> Настройки -> Привязать Telegram
2. Кликнуть deep link
3. Проверить что привязка работает
4. Обновить TELEGRAM_ADMIN_CHAT_ID в .env на VPS

- [ ] **Step 9: Тестовое уведомление**

Отправить тестовое уведомление через POST /api/telegram/admin/notify.
Проверить что пришло в Telegram.

- [ ] **Step 10: Финальный commit**

```bash
git commit --allow-empty -m "feat(telegram): v1.0 - bot, webapp, notifications, hooks pipeline deployed"
```
