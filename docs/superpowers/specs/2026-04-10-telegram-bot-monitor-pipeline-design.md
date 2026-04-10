# AlgoBond Telegram Bot + Monitor Auto-Fix Pipeline - Design Spec

**Дата:** 2026-04-10
**Автор:** Denis + Claude
**Статус:** Утверждено

---

## 1. Обзор

Интеграция Telegram-бота (@algo_bond_bot) в платформу AlgoBond:
- Telegram-бот (aiogram 3.27+) для уведомлений и управления
- Telegram WebApp (Mini App) - полный ЛК через Telegram
- Monitor + auto-fix hooks pipeline с отчетами в Telegram
- Настройка уведомлений через ЛК (per-category, per-channel)

## 2. Решения

| Вопрос | Решение |
|--------|---------|
| Уведомления | 5 категорий (торговые, системные, финансовые, бэктест, безопасность). Системные - только админ. Все настраиваются в ЛК. |
| WebApp функционал | Полный ЛК (мобильная версия платформы) |
| Архитектура | В контейнере API (webhook в FastAPI), авторестарт Docker |
| WebApp фронтенд | Тот же frontend + отдельные /tg/* роуты, TelegramLayout |
| Привязка аккаунта | Deep link (t.me/algo_bond_bot?start=TOKEN) - один клик |
| Monitor pipeline | Все уведомления в Telegram админу |
| Организация кода | Единый модуль backend/app/modules/telegram/ |
| Язык уведомлений | Русский |

## 3. Backend - модуль telegram

### 3.1 Структура файлов

```
backend/app/modules/telegram/
├── __init__.py
├── models.py          # TelegramLink, TelegramDeepLinkToken
├── schemas.py         # Pydantic v2 схемы
├── service.py         # TelegramService - привязка, отправка
├── router.py          # FastAPI: webhook, deep link, webapp auth
├── bot.py             # Bot instance, Dispatcher, startup/shutdown
├── webapp_auth.py     # initData HMAC-SHA256 валидация
├── notifications.py   # Интеграция с NotificationService
├── keyboards.py       # InlineKeyboard builders
└── handlers/
    ├── __init__.py
    ├── start.py       # /start, deep link привязка
    ├── status.py      # /status - статус ботов, P&L
    ├── help.py        # /help - список команд
    ├── admin.py       # /admin, /health, /logs, /users (role=ADMIN)
    └── callbacks.py   # Inline-кнопки (bot_start, bot_stop, close_position)
```

### 3.2 Модели

#### TelegramLink

```python
class TelegramLink(Base):
    __tablename__ = "telegram_links"
    
    id: Mapped[uuid.UUID]                    # PK
    user_id: Mapped[uuid.UUID]               # FK -> users.id, unique
    telegram_id: Mapped[int]                 # Telegram user ID (bigint), unique, indexed
    telegram_username: Mapped[str | None]    # @username
    chat_id: Mapped[int]                     # Chat ID для отправки сообщений
    is_active: Mapped[bool]                  # default True
    linked_at: Mapped[datetime]              # DateTime(timezone=True)
```

#### TelegramDeepLinkToken

```python
class TelegramDeepLinkToken(Base):
    __tablename__ = "telegram_deep_link_tokens"
    
    id: Mapped[uuid.UUID]            # PK
    user_id: Mapped[uuid.UUID]       # FK -> users.id
    token: Mapped[str]               # 32-char hex, unique, indexed
    used: Mapped[bool]               # default False
    expires_at: Mapped[datetime]     # +15 минут от создания
    created_at: Mapped[datetime]
```

#### Расширение NotificationPreference (существующая модель)

Новые колонки:

```python
# Глобальный тоггл Telegram-канала
telegram_enabled: Mapped[bool]       # default False

# Per-category Telegram тогглы
positions_telegram: Mapped[bool]     # default True
bots_telegram: Mapped[bool]          # default True
orders_telegram: Mapped[bool]        # default False
backtest_telegram: Mapped[bool]      # default True
system_telegram: Mapped[bool]        # default True
finance_telegram: Mapped[bool]       # default True
security_telegram: Mapped[bool]      # default True

# Новые web-канал категории (их пока нет)
finance_enabled: Mapped[bool]        # default True
security_enabled: Mapped[bool]       # default True
```

### 3.3 API Endpoints

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | /api/telegram/webhook | Telegram secret | Webhook для Telegram Bot API |
| POST | /api/telegram/link | JWT | Генерация deep link токена, возврат URL |
| GET | /api/telegram/link | JWT | Статус привязки (linked/not linked, username, date) |
| DELETE | /api/telegram/link | JWT | Отвязать Telegram |
| POST | /api/telegram/webapp/auth | initData | Валидация initData, возврат JWT (access + refresh) |
| GET | /api/telegram/settings | JWT | Настройки уведомлений Telegram |
| PATCH | /api/telegram/settings | JWT | Обновить настройки |
| POST | /api/telegram/admin/notify | JWT (admin) | Отправить произвольное уведомление админу |

### 3.4 Жизненный цикл бота

Инициализация в lifespan FastAPI (app/main.py):

```python
async def lifespan(app):
    # Existing startup (sync trading pairs, WS bridge)...
    await setup_telegram_bot()   # set_webhook, register handlers
    yield
    await shutdown_telegram_bot() # delete_webhook, close session
    # Existing shutdown...
```

setup_telegram_bot():
1. Создать Bot instance с token из settings
2. Создать Dispatcher, зарегистрировать Router'ы с middleware
3. set_webhook(url, secret_token, allowed_updates)

shutdown_telegram_bot():
1. delete_webhook(drop_pending_updates=True)
2. bot.session.close()

Bot instance доступен глобально для отправки нотификаций из любого контекста (Celery tasks, NotificationService).

### 3.5 Поток привязки (deep link)

1. Пользователь в ЛК нажимает "Привязать Telegram"
2. POST /api/telegram/link -> генерирует token (32-hex), TTL 15 мин, сохраняет в telegram_deep_link_tokens
3. Фронт показывает ссылку t.me/algo_bond_bot?start={token}
4. Пользователь кликает -> Telegram открывает бота
5. /start handler парсит deep_link_args, извлекает token
6. Бот ищет token в telegram_deep_link_tokens (not used, not expired)
7. Если валидный -> создает TelegramLink (user_id + telegram_id + chat_id), помечает token used=True
8. Бот отправляет "Аккаунт привязан! Настройте уведомления в ЛК"
9. Фронт по polling GET /api/telegram/link каждые 3 сек (макс 2 мин) видит linked -> обновляет UI

### 3.6 WebApp аутентификация

1. Юзер открывает Mini App через бота (кнопка "Открыть платформу")
2. Telegram передает initData (подписанный HMAC-SHA256)
3. Frontend отправляет POST /api/telegram/webapp/auth с raw initData
4. Backend (webapp_auth.py):
   a. Парсит initData, извлекает hash
   b. Строит data-check-string (отсортированные параметры)
   c. Вычисляет HMAC-SHA256(WebAppData + bot_token, data-check-string)
   d. Сравнивает с полученным hash
   e. Извлекает telegram_id из initData.user.id
   f. Ищет TelegramLink по telegram_id -> получает user_id
   g. Генерирует стандартный JWT (access + refresh)
   h. Возвращает токены
5. Если TelegramLink не найден -> 404 с инструкцией привязки

### 3.7 Команды бота

#### Пользовательские (требуют AuthMiddleware)

| Команда | Описание |
|---------|----------|
| /start | Приветствие + deep link привязка |
| /start {token} | Автоматическая привязка аккаунта |
| /help | Список доступных команд |
| /status | Статус всех ботов (running/stopped/error) с inline-кнопками |
| /pnl | Текущий P&L по всем активным позициям |
| /balance | Баланс аккаунта на бирже |
| /positions | Список открытых позиций с кнопками закрытия |
| /app | Кнопка "Открыть платформу" (WebApp) |
| /settings | Кнопка "Настройки" (WebApp на странице настроек) |

#### Админские (требуют AuthMiddleware + AdminMiddleware)

| Команда | Описание |
|---------|----------|
| /admin | Панель администратора (инлайн-кнопки) |
| /health | Статус всех сервисов (API, DB, Redis, Celery, Bybit) |
| /logs | Последние 20 строк логов API |
| /users | Количество пользователей, активных ботов |
| /deploy | Статус последнего деплоя |

#### Callback handlers (inline-кнопки)

- `bot_start:{bot_id}` -> TradingService.start_bot()
- `bot_stop:{bot_id}` -> TradingService.stop_bot()
- `close_position:{position_id}` -> подтверждение -> TradingService.close_position()

### 3.8 Middleware

**AuthMiddleware** - на user_router:
- Проверяет telegram_id в telegram_links
- Если не привязан -> "Аккаунт не привязан. Привяжите в ЛК."
- Инжектит user_link, user_id в data

**AdminMiddleware** - на admin_router:
- Загружает User по user_id
- Проверяет role == ADMIN
- Если нет -> "Только для администраторов"

**DbSessionMiddleware** - на dp.update:
- Инжектит AsyncSession из общего session pool

start_router (/start, /help) работает без AuthMiddleware.

## 4. Система уведомлений в Telegram

### 4.1 Интеграция с NotificationService

TelegramNotifier расширяет существующий NotificationService.create():

```python
class TelegramNotifier:
    async def on_notification(self, notification: Notification):
        # 1. Есть ли TelegramLink у user_id?
        # 2. telegram_enabled == True?
        # 3. Категория включена? (positions_telegram, bots_telegram...)
        # 4. system категория -> user.role == ADMIN?
        # 5. Форматировать сообщение (HTML) с emoji по типу
        # 6. bot.send_message(chat_id, text)
```

### 4.2 Точки отправки

| Событие | Источник | Категория |
|---------|----------|-----------|
| Позиция открыта | bot_worker.py | positions |
| TP/SL сработал | bot_worker.py | positions |
| Позиция закрыта | bot_worker.py | positions |
| Бот запущен/остановлен | trading/service.py | bots |
| Ошибка бота | bot_worker.py | bots |
| Дневной P&L | Celery beat (новая задача, 23:55 UTC) | finance |
| Баланс изменился | bot_worker.py | finance |
| Margin warning | bot_worker.py | finance |
| Бэктест завершен | backtest/service.py | backtest |
| Логин с нового устройства | auth/service.py | security |
| API ключ изменен | auth/service.py | security |
| Auto-fix отчет | Claude hooks pipeline | system (admin only) |
| Health check failed | Claude hooks pipeline | system (admin only) |

### 4.3 Форматирование (русский язык)

Позиция открыта:
```
📈 Позиция открыта
━━━━━━━━━━━━━━━━━
LONG BTCUSDT @ 67,200.00
Размер: 0.015 BTC ($1,008)
SL: 66,500 (-1.04%)
TP1: 68,000 (+1.19%)
TP2: 69,500 (+3.42%)
Бот: KNN Main
```

Дневной отчет:
```
💰 Дневной отчет
━━━━━━━━━━━━━━━━━
P&L: +45.30 USDT
Сделок: 10 (Win: 7 | Loss: 3)
Win Rate: 70%
Лучшая: +18.20 USDT (ETHUSDT)
Худшая: -8.50 USDT (BTCUSDT)
Баланс: 1,234.56 USDT
```

Auto-fix отчет (админ):
```
🔴 Авто-исправление
━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Ошибка
TypeError в bot_worker.py:142
position.entry_price оказался None при расчете P&L

🔍 Причина
При частичном исполнении ордера на Bybit объект позиции
создается до подтверждения цены входа. Калькулятор P&L
обратился к нему в этот короткий промежуток.

🛠 Решение
Добавлена проверка в calculate_pnl() - теперь позиции
без подтвержденной цены пропускаются. Следующий цикл
подхватит их с корректной entry_price.

✅ Проверка
Тесты: 148/148 пройдены
Деплой: УСПЕШНО
Здоровье: OK (API 23мс, БД 5мс)

📎 Коммит: fix: null guard in bot_worker
```

### 4.4 Rate limiting

- Telegram API лимит: 30 сообщений/сек, 1 сообщение/сек в один чат
- Группировка: если за 5 сек пришло 3+ уведомления одному юзеру - объединить в одно
- Критические (BOT_ERROR, BOT_EMERGENCY, margin warning) - отправлять сразу, без группировки
- Очередь отправки через Redis (FIFO)

### 4.5 Celery Beat - новые задачи

```python
"send-daily-pnl-report": {
    "task": "telegram.send_daily_pnl_report",
    "schedule": crontab(hour=23, minute=55),  # 23:55 UTC
},
"check-margin-warnings": {
    "task": "telegram.check_margin_warnings",
    "schedule": 300.0,  # Каждые 5 минут
},
```

## 5. Telegram WebApp (Mini App)

### 5.1 Фронтенд структура

```
frontend/src/
├── App.tsx                    # Добавить /tg/* роуты
├── layouts/
│   └── TelegramLayout.tsx     # Bottom nav, no sidebar, compact
├── pages/tg/
│   ├── TgDashboard.tsx        # Компактный дашборд
│   ├── TgBots.tsx             # Список ботов + старт/стоп
│   ├── TgBotDetail.tsx        # Детали бота, позиции
│   ├── TgStrategies.tsx       # Стратегии (read + configure)
│   ├── TgChart.tsx            # Упрощенный чарт
│   ├── TgBacktest.tsx         # Запуск/результаты
│   └── TgSettings.tsx         # Настройки уведомлений
├── components/tg/
│   ├── TgBottomNav.tsx        # Bottom navigation bar (5 табов)
│   ├── TgHeader.tsx           # Compact header (BackButton)
│   ├── TgCard.tsx             # Touch-friendly card
│   └── TgPnlWidget.tsx       # P&L виджет
├── hooks/
│   └── useTelegramAuth.ts     # initData -> JWT
├── stores/
│   └── telegram.ts            # TG state, WebApp API
└── lib/
    └── telegram.ts            # WebApp SDK helpers
```

### 5.2 Роутинг

```typescript
<Routes>
  {/* Существующие web routes */}
  <Route element={<DashboardLayout />}>
    <Route path="/dashboard" element={<Dashboard />} />
    ...
  </Route>
  
  {/* Telegram Mini App routes */}
  <Route element={<TelegramLayout />}>
    <Route path="/tg" element={<TgDashboard />} />
    <Route path="/tg/bots" element={<TgBots />} />
    <Route path="/tg/bots/:id" element={<TgBotDetail />} />
    <Route path="/tg/chart" element={<TgChart />} />
    <Route path="/tg/backtest" element={<TgBacktest />} />
    <Route path="/tg/settings" element={<TgSettings />} />
  </Route>
</Routes>
```

### 5.3 TelegramLayout vs DashboardLayout

| Аспект | DashboardLayout (веб) | TelegramLayout (Mini App) |
|--------|----------------------|--------------------------|
| Навигация | Sidebar слева | Bottom tab bar (5 табов) |
| Header | Topbar с балансом, нотификации | Telegram BackButton + заголовок |
| Ширина | 1920-1440px | 375-428px (мобильный) |
| Шрифт | Tektur/JetBrains Mono | Тот же, размеры -2px |
| Тема | Dark default | Из Telegram.WebApp.themeParams |
| Скролл | Browser native | Telegram WebApp viewport |

### 5.4 Bottom Navigation

```
┌────┬────┬────┬────┬────┐
│ 📊 │ 🤖 │ 📈 │ 🧪 │ ⚙️ │
│Home│Bots│Chart│Test│ Set │
└────┴────┴────┴────┴────┘
```

### 5.5 Зависимости

```
@tma.js/sdk-react ^3.0.19
@tma.js/sdk ^3.2.0
```

### 5.6 Переиспользование

Stores, API layer (axios + JWT), TypeScript типы, утилиты - общие с веб-версией. Различается только UI (TelegramLayout, TgBottomNav, компактные страницы).

## 6. Frontend - настройки Telegram в ЛК

### 6.1 Расширение Settings.tsx

Новая секция "Telegram" в правой колонке, между "Биржевые аккаунты" и "Уведомления".

### 6.2 Три состояния секции Telegram

**Не привязан:**
- Описание + кнопка "Привязать Telegram"
- Кнопка генерирует deep link, открывает t.me/algo_bond_bot?start={token}
- Polling GET /api/telegram/link каждые 3 сек (макс 2 мин)

**Привязан:**
- @username, дата привязки
- Тоггл "Telegram-уведомления" (глобальный вкл/выкл)
- Кнопка "Отвязать"

### 6.3 Расширение секции "Уведомления"

Добавить колонку "TG" к каждой категории:

```
                          Web   TG
Позиции                   [✓]  [✓]
Боты                      [✓]  [✓]
Ордера                    [✓]  [ ]
Бэктест                   [✓]  [✓]
Система*                  [✓]  [✓]
Финансы                   [ ]  [✓]
Безопасность              [✓]  [✓]

* Только для администраторов
```

Колонка TG неактивна (disabled) если Telegram не привязан или telegram_enabled=false.

## 7. Monitor + Auto-Fix Hooks Pipeline

### 7.1 Hooks в .claude/settings.json

**PostToolUse (Edit|Write):** auto-lint (ruff для .py, prettier для .ts/.tsx)
**PreToolUse (Bash):** safety-guard (блок rm -rf, DROP TABLE, force push, .env access)
**Stop (agent):** проверка pytest, circuit breaker (max 3 failures)
**SessionStart (compact):** re-inject контекст проекта

### 7.2 Hook-скрипты

`.claude/hooks/auto-lint.sh` - ruff check --fix + ruff format для Python, prettier для TypeScript
`.claude/hooks/safety-guard.sh` - блок опасных команд (rm -rf, DROP, force push, cat .env)
`.claude/hooks/circuit-breaker.sh` - подсчет consecutive failures, алерт в Telegram при 3+

### 7.3 Deploy pipeline после auto-fix

Claude при обнаружении ошибки через Monitor:
1. Анализирует traceback
2. Находит и фиксит код (Edit/Write -> PostToolUse auto-lint)
3. Stop hook проверяет pytest (agent)
4. Если тесты зеленые: git commit + git push + ssh deploy + health check
5. Если health OK -> отчет в Telegram (POST /api/telegram/admin/notify)
6. Если health FAIL -> git revert + redeploy + алерт в Telegram

### 7.4 Monitor-команды для сессии

API логи (auto-fix):
```
ssh jeremy-vps 'docker logs -f api 2>&1 | grep -iE "error|exception|traceback|critical"'
```

Торговые логи (read-only, только алерт):
```
ssh jeremy-vps 'docker logs -f bybit-listener 2>&1'
```

### 7.5 Circuit breaker

- Файл-счетчик: /tmp/claude-autofix-failures
- MAX_FAILURES = 3
- При достижении: алерт в Telegram, разрешить остановку Claude
- При успешном фиксе: сброс счетчика

## 8. Конфигурация и Docker

### 8.1 Новые переменные окружения

```bash
TELEGRAM_BOT_TOKEN=8611948414:AAGJJ2wY-gKuY1ILOllY0_j8BDPQUx2QTf8
TELEGRAM_WEBHOOK_SECRET=<random-64-hex>
TELEGRAM_ADMIN_CHAT_ID=<заполнится после привязки админа>
TELEGRAM_WEBAPP_URL=https://algo.dev-james.bond/tg
```

### 8.2 Расширение config.py

```python
telegram_bot_token: str = ""
telegram_webhook_secret: str = ""
telegram_admin_chat_id: int = 0
telegram_webapp_url: str = ""
```

### 8.3 Docker

Бот живет в контейнере API - новых контейнеров нет. Добавить env переменные в docker-compose.yml для api сервиса.

### 8.4 Зависимости

Backend: `aiogram>=3.27.0,<4.0`
Frontend: `@tma.js/sdk-react ^3.0.19`, `@tma.js/sdk ^3.2.0`

### 8.5 Миграция БД

Одна миграция:
- CREATE TABLE telegram_links
- CREATE TABLE telegram_deep_link_tokens
- ALTER TABLE notification_preferences ADD COLUMN telegram_enabled, positions_telegram, bots_telegram, orders_telegram, backtest_telegram, system_telegram, finance_telegram, security_telegram, finance_enabled, security_enabled

## 9. Безопасность

| Угроза | Защита |
|--------|--------|
| Поддельный webhook | X-Telegram-Bot-Api-Secret-Token проверка |
| Поддельный initData | HMAC-SHA256 валидация через bot_token |
| Deep link перехват | 32-hex, TTL 15 мин, одноразовый |
| Чужой telegram_id | Привязка только через deep link (требует JWT авторизации в ЛК) |
| Спам команд | Rate limit: 10 команд/мин на пользователя (Redis) |
| Админские команды | AdminMiddleware проверяет role=ADMIN |
| Bot token утечка | Только в .env, не логируется |
| SQL injection | UUID валидация, SQLAlchemy ORM |

## 10. Тестирование

~25-30 новых тестов:
- test_telegram_models.py - модели TelegramLink, DeepLinkToken
- test_telegram_service.py - привязка, отвязка, отправка
- test_telegram_router.py - API endpoints
- test_telegram_handlers.py - Bot handlers
- test_telegram_notifications.py - интеграция с NotificationService
- test_telegram_webapp_auth.py - HMAC-SHA256 валидация

Bot.send_message мокается - тесты не обращаются к Telegram API.
Итого: ~176 тестов (148 существующих + ~28 новых).

## 11. Новые агенты/скиллы

### Агент telegram-dev

Специализированный агент для реализации Telegram-модуля. Добавить в `.claude/agents/`:

```yaml
name: telegram-dev
model: sonnet
description: Telegram бот и WebApp разработчик. aiogram 3.x, webhook, Mini App.
tools: [Read, Write, Edit, Bash, Glob, Grep]
```

### Скилл tg-notify

Скилл для отправки тестовых уведомлений. Добавить в `.claude/skills/`:

```
/tg-notify <message> - Отправить тестовое уведомление в Telegram админу
```
