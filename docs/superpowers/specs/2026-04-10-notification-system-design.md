# Система уведомлений AlgoBond - Спецификация

## Обзор

Полноценная система in-app уведомлений для AlgoBond. Колокольчик с badge-счетчиком в Topbar, dropdown панель со списком уведомлений, фильтрация по типу, навигация к событию, настройки по категориям. Real-time доставка через выделенный WebSocket канал, гибридное хранение Redis + PostgreSQL.

## Архитектура

Отдельный модуль `app/modules/notifications/` по паттерну проекта (как auth, trading, market). Другие модули вызывают `NotificationService.create()` для публикации уведомлений.

### Поток данных

```
bot_worker / bybit_listener / celery_task / router
  ↓ вызов
NotificationService.create(user_id, type, priority, title, message, data, link)
  ↓ одновременно
  ├── PostgreSQL: INSERT notification
  └── Redis pub/sub: PUBLISH notifications:{user_id}
        ↓
    ws_bridge подписан на notifications:*
        ↓
    WebSocket /ws/notifications → browser
        ↓
    useNotificationStream hook → Zustand store → UI
```

## Backend

### Структура модуля

```
app/modules/notifications/
├── __init__.py
├── models.py          - Notification, NotificationPreference
├── schemas.py         - Pydantic v2 схемы
├── service.py         - NotificationService (CRUD + publish)
├── router.py          - REST API endpoints
├── ws_router.py       - WebSocket /ws/notifications
├── celery_tasks.py    - cleanup старых записей
└── enums.py           - NotificationType, NotificationPriority
```

### Модель данных

**Таблица `notifications`:**

| Column     | Type              | Notes                                    |
|------------|-------------------|------------------------------------------|
| id         | UUID PK           |                                          |
| user_id    | UUID FK -> users  | indexed                                  |
| type       | Enum              | NotificationType                         |
| priority   | Enum              | low, medium, high, critical              |
| title      | String(200)       | "BTC/USDT: +$42.50"                     |
| message    | String(500)       | Подробное описание                       |
| data       | JSONB             | {bot_id, position_id, pnl, symbol, ...}  |
| link       | String(300)       | "/bots/uuid" - для навигации             |
| is_read    | Boolean           | default False                            |
| read_at    | DateTime(tz)      | nullable                                 |
| created_at | DateTime(tz)      | indexed, default=utcnow                  |

SQLAlchemy 2.0 стиль: `Mapped[]`, `mapped_column()`.

### NotificationType (Enum)

**Позиции:** POSITION_OPENED, POSITION_CLOSED, TP_HIT, SL_HIT
**Боты:** BOT_STARTED, BOT_STOPPED, BOT_ERROR, BOT_EMERGENCY
**Ордера:** ORDER_FILLED, ORDER_CANCELLED, ORDER_ERROR
**Бэктесты:** BACKTEST_COMPLETED, BACKTEST_FAILED
**Системные:** CONNECTION_LOST, CONNECTION_RESTORED, SYSTEM_ERROR
**Биллинг:** SUBSCRIPTION_EXPIRING, PAYMENT_SUCCESS, PAYMENT_FAILED

### NotificationPriority (Enum)

- **low** - информационные (бот запущен, ордер исполнен, платеж прошел)
- **medium** - важные (позиция открыта/закрыта, ордер отменен, соединение восстановлено)
- **high** - требуют внимания (SL сработал, ошибка API, подписка истекает, бэктест упал)
- **critical** - аварийные (emergency close, системная ошибка, потеря соединения, платеж не прошел). Приходят всегда, независимо от настроек пользователя.

### API Endpoints

```
GET    /api/notifications              - список (пагинация limit/offset + фильтр ?type=)
GET    /api/notifications/unread/count  - счетчик непрочитанных
PATCH  /api/notifications/{id}/read    - отметить прочитанным
PATCH  /api/notifications/read-all     - прочитать все
DELETE /api/notifications/{id}         - удалить одно
GET    /api/notifications/preferences  - получить настройки
PUT    /api/notifications/preferences  - обновить настройки
WS     /ws/notifications?token=JWT     - real-time поток
```

Все endpoints требуют `Depends(get_current_user)`. WebSocket аутентификация через JWT в query param (как существующий `/ws/trading`).

### NotificationService

```python
class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        user_id: UUID,
        type: NotificationType,
        priority: NotificationPriority,
        title: str,
        message: str,
        data: dict | None = None,
        link: str | None = None,
    ) -> Notification:
        """Создает уведомление в БД и публикует в Redis."""
        # 1. Проверить preferences пользователя (skip если категория выключена, кроме critical)
        # 2. INSERT в PostgreSQL
        # 3. PUBLISH в Redis канал notifications:{user_id}

    async def get_user_notifications(
        self, user_id: UUID, limit: int = 50, offset: int = 0, type_filter: str | None = None
    ) -> list[Notification]: ...

    async def get_unread_count(self, user_id: UUID) -> int: ...
    async def mark_read(self, user_id: UUID, notification_id: UUID) -> None: ...
    async def mark_all_read(self, user_id: UUID) -> None: ...
    async def delete(self, user_id: UUID, notification_id: UUID) -> None: ...
    async def get_preferences(self, user_id: UUID) -> dict: ...
    async def update_preferences(self, user_id: UUID, prefs: dict) -> None: ...
```

### WebSocket Bridge

Новый Redis subscriber в `ws_router.py` по паттерну существующего `trading/ws_bridge.py`:
- Подписка на `notifications:*` pattern
- Ретрансляция подключенным клиентам через ConnectionManager
- Background task запускается в lifespan FastAPI (в main.py)

Формат сообщения:
```json
{
  "type": "new_notification",
  "data": {
    "id": "uuid",
    "type": "POSITION_CLOSED",
    "priority": "medium",
    "title": "BTC/USDT: позиция закрыта",
    "message": "+$42.50 (+2.1%)",
    "link": "/bots/uuid",
    "created_at": "2026-04-10T12:00:00Z"
  }
}
```

### Celery Beat - автоочистка

Задача `notifications.cleanup_old`:
- Schedule: каждые 24 часа
- Action: DELETE WHERE created_at < now() - 30 days
- Прочитанные старше 30 дней удаляются
- Непрочитанные хранятся до прочтения + 30 дней

### Alembic миграция

Новая миграция для таблицы `notifications`. Индексы: `(user_id, created_at DESC)`, `(user_id, is_read)`.

## Frontend

### Новые файлы

```
frontend/src/
├── components/notifications/
│   ├── NotificationBell.tsx       - колокольчик + badge счетчик
│   ├── NotificationDropdown.tsx   - dropdown панель (Radix Popover)
│   ├── NotificationItem.tsx       - одно уведомление в списке
│   └── NotificationFilters.tsx    - табы фильтрации по типу
├── stores/
│   └── notifications.ts           - Zustand store
└── hooks/
    └── useNotificationStream.ts   - WebSocket подключение
```

### Zustand Store

```typescript
interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isOpen: boolean
  filter: NotificationType | 'all'
  // actions
  addNotification: (n: Notification) => void    // prepend + increment count
  markRead: (id: string) => void
  markAllRead: () => void
  deleteNotification: (id: string) => void
  setFilter: (type: NotificationType | 'all') => void
  setOpen: (v: boolean) => void
  fetchNotifications: () => Promise<void>        // initial load from API
  fetchUnreadCount: () => Promise<void>
}
```

### NotificationBell

- Заменяет placeholder в [Topbar.tsx:100-106](frontend/src/components/layout/Topbar.tsx#L100-L106)
- Lucide `Bell` icon (h-4 w-4), ghost button
- Badge: красный кружок с числом (JetBrains Mono), `position: absolute top-right`
- 0 непрочитанных - без badge, иконка gray-400
- 1-99 - красный badge с числом, иконка white
- 100+ - badge "99+"
- onClick: toggle NotificationDropdown

### NotificationDropdown

- Основан на Radix Popover (уже установлен)
- Ширина: 380px, max-height: 480px, overflow-y scroll
- Шапка: "Уведомления" + кнопка "Прочитать все"
- Фильтры: горизонтальные pill-табы (Все / Позиции / Боты / Ордера / Система / Биллинг)
- Список NotificationItem
- Футер: ссылка "Настройки уведомлений" -> /settings

### NotificationItem

- Непрочитанные: blue left border (3px #4488ff), subtle blue bg
- Прочитанные: opacity 0.6, без border
- Layout: icon (32x32, цветной bg по типу) | title + message + timestamp | кнопка удаления (x)
- Клик по item: navigate to link + markRead
- Иконки по типу: 📈 позиции, 🤖 боты, 📋 ордера, 📊 бэктесты, ⚙️ системные, 💳 биллинг
- P&L в зеленом (profit) или красном (loss)
- Timestamp: relative ("2 мин назад", "1 час назад")

### NotificationFilters

- Горизонтальные pill-кнопки
- Active: bg brand-accent (#4488ff), text white
- Inactive: bg #222, text gray
- Фильтрация через store.setFilter()

### useNotificationStream

- Паттерн аналогичен `useTradingStream.ts`
- Endpoint: `/ws/notifications?token=JWT`
- Message types: `new_notification`, `read_update`
- На `new_notification` с priority high/critical: также показать toast (useToast)
- Exponential backoff reconnect (max 30s)
- Вызывается в `DashboardLayout` рядом с `useTradingStream()`

### Настройки (Settings page)

Новая секция на странице Settings с toggle-переключателями по категориям:
- Позиции (вкл/выкл)
- Боты (вкл/выкл)
- Ордера (вкл/выкл)
- Бэктесты (вкл/выкл)
- Системные (вкл/выкл)
- Биллинг (вкл/выкл)
- Предупреждение: critical уведомления приходят всегда

## Точки интеграции

### Приоритеты по событиям

| Источник | Событие | Тип | Приоритет |
|----------|---------|-----|-----------|
| bot_worker.py | Позиция открыта | POSITION_OPENED | medium |
| bot_worker.py | Позиция закрыта | POSITION_CLOSED | medium |
| bot_worker.py | TP сработал | TP_HIT | medium |
| bot_worker.py | SL сработал | SL_HIT | high |
| bot_worker.py | Аварийное закрытие | BOT_EMERGENCY | critical |
| bybit_listener.py | Ордер исполнен | ORDER_FILLED | low |
| bybit_listener.py | Ордер отменен | ORDER_CANCELLED | medium |
| bybit_listener.py | Ошибка ордера | ORDER_ERROR | high |
| trading/router.py | Бот запущен | BOT_STARTED | low |
| trading/router.py | Бот остановлен | BOT_STOPPED | low |
| bot_worker.py | Ошибка бота | BOT_ERROR | high |
| backtest/celery_tasks.py | Бэктест завершен | BACKTEST_COMPLETED | low |
| backtest/celery_tasks.py | Бэктест упал | BACKTEST_FAILED | high |
| admin/system_service.py | Сервис недоступен | SYSTEM_ERROR | critical |
| admin/system_service.py | Соединение потеряно | CONNECTION_LOST | critical |
| admin/system_service.py | Соединение восстановлено | CONNECTION_RESTORED | medium |
| billing/service.py | Подписка истекает | SUBSCRIPTION_EXPIRING | high |
| billing/service.py | Платеж прошел | PAYMENT_SUCCESS | low |
| billing/service.py | Платеж не прошел | PAYMENT_FAILED | critical |

### Навигация по клику

| Тип | Link |
|-----|------|
| POSITION_*, TP_HIT, SL_HIT | /bots/{bot_id} |
| BOT_* | /bots/{bot_id} |
| ORDER_* | /bots/{bot_id} |
| BACKTEST_* | /backtest |
| SYSTEM_ERROR | /admin (admin only) |
| CONNECTION_* | нет ссылки |
| SUBSCRIPTION_*, PAYMENT_* | /settings |

## Дизайн

- Цвета: brand palette (#0d0d1a bg, #1a1a2e card, #4488ff accent, #FF1744 badge)
- Шрифт badge: JetBrains Mono
- Иконки: emoji (📈🤖📋📊⚙️💳) в цветных кружках (32x32)
- P&L: #00E676 profit, #FF1744 loss
- Анимация: fade-in для dropdown, slide-in для новых уведомлений
- Toast для critical: variant "error" с auto-dismiss 6 сек (вместо стандартных 4)
