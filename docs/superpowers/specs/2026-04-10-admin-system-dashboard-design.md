# Админ-раздел "Система" (System Dashboard)

Полный мониторинг здоровья платформы AlgoBond для администратора.

## Компоновка

Гибридная: компактная сводка здоровья сверху (всегда видна) + 6 табов с детальной информацией ниже.

### Сводка (Summary Bar)

Горизонтальная полоса, всегда видна на странице:

- **Кнопка "Проверить систему"** - принудительная проверка всех сервисов
- **Статус-пилюли сервисов** - 8 штук: API, PostgreSQL, Redis, Celery Worker, Celery Beat, Nginx, Bybit API, WebSocket Bridge
  - Зеленый (#00E676) - OK, желтый (#FFD700) - degraded, красный (#FF1744) - down
  - Каждая пилюля показывает latency в ms
- **Uptime сервера** - справа

### Табы

6 табов детальной информации:

1. **Redis** - память, ключи, hit rate, clients, ops/sec, кнопка flush
2. **PostgreSQL** - соединения, размер БД, записи в ключевых таблицах
3. **Celery** - workers, очередь задач, Beat, активные боты
4. **Сервер** - CPU, RAM, Disk, Load average, сетевые задержки
5. **Ошибки** - лог ошибок с фильтрами и auto-refresh
6. **Конфиг** - env переменные, Docker, версии, git hash

## Polling-стратегия

| Группа | Интервал | Данные |
|--------|----------|--------|
| Здоровье + сервер | 5 сек | summary bar, CPU, RAM, Disk, latencies |
| Инфраструктура | 60 сек | Redis info, PostgreSQL stats, Celery status |
| Ошибки | 30 сек | лог ошибок |
| Конфиг | вручную | env, Docker, версии |

Кнопка "Проверить систему" принудительно обновляет ВСЕ секции.

## Backend API

Новый роутер: `backend/app/modules/admin/system_router.py`
Все endpoints под `GET /api/admin/system/...`, требуют `get_admin_user`.

### GET /api/admin/system/health

Комплексная проверка всех сервисов. Возвращает:

```python
class ServiceHealth(BaseModel):
    name: str                    # "api", "postgresql", "redis", ...
    status: str                  # "healthy", "degraded", "down"
    latency_ms: float | None     # время отклика
    details: dict | None = None  # доп. информация

class SystemHealthResponse(BaseModel):
    services: list[ServiceHealth]
    uptime_seconds: float
    checked_at: datetime
```

Проверки:
- **API** - self-check (всегда healthy если отвечает)
- **PostgreSQL** - `SELECT 1`, замер latency
- **Redis** - `PING`, замер latency
- **Celery Worker** - `celery.control.inspect().ping()` через `asyncio.to_thread()`
- **Celery Beat** - проверка последнего запуска через Redis key или наличие scheduled tasks
- **Nginx** - HTTP GET `http://nginx:80/health` (или `/`), замер latency. Если Docker networking недоступен - пропустить, status "unknown"
- **Bybit API** - `GET /v5/market/time` через httpx, замер latency
- **WebSocket Bridge** - проверка наличия Redis key `ws_bridge:heartbeat` (bybit-listener периодически пишет timestamp). Если ключ старше 60 сек - degraded, отсутствует - down. **NOTE:** Ключ `ws_bridge:heartbeat` сейчас не пишется - нужно добавить запись в `bybit_listener.py` (SET с TTL 60 сек в основном цикле)

### GET /api/admin/system/metrics

Серверные метрики через `psutil`. **NOTE:** В Docker `cpu_percent`/`virtual_memory` показывают метрики контейнера, `getloadavg()` - хоста. На Windows `getloadavg()` недоступен - возвращать `[]`. `load_average` в продакшне (Linux Docker) корректен.

```python
class ServerMetrics(BaseModel):
    cpu_percent: float
    memory_used_gb: float
    memory_total_gb: float
    memory_percent: float
    disk_used_gb: float
    disk_total_gb: float
    disk_percent: float
    load_average: list[float]    # [1m, 5m, 15m]
```

### GET /api/admin/system/redis

Redis INFO через клиент:

```python
class RedisInfo(BaseModel):
    used_memory_mb: float
    peak_memory_mb: float
    max_memory_mb: float | None
    total_keys: int
    keys_by_db: dict[str, int]        # {"db0": 890, "db1": 234, ...}
    hit_rate_percent: float
    hits: int
    misses: int
    connected_clients: int
    ops_per_sec: int
```

### GET /api/admin/system/db

PostgreSQL метрики через системные каталоги:

```python
class TableStats(BaseModel):
    name: str
    row_count: int
    size_mb: float

class DatabaseInfo(BaseModel):
    active_connections: int
    max_connections: int
    database_size_mb: float
    tables: list[TableStats]    # users, bots, positions, orders, signals, backtest_runs
```

SQL запросы:
- `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'`
- `SHOW max_connections`
- `SELECT pg_database_size(current_database())`
- `SELECT relname, n_live_tup, pg_total_relation_size(relid) FROM pg_stat_user_tables`

### GET /api/admin/system/celery

Celery inspect через `asyncio.to_thread()`. Использовать `Inspect(timeout=2.0)` для предотвращения зависания при недоступном broker:

```python
class CeleryWorkerInfo(BaseModel):
    name: str
    status: str          # "online", "offline"
    active_tasks: int
    processed: int

class CeleryInfo(BaseModel):
    workers: list[CeleryWorkerInfo]
    queue_length: int            # задач в очереди (через redis.llen("celery") - имя дефолтной очереди)
    active_tasks: int
    beat_last_run: datetime | None    # из Redis key celery-beat:last_run. **NOTE:** Стандартный Celery Beat не пишет этот ключ - нужно добавить signal `beat_init` или custom scheduler в `celery_app.py` для записи timestamp при каждом tick
    active_bots_count: int       # Bot.status == RUNNING
```

### GET /api/admin/system/errors?module=trading&limit=50

Логи уровня ERROR из `BotLog`:

```python
class ErrorLogItem(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    module: str              # вычисляемое поле, эвристика по message
    message: str
    traceback: str | None    # берётся из BotLog.details["traceback"] (JSONB)
    bot_id: uuid.UUID | None
    user_email: str | None   # JOIN: BotLog -> Bot -> User (аналогично AdminService.list_logs)

class ErrorLogResponse(BaseModel):
    items: list[ErrorLogItem]
    total: int
```

Фильтры: `module` (str), `limit` (int, default=50), `offset` (int, default=0).
Источник: таблица `bot_logs` с `level = 'ERROR'`. Модуль определяется эвристически из `message` текста (содержит "bybit"/"order" -> trading, "backtest" -> backtest, "kline"/"market" -> market, и т.д.). При невозможности определить - "other".

### GET /api/admin/system/config

Конфигурация без секретов:

```python
class SystemConfig(BaseModel):
    env_vars: dict[str, str]     # маскированные значения для API_KEY, SECRET, PASSWORD
    app_version: str
    python_version: str
    git_commit: str
    docker_containers: list[ContainerStatus] | None

class ContainerStatus(BaseModel):
    name: str
    status: str        # "running", "stopped", "restarting"
    uptime: str | None
```

Маскировка: любой env var, имя которого содержит `KEY`, `SECRET`, `PASSWORD`, `TOKEN` (case-insensitive проверка через `.upper()`) заменяется на `••••••••••`.

### POST /api/admin/system/redis/flush

Очистка Redis кеша (DB 0 - только данные, не Celery broker/results).
**Не использовать `flushdb()`** - это удалит служебные ключи (`ws_bridge:heartbeat` и др.). Вместо этого: `SCAN` по паттернам кеш-ключей (`cache:*`, `market:*`, `strategy:*`) + пакетный `DEL`.

```python
class FlushResponse(BaseModel):
    flushed_keys: int
    message: str
```

### GET /api/admin/system/platform-pnl?exclude_demo=true

Суммарный P&L по всем ботам:

```python
class PlatformPnL(BaseModel):
    total_pnl: Decimal
    total_bots: int
    active_bots: int
    demo_bots_excluded: int    # сколько demo ботов исключено
    live_pnl: Decimal          # только live
    demo_pnl: Decimal          # только demo
```

Query param `exclude_demo: bool = False` - при True исключает Bot.mode == BotMode.DEMO.

### POST /api/admin/system/reconcile-all

Сверка P&L по всем активным ботам с live режимом.
**NOTE:** Существующий `reconcile_bot_pnl(bot_id, user_id)` проверяет владельца. Для admin-версии нужно создать `admin_reconcile_bot(bot_id)` в `system_service.py` без проверки `user_id` (или передавать `bot.user_id` из модели).

```python
class ReconcileAllResponse(BaseModel):
    bots_checked: int
    corrections: int
    results: list[dict]     # результат reconcile каждого бота
```

## Frontend

### Файл: `frontend/src/pages/admin/AdminSystem.tsx`

Единая страница с:

1. **Summary Bar** - компонент сводки здоровья
2. **Tabs** - shadcn/ui `Tabs` компонент с 6 табами
3. **Каждый таб** - отдельный блок с карточками метрик

### Состояние

`useState` для каждого блока данных (как в остальных admin страницах):
- `healthData`, `metricsData`, `redisData`, `dbData`, `celeryData`, `errorsData`, `configData`, `pnlData`
- `loading` флаги для каждого
- `activeTab` для текущего таба
- `errorModule` для фильтра ошибок
- `excludeDemo` toggle для P&L

### Polling

`useEffect` + `setInterval` с разными интервалами:
- 5 сек: `health` + `metrics`
- 60 сек: `redis` + `db` + `celery`
- 30 сек: `errors` (только если таб "Ошибки" активен)
- `config` - только при переключении на таб или по кнопке

Кнопка "Проверить систему" вызывает все endpoints разом через `Promise.all`.

### UI компоненты

- **MetricCard** - карточка с label, value, sub-text, progress bar (опционально)
- **ServicePill** - пилюля статуса сервиса в summary bar
- **ErrorRow** - строка ошибки с раскрывающимся traceback и кнопкой копирования

Используются shadcn/ui: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Card`, `Button`, `Badge`, `Select`, `Table`, `Skeleton`, `AlertDialog` (для подтверждения flush/reconcile).

### Алерты

Красная зона показывается как `Alert` под summary bar:
- CPU > 90%
- RAM > 80%
- Disk > 90%
- Любой сервис в статусе "down"
- Bybit latency > 500ms
- Redis hit rate < 50%

### Routing и навигация

- Роут: `/admin/system` в `App.tsx` под `<AdminRoute>`
- Sidebar: добавить `{ name: 'Система', href: '/admin/system', icon: Monitor }` после "Логи"

### Адаптивность

- Desktop (1920-1440): 3-4 колонки карточек, таблицы полноширинные
- Tablet (1024-768): 2 колонки карточек, summary bar с переносом пилюлей
- Mobile (375-360): 1 колонка карточек, таблицы со скроллом, табы скроллируемые

### Skeleton loading

Все карточки показывают Skeleton при загрузке (shadcn/ui `Skeleton`).

## Зависимости

### Backend

- `psutil` - серверные метрики (CPU, RAM, Disk). Добавить в `requirements.txt`
- `redis.asyncio` - уже есть
- `celery.app.control` - inspect workers. Уже доступно через `celery_app`
- `httpx` - для проверки Bybit API latency (или `pybit`). Уже есть

### Frontend

- shadcn/ui компоненты (Tabs, Card, Badge, Select, etc.) - проверить наличие, установить недостающие
- `lucide-react` иконки: Monitor, Database, HardDrive, Cpu, Activity, AlertTriangle, RefreshCw, Trash2, Copy, Server, Wifi, Clock

## Файлы для создания/изменения

### Создать
- `backend/app/modules/admin/system_router.py` - роутер системных endpoints
- `backend/app/modules/admin/system_service.py` - сервис системных метрик
- `backend/app/modules/admin/system_schemas.py` - Pydantic схемы
- `frontend/src/pages/admin/AdminSystem.tsx` - страница

### Изменить
- `backend/app/main.py` - подключить `system_router`
- `backend/app/modules/trading/bybit_listener.py` - добавить запись `ws_bridge:heartbeat` в Redis (SET с TTL 60 сек)
- `backend/app/celery_app.py` - добавить запись `celery-beat:last_run` при каждом tick Beat
- `frontend/src/App.tsx` - добавить роут `/admin/system`
- `frontend/src/components/layout/Sidebar.tsx` - добавить "Система" в навигацию
- `backend/requirements.txt` - добавить `psutil`

### Установить shadcn компоненты
- `npx shadcn@latest add alert-dialog` (не установлен)
