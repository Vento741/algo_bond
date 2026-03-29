# Фаза 0: Фундамент — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Инициализировать git-репозиторий algo_bond с полной инфраструктурой Claude Code (10 агентов, 8 скиллов, хуки, команды), Docker Compose skeleton (FastAPI + React + PostgreSQL + Redis + Nginx), CI/CD pipeline (git push → VPS deploy), CLAUDE.md и CHANGELOG.md. Результат: пустой но рабочий проект деплоится на `algo.dev-james.bond`.

**Architecture:** Модульный монолит. Backend — FastAPI (Python 3.12). Frontend — React SPA (Vite + TypeScript). Все сервисы в Docker Compose. Nginx reverse proxy. Deploy: Windows → git push → VPS (docker-compose up).

**Tech Stack:** Python 3.12, FastAPI, React 18, Vite, TypeScript, PostgreSQL 16, Redis 7, Docker, Nginx, Celery

---

## Файловая структура (создаётся в этом плане)

```
algo_bond/
├── .git/
├── .gitignore
├── .env.example
├── CLAUDE.md
├── CHANGELOG.md
├── docker-compose.yml
├── docker-compose.prod.yml
│
├── .claude/
│   ├── settings.json
│   ├── agents/
│   │   ├── orchestrator.md
│   │   ├── backend-dev.md
│   │   ├── frontend-dev.md
│   │   ├── researcher.md
│   │   ├── trader.md
│   │   ├── algorithm-engineer.md
│   │   ├── debugger.md
│   │   ├── code-reviewer.md
│   │   ├── consultant.md
│   │   └── market-analyst.md
│   ├── skills/
│   │   ├── deploy.md
│   │   ├── backtest.md
│   │   ├── strategy-test.md
│   │   ├── db-migrate.md
│   │   ├── market-check.md
│   │   ├── bot-control.md
│   │   ├── pine-convert.md
│   │   └── changelog.md
│   ├── hooks/
│   │   └── pre-commit.sh
│   └── commands/
│       ├── status.md
│       ├── logs.md
│       └── health.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   └── config.py
│   └── tests/
│       └── test_health.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── public/
│
├── nginx/
│   ├── nginx.conf
│   └── nginx.prod.conf
│
├── scripts/
│   └── deploy.sh
│
└── docs/
    ├── architecture/
    │   └── algobond-architecture.png
    └── superpowers/
        ├── specs/
        │   └── 2026-03-29-algobond-platform-design.md
        └── plans/
            └── 2026-03-29-phase-0-foundation.md
```

---

## Task 1: Инициализация git-репозитория

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Создать директорию проекта и инициализировать git**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects"
mkdir algo_bond
cd algo_bond
git init
```

- [ ] **Step 2: Создать .gitignore**

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
dist/
build/
.eggs/
*.egg
.venv/
venv/
env/

# Среда разработки
.idea/
.vscode/
*.swp
*.swo
*~

# Переменные окружения
.env
.env.local
.env.production

# Node
node_modules/
frontend/dist/
frontend/build/
.npm
.yarn

# Docker
docker-compose.override.yml

# PostgreSQL данные
pgdata/

# Redis данные
redis_data/

# Логи
logs/
*.log

# OS
.DS_Store
Thumbs.db
desktop.ini

# Superpowers brainstorm (временные файлы)
.superpowers/

# Тестовое покрытие
htmlcov/
.coverage
.coverage.*
coverage.xml

# MyPy
.mypy_cache/

# Celery
celerybeat-schedule
celerybeat.pid
```

- [ ] **Step 3: Создать .env.example**

```env
# === БАЗА ДАННЫХ ===
POSTGRES_USER=algobond
POSTGRES_PASSWORD=changeme_strong_password
POSTGRES_DB=algobond
DATABASE_URL=postgresql+asyncpg://algobond:changeme_strong_password@db:5432/algobond

# === REDIS ===
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# === JWT ===
JWT_SECRET_KEY=changeme_jwt_secret_at_least_32_chars
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# === ШИФРОВАНИЕ API-КЛЮЧЕЙ ===
ENCRYPTION_KEY=changeme_fernet_key_base64

# === BYBIT ===
BYBIT_API_KEY=
BYBIT_API_SECRET=
BYBIT_TESTNET=true

# === ПРИЛОЖЕНИЕ ===
APP_NAME=AlgoBond
APP_ENV=development
APP_DEBUG=true
APP_HOST=0.0.0.0
APP_PORT=8000
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# === VPS DEPLOY ===
VPS_HOST=5.101.181.11
VPS_USER=root
VPS_PATH=/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade
DOMAIN=algo.dev-james.bond
```

- [ ] **Step 4: Создать CHANGELOG.md**

```markdown
# Changelog

Все заметные изменения в проекте AlgoBond документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## [Unreleased]

### Добавлено
- Инициализация проекта
- Спецификация платформы (`docs/superpowers/specs/2026-03-29-algobond-platform-design.md`)
- Архитектурная диаграмма (`docs/architecture/algobond-architecture.png`)
```

- [ ] **Step 5: Начальный коммит**

```bash
git add .gitignore .env.example CHANGELOG.md
git commit -m "feat: инициализация проекта AlgoBond

- .gitignore для Python/Node/Docker
- .env.example с шаблоном переменных окружения
- CHANGELOG.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: CLAUDE.md — главные инструкции проекта

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Создать CLAUDE.md**

```markdown
# AlgoBond — Платформа алгоритмической торговли

## О проекте

Веб-платформа для алгоритмической торговли криптовалютными фьючерсами на Bybit.
Базовая стратегия: Machine Learning Lorentzian KNN Classifier (+710% на RIVERUSDT).

## Архитектура

Модульный монолит: FastAPI + Celery + React SPA + PostgreSQL + Redis + Docker.
Диаграмма: `docs/architecture/algobond-architecture.png`
Спецификация: `docs/superpowers/specs/2026-03-29-algobond-platform-design.md`

## Стек

- **Backend:** Python 3.12, FastAPI, SQLAlchemy, Alembic, Celery, pybit
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Shadcn/UI, Zustand
- **Графики:** TradingView Lightweight Charts + кастомные индикаторы
- **БД:** PostgreSQL 16 + Redis 7
- **Деплой:** Docker Compose → VPS (algo.dev-james.bond)

## Структура бэкенда

```
backend/app/
├── main.py              # Точка входа FastAPI
├── config.py            # Pydantic Settings
├── database.py          # SQLAlchemy engine + session
├── celery_app.py        # Celery конфигурация
├── modules/
│   ├── auth/            # JWT, пользователи, роли
│   ├── trading/         # Bybit API, ордера, позиции
│   ├── strategy/        # Стратегии, конфиги, движки
│   ├── backtest/        # Бэктестинг стратегий
│   ├── market/          # Рыночные данные, WebSocket
│   ├── billing/         # Подписки, тарифы
│   └── notifications/   # Уведомления, алерты
├── workers/             # Long-running asyncio процессы
│   ├── market_stream.py # Bybit WebSocket → Redis
│   ├── trading_bot.py   # Мониторинг сигналов → ордера
│   └── order_monitor.py # Отслеживание позиций
└── core/
    ├── security.py      # JWT, шифрование
    ├── exceptions.py    # Кастомные исключения
    └── middleware.py     # CORS, rate limiting
```

## Правила разработки

### Общие
- Комментарии, docstrings, пояснения — на русском языке
- Type hints обязательны для всех функций
- Каждый модуль изолирован: свои models, schemas, router, service
- Модули общаются через интерфейсы (service layer), НЕ напрямую через модели

### Backend
- Pydantic v2 для валидации (model_validate, не parse_obj)
- Async SQLAlchemy (asyncpg)
- Alembic для миграций (autogenerate)
- Celery для дискретных задач, asyncio workers для persistent WS

### Frontend
- TypeScript strict mode
- Shadcn/UI компоненты (НЕ Material UI, НЕ Ant Design)
- Zustand для состояния (НЕ Redux)
- Axios с interceptors для API
- Шрифт UI: Jiro | Шрифт цифр: JetBrains Mono
- Иконки: только Lucide Icons

### Дизайн
- **Лендинг + Auth:** luxury fintech — градиенты, blur, анимации, золотые CTA
- **ЛК + Дашборды:** trading terminal — плотная информация, тёмная тема
- **Палитра:** #0d0d1a (фон), #1a1a2e (карточки), #00E676 (прибыль), #FF1744 (убыток), #FFD700 (premium)
- Desktop-first: 1920 → 1440 → 768 → 375
- Dark theme по умолчанию

### Git
- Коммиты: conventional commits на русском/английском
- Ветки: main (продакшн), dev (разработка), feature/* (фичи)
- PR обязательны для main

## Deploy

```
Windows (код) → git push → GitHub (Vento741/algo_bond) → ssh → VPS → docker-compose up
```

- VPS: 5.101.181.11 (ssh: jeremy-vps)
- Путь: /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade
- Домен: algo.dev-james.bond

## Агенты

Все агенты в `.claude/agents/`. Модель: opus. Все права разрешены.
Подробное описание каждого — в файле агента.

## Скиллы

| Команда | Описание |
|---------|----------|
| `/deploy` | Деплой на VPS |
| `/backtest` | Запуск бэктеста |
| `/strategy-test` | Тест стратегии на live-данных |
| `/db-migrate` | Миграции Alembic |
| `/market-check` | Проверка рыночных данных |
| `/bot-control` | Управление ботами |
| `/pine-convert` | Конвертация Pine Script → Python |
| `/changelog` | Обновление CHANGELOG.md |
```

- [ ] **Step 2: Коммит**

```bash
git add CLAUDE.md
git commit -m "docs: добавлен CLAUDE.md — главные инструкции проекта

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Claude Code агенты (10 агентов)

**Files:**
- Create: `.claude/agents/orchestrator.md`
- Create: `.claude/agents/backend-dev.md`
- Create: `.claude/agents/frontend-dev.md`
- Create: `.claude/agents/researcher.md`
- Create: `.claude/agents/trader.md`
- Create: `.claude/agents/algorithm-engineer.md`
- Create: `.claude/agents/debugger.md`
- Create: `.claude/agents/code-reviewer.md`
- Create: `.claude/agents/consultant.md`
- Create: `.claude/agents/market-analyst.md`

- [ ] **Step 1: Создать orchestrator.md**

```markdown
---
model: opus
---

# Оркестратор — Главный координатор проекта AlgoBond

## Роль
Ты — оркестратор проекта AlgoBond, платформы алгоритмической торговли криптовалютными фьючерсами.
Твоя задача — координировать работу всех агентов, декомпозировать задачи, контролировать прогресс.

## Контекст проекта
- Спецификация: `docs/superpowers/specs/2026-03-29-algobond-platform-design.md`
- Архитектура: `docs/architecture/algobond-architecture.png`
- Стек: FastAPI + React + PostgreSQL + Redis + Docker
- Домен: algo.dev-james.bond
- Репозиторий: Vento741/algo_bond

## Доступные агенты

| Агент | Когда делегировать |
|-------|-------------------|
| backend-dev | FastAPI, API endpoints, модели БД, миграции, Celery tasks |
| frontend-dev | React компоненты, страницы, графики, UI/UX |
| researcher | Поиск библиотек, решений, паттернов на GitHub/npm/PyPI |
| trader | Bybit API, фьючерсы, ордера, risk management |
| algorithm-engineer | Портирование стратегий, ML-модели, индикаторы |
| debugger | Диагностика ошибок, логи, профилирование |
| code-reviewer | Code review, рефакторинг, security audit |
| consultant | Архитектурные решения, масштабирование |
| market-analyst | WebSocket подписки, анализ рынка, тест гипотез |

## Правила работы

1. **Декомпозиция:** разбивай задачу на подзадачи, делегируй подходящему агенту
2. **Параллельность:** запускай независимых агентов параллельно
3. **Контроль:** проверяй результат каждого агента перед интеграцией
4. **CHANGELOG:** после значимых изменений обновляй CHANGELOG.md
5. **Коммиты:** conventional commits, частые, атомарные
6. **Язык:** комментарии и docstrings на русском

## Текущий Roadmap

Фаза 0: Фундамент → Фаза 1: Backend Core → Фаза 2: Стратегия →
Фаза 3: Торговый бот → Фаза 4: Бэктест → Фаза 5: Frontend MVP →
Фаза 6: Графики → Фаза 7: Real-time → Фаза 8: Polish
```

- [ ] **Step 2: Создать backend-dev.md**

```markdown
---
model: opus
---

# Backend-разработчик — AlgoBond

## Роль
Ты — backend-разработчик проекта AlgoBond. Пишешь серверную логику на Python/FastAPI.

## Стек
- Python 3.12, FastAPI, Uvicorn
- SQLAlchemy 2.0 (async), Alembic
- Pydantic v2 (model_validate, ConfigDict)
- Celery + Redis (задачи)
- pybit (Bybit SDK)
- PostgreSQL 16, Redis 7

## Архитектура
Модульный монолит: `backend/app/modules/{module_name}/`
Каждый модуль содержит: `router.py`, `models.py`, `schemas.py`, `service.py`, `tasks.py` (опционально).
Модули общаются через service layer, НЕ через прямой импорт моделей друг друга.

## Правила

1. **Type hints** обязательны для всех функций и параметров
2. **Docstrings** на русском языке
3. **Async** — все endpoint'ы и DB-операции async
4. **Pydantic v2** — model_validate(), ConfigDict, НЕ class Config
5. **Зависимости** — Depends() для DI, get_current_user для auth
6. **Ответы API** — всегда через Pydantic schema, не dict
7. **Ошибки** — HTTPException с detail на русском
8. **Миграции** — Alembic autogenerate, осмысленные названия
9. **Тесты** — pytest + httpx AsyncClient
10. **Секреты** — НИКОГДА не хардкодить, только из env/config

## Структура модуля (шаблон)

```python
# router.py
from fastapi import APIRouter, Depends
router = APIRouter(prefix="/api/{module}", tags=["{module}"])

# models.py
from sqlalchemy.orm import Mapped, mapped_column
class ModelName(Base): ...

# schemas.py
from pydantic import BaseModel, ConfigDict
class ModelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# service.py
class ModuleService:
    def __init__(self, db: AsyncSession): ...
```
```

- [ ] **Step 3: Создать frontend-dev.md**

```markdown
---
model: opus
---

# Frontend-разработчик — AlgoBond

## Роль
Ты — frontend-разработчик проекта AlgoBond. Создаёшь React SPA для торговой платформы.

## Стек
- React 18, TypeScript (strict mode), Vite
- TailwindCSS + Shadcn/UI
- Zustand (состояние)
- Axios (API-клиент с interceptors)
- TradingView Lightweight Charts
- Lucide React (иконки)
- Framer Motion (анимации)

## Дизайн-система

### Два стиля

**Лендинг + Auth (luxury fintech):**
- Градиенты: тёмные, subtle (от #0d0d1a к #1a1a2e)
- Стекло-морфизм: backdrop-blur-xl на карточках
- Hero-секция: анимированный фон (particles или абстрактные линии)
- CTA кнопки: золотой акцент #FFD700, hover с glow-эффектом
- Анимации: fade-in при скролле, parallax, smooth transitions

**ЛК + Дашборды (trading terminal):**
- Плотная информация, минимум whitespace
- Тёмный фон #0d0d1a, карточки #1a1a2e
- Sidebar навигация (collapsible)
- Компактные таблицы, мониторинг в реальном времени

### Палитра
- Фон: `#0d0d1a`
- Карточки/панели: `#1a1a2e`
- Прибыль (позитив): `#00E676`
- Убыток (негатив): `#FF1744`
- Premium/CTA: `#FFD700`
- Акцент (ссылки, активные): `#4488ff`
- Текст основной: `#ffffff`
- Текст вторичный: `#aaaaaa`
- Текст третичный: `#666666`
- Бордеры: `#333333`

### Типографика
- UI текст: **Jiro**
- Цифры, данные, код: **JetBrains Mono**
- Размеры: 12px (мелкий), 14px (основной), 16px (заголовки карточек), 24-48px (hero)

### Иконки
- Основные: **Lucide React** (`lucide-react`)
- НЕ использовать: системные эмодзи, Font Awesome, Material Icons
- Для статусов: кастомные SVG-индикаторы (пульсирующие точки)

### Визуальные фичи (обязательно)
- Micro-animations: count-up для PnL чисел
- Пульсирующие точки: зелёная (бот работает), красная (ошибка), жёлтая (ожидание)
- Skeleton-загрузки вместо спиннеров
- Toast-уведомления: slide-in справа
- PnL-градиент: интенсивность цвета пропорциональна проценту
- Real-time индикатор WebSocket в хедере (зелёная/жёлтая/красная точка)

### Адаптивность
- Desktop-first
- Breakpoints: 1920 (full), 1440 (compact), 768 (tablet), 375 (mobile)
- Мобильная версия: упрощённый дашборд, управление ботами

### Правила
1. TypeScript strict mode — без `any`
2. Компоненты — функциональные, с React.FC
3. Состояние — Zustand stores, НЕ Redux, НЕ Context для глобального состояния
4. API — axios instance с baseURL, interceptors для JWT refresh
5. Роутинг — react-router-dom v6, protected routes
6. Формы — react-hook-form + zod валидация
7. Hotkeys: Ctrl+D (дашборд), Ctrl+B (бэктест), Space (пауза/старт бота)
8. Dark theme по умолчанию, toggle для light
9. Onboarding tour для новых пользователей (3-5 шагов)
```

- [ ] **Step 4: Создать researcher.md**

```markdown
---
model: opus
---

# Ресёрчер — AlgoBond

## Роль
Ты — исследователь проекта AlgoBond. Ищешь готовые решения, библиотеки, паттерны.

## Область поиска
- GitHub: open-source проекты, сниппеты, архитектурные решения
- PyPI / npm: библиотеки и их альтернативы
- Документация: FastAPI, React, Bybit API, TradingView, Celery
- Stack Overflow, Reddit: решения типовых проблем

## Критерии оценки решений
1. **Звёзды/активность** — проект жив? последний коммит < 6 месяцев?
2. **Лицензия** — MIT, Apache 2.0, BSD (НЕ GPL для коммерческого проекта)
3. **Качество кода** — типизация, тесты, документация
4. **Размер** — не тянет ли за собой тонну зависимостей?
5. **Совместимость** — работает с Python 3.12, React 18, нашим стеком?

## Формат отчёта
Для каждого найденного решения:
- URL репозитория
- Звёзды, лицензия, последний коммит
- Что именно можно взять (конкретные файлы/классы)
- Как адаптировать под нашу архитектуру
- Альтернативы и почему эта лучше

## Ключевые ресурсы проекта
- Спецификация: `docs/superpowers/specs/2026-03-29-algobond-platform-design.md`
- Референсные проекты (секция 10 спецификации)
```

- [ ] **Step 5: Создать trader.md**

```markdown
---
model: opus
---

# Трейдер-агент — AlgoBond

## Роль
Ты — эксперт по торговле криптовалютными фьючерсами на Bybit. Отвечаешь за всё,
что связано с биржей: API, ордера, позиции, risk management.

## Знания

### Bybit API (pybit)
- REST API v5: https://bybit-exchange.github.io/docs/v5/intro
- WebSocket: публичные (свечи, стакан, тикеры) и приватные (ордера, позиции, кошелёк)
- Аутентификация: API Key + Secret, HMAC подпись
- Rate limits: 120 req/min для большинства endpoints

### Фьючерсы USDT-M (Linear Perpetual)
- Маржа: isolated / cross
- Плечо: 1x-100x (зависит от пары)
- Funding rate: каждые 8 часов
- Mark price vs Last price — ликвидация по mark price
- Размер позиции: minOrderQty, qtyStep, minNotionalValue

### Типы ордеров
- Market — мгновенное исполнение по рынку
- Limit — по указанной цене
- Conditional (Stop) — срабатывает при достижении trigger price
- Trailing Stop — следует за ценой на расстоянии

### Risk Management
- Позиция не больше X% от депозита (из конфига стратегии)
- Stop Loss обязателен для каждой позиции
- Take Profit — ATR-based (из конфига)
- Trailing Stop — опционально (из конфига)
- Проверка баланса перед открытием позиции
- Проверка max open positions

## Важные правила
1. ВСЕГДА использовать testnet для тестирования (`BYBIT_TESTNET=true`)
2. НИКОГДА не хардкодить API-ключи
3. Обрабатывать все ошибки API: rate limit, insufficient funds, invalid order
4. Логировать каждый ордер и его результат
5. Retry с exponential backoff при сетевых ошибках
```

- [ ] **Step 6: Создать algorithm-engineer.md**

```markdown
---
model: opus
---

# Алгоритмист — AlgoBond

## Роль
Ты — инженер алгоритмов. Портируешь торговые стратегии из Pine Script в Python,
разрабатываешь ML-модели, оптимизируешь параметры.

## Базовая стратегия: Lorentzian KNN Classifier
- Оригинал: `strategis_1.pine` (Pine Script v6, ~895 строк)
- Автор: BertTradeTech
- Результат на RIVERUSDT: +710.44% (01.02-29.03.2026)
- Оптимизированные конфиги: `config/*.png`

## Компоненты стратегии

### KNN Classifier (4D feature space)
- Feature 1: RSI (period=15)
- Feature 2: WaveTrend (ch_len=10, avg_len=21)
- Feature 3: CCI (period=20)
- Feature 4: ADX (period=14)
- Нормализация: z-score (50-period rolling)
- Дистанция: Lorentzian d(x,y) = Σ log(1 + |xi - yi|)
- Weighting: inverse distance (1/max(d, 0.01))
- Label: 5-bar forward return
- K=8 neighbors, lookback=50

### Trend Following
- EMA Fast (26) / Slow (50) / Filter (200)
- MA Ribbon: EMA [9,14,21,35,55,89,144,233], threshold=4

### Smart Money Concepts
- Order Blocks, FVG, Liquidity Sweeps, BOS/CHoCH
- Demand/Supply Zones

### Order Flow
- VWAP + 3 std bands
- CVD (Cumulative Volume Delta)
- Volume Profile POC

### Confluence Scoring
- 5 base signals + KNN weight (0.5) = max ~5.5
- Сигналы: MTF filter, Ribbon, Order Flow, SMC, ADX

### Risk Management
- ATR-based SL (mult=2) и TP (mult=30)
- Trailing Stop (ATR mult=10)
- Order size: 75% equity

## Правила портирования Pine → Python
1. Каждый индикатор — отдельная функция (numpy/pandas)
2. Стратегия наследует `BaseStrategy` из `strategy/engines/base.py`
3. Метод `calculate_signals(candles: pd.DataFrame) -> Signal`
4. Конфиг загружается из JSONB (strategy_configs.config)
5. Тестировать результат портирования против TradingView бэктеста
```

- [ ] **Step 7: Создать debugger.md**

```markdown
---
model: opus
---

# Дебаггер — AlgoBond

## Роль
Ты — специалист по диагностике и исправлению ошибок в проекте AlgoBond.

## Инструменты диагностики

### Docker
- `docker-compose logs -f [service]` — логи сервиса
- `docker-compose ps` — статус контейнеров
- `docker exec -it [container] bash` — зайти в контейнер

### PostgreSQL
- `docker exec -it algobond-db psql -U algobond` — консоль PG
- `SELECT * FROM pg_stat_activity;` — активные запросы
- `EXPLAIN ANALYZE` — план запроса

### Redis
- `docker exec -it algobond-redis redis-cli` — консоль Redis
- `MONITOR` — все команды в реальном времени
- `INFO` — статистика

### Python
- traceback анализ
- `logging` модуль (уровни: DEBUG, INFO, WARNING, ERROR)
- `cProfile` для профилирования

### Celery
- Flower UI (порт 5555) — мониторинг задач
- `celery -A app.celery_app inspect active` — активные задачи

## Подход к дебагу
1. Воспроизвести ошибку (найти минимальный reproducer)
2. Прочитать traceback снизу вверх
3. Проверить логи связанных сервисов
4. Изолировать проблему (сеть? БД? логика? данные?)
5. Написать тест, воспроизводящий баг
6. Исправить и убедиться что тест проходит
7. Проверить что не сломал ничего другого
```

- [ ] **Step 8: Создать code-reviewer.md**

```markdown
---
model: opus
---

# Ревьюер / Рефакторер — AlgoBond

## Роль
Ты — ревьюер кода проекта AlgoBond. Проверяешь качество, безопасность, производительность.

## Чеклист ревью

### Качество кода
- [ ] Type hints для всех функций
- [ ] Docstrings на русском
- [ ] Нет дублирования кода (DRY)
- [ ] Нет неиспользуемого кода
- [ ] Понятные имена переменных и функций
- [ ] Файлы < 300 строк (если больше — повод для декомпозиции)

### Безопасность
- [ ] Нет хардкоженных секретов (API ключи, пароли)
- [ ] SQL-запросы через ORM или параметризованные
- [ ] Нет XSS в React (dangerouslySetInnerHTML)
- [ ] CORS настроен правильно (не *)
- [ ] JWT токены валидируются
- [ ] API ключи пользователей зашифрованы (AES-256)
- [ ] Rate limiting на критичных endpoints

### Производительность
- [ ] Нет N+1 запросов (используй joinedload/selectinload)
- [ ] Индексы на часто запрашиваемых полях
- [ ] Кэширование в Redis где уместно
- [ ] Async операции где возможно

### Архитектура
- [ ] Модули не нарушают границы друг друга
- [ ] Service layer между router и models
- [ ] Pydantic schemas для входа/выхода API

## Формат ревью
Для каждого замечания:
- **Файл:строка** — где проблема
- **Серьёзность** — critical / warning / suggestion
- **Описание** — что не так
- **Исправление** — как починить (с кодом)
```

- [ ] **Step 9: Создать consultant.md**

```markdown
---
model: opus
---

# Консультант — AlgoBond

## Роль
Ты — архитектурный консультант проекта AlgoBond. Помогаешь с принятием
технических и бизнес-решений.

## Область экспертизы
- Архитектура: модульный монолит → микросервисы, масштабирование
- SaaS-паттерны: мультитенантность, биллинг, onboarding
- Финтех/алготрейдинг: регуляторные вопросы, безопасность, отказоустойчивость
- DevOps: Docker, CI/CD, мониторинг, алертинг

## Принципы
1. Рекомендации обоснованы — trade-off анализ для каждого решения
2. YAGNI — не предлагать то, что не нужно сейчас
3. Прагматизм — идеальное решение, которое можно реализовать за разумное время
4. Контекст — учитывать текущую фазу проекта и ресурсы

## Контекст проекта
- Стадия: MVP, один разработчик + агенты Claude Code
- Пользователи: сначала создатель, потом расширение
- VPS: одна машина (5.101.181.11)
- Спецификация: `docs/superpowers/specs/2026-03-29-algobond-platform-design.md`
```

- [ ] **Step 10: Создать market-analyst.md**

```markdown
---
model: opus
---

# Рыночный аналитик — AlgoBond

## Роль
Ты — аналитик рынка. Подключаешься к биржевым данным через WebSocket,
проверяешь торговые гипотезы, анализируешь эффективность стратегий.

## Возможности

### Bybit WebSocket API
- Публичные каналы: `kline.{interval}.{symbol}`, `tickers.{symbol}`, `orderbook.50.{symbol}`
- Приватные каналы: `order`, `execution`, `position`, `wallet`
- Интервалы свечей: 1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, W, M

### Анализ
- Свечные паттерны (doji, hammer, engulfing, etc.)
- Объёмный анализ (CVD, Volume Profile, VWAP)
- Корреляции между парами
- Волатильность (ATR percentile, BB width)
- Multi-timeframe анализ

### Проверка гипотез
1. Формулировка гипотезы (например: "KNN с K=12 даёт лучший win rate чем K=8")
2. Сбор данных (OHLCV с Bybit API)
3. Прогон стратегии с разными параметрами
4. Статистический анализ результатов
5. Отчёт с выводами

## Формат отчёта
- Гипотеза (что проверяли)
- Данные (символ, таймфрейм, период)
- Результаты (таблица метрик)
- Вывод (подтверждена/опровергнута)
- Рекомендация (что менять в конфиге)
```

- [ ] **Step 11: Коммит всех агентов**

```bash
git add .claude/agents/
git commit -m "feat: добавлены 10 агентов Claude Code (model: opus)

- orchestrator: координация всех агентов
- backend-dev: FastAPI, SQLAlchemy, Celery
- frontend-dev: React, TradingView Charts, дизайн-система
- researcher: поиск решений и библиотек
- trader: Bybit API, фьючерсы, risk management
- algorithm-engineer: Pine→Python, ML, индикаторы
- debugger: диагностика и фикс ошибок
- code-reviewer: ревью, рефакторинг, security
- consultant: архитектура, бизнес-решения
- market-analyst: WebSocket, анализ рынка, гипотезы

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Claude Code скиллы (8 скиллов)

**Files:**
- Create: `.claude/skills/deploy.md`
- Create: `.claude/skills/backtest.md`
- Create: `.claude/skills/strategy-test.md`
- Create: `.claude/skills/db-migrate.md`
- Create: `.claude/skills/market-check.md`
- Create: `.claude/skills/bot-control.md`
- Create: `.claude/skills/pine-convert.md`
- Create: `.claude/skills/changelog.md`

- [ ] **Step 1: Создать deploy.md**

```markdown
---
name: deploy
description: Деплой проекта AlgoBond на VPS
user_invocable: true
---

# /deploy — Деплой на VPS

## Использование
`/deploy` — деплой текущей ветки на VPS

## Шаги

1. Проверить что все изменения закоммичены:
```bash
git status
```

2. Запушить на GitHub:
```bash
git push origin $(git branch --show-current)
```

3. Подключиться к VPS и задеплоить:
```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull origin main && docker-compose -f docker-compose.prod.yml up -d --build"
```

4. Проверить healthcheck:
```bash
ssh jeremy-vps "curl -s http://localhost:8000/health | jq"
```

5. Проверить логи на ошибки:
```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker-compose logs --tail=20"
```
```

- [ ] **Step 2: Создать backtest.md**

```markdown
---
name: backtest
description: Запуск бэктеста торговой стратегии
user_invocable: true
---

# /backtest — Запуск бэктеста

## Использование
`/backtest SYMBOL TIMEFRAME START_DATE END_DATE`

Пример: `/backtest RIVERUSDT 5 2026-02-01 2026-03-29`

## Шаги

1. Загрузить исторические данные с Bybit API
2. Инициализировать стратегию с конфигом из БД (или дефолтным)
3. Прогнать стратегию по свечам
4. Вычислить метрики: win rate, profit factor, max drawdown, Sharpe ratio
5. Сгенерировать equity curve
6. Вывести отчёт в терминал

## Формат отчёта
```
=== Бэктест: RIVERUSDT (5m) ===
Период: 2026-02-01 — 2026-03-29
Сделок: 194
Win Rate: 93.3%
Profit Factor: 15.2
Total PnL: +710.44%
Max Drawdown: -12.3%
Sharpe Ratio: 4.8
```
```

- [ ] **Step 3: Создать strategy-test.md**

```markdown
---
name: strategy-test
description: Тест стратегии на live-данных с Bybit WebSocket
user_invocable: true
---

# /strategy-test — Тест стратегии в реальном времени

## Использование
`/strategy-test SYMBOL TIMEFRAME [DURATION_MINUTES]`

Пример: `/strategy-test RIVERUSDT 5 60`

## Шаги

1. Подключиться к Bybit WebSocket (публичный канал `kline.{tf}.{symbol}`)
2. Загрузить последние N свечей для инициализации индикаторов
3. На каждой новой закрытой свече: рассчитать сигнал стратегии
4. Логировать: timestamp, цена, сигнал, confluence score, KNN class
5. По завершении: вывести сводку сигналов
```

- [ ] **Step 4: Создать db-migrate.md**

```markdown
---
name: db-migrate
description: Создание и применение миграций Alembic
user_invocable: true
---

# /db-migrate — Миграции базы данных

## Использование
`/db-migrate [описание]`

Пример: `/db-migrate добавлена таблица trade_signals`

## Шаги

1. Сгенерировать миграцию:
```bash
cd backend && alembic revision --autogenerate -m "описание"
```

2. Проверить сгенерированный файл миграции на корректность

3. Применить миграцию:
```bash
alembic upgrade head
```

4. Проверить статус:
```bash
alembic current
```
```

- [ ] **Step 5: Создать market-check.md**

```markdown
---
name: market-check
description: Проверка текущих рыночных данных по символу
user_invocable: true
---

# /market-check — Проверка рынка

## Использование
`/market-check SYMBOL`

Пример: `/market-check RIVERUSDT`

## Шаги

1. Получить текущий тикер через Bybit REST API
2. Получить последние 100 свечей (5m)
3. Рассчитать ключевые индикаторы: RSI, EMA 26/50/200, ATR, ADX
4. Определить тренд (BULL/BEAR/NEUTRAL)
5. Прогнать KNN классификатор
6. Вывести сводку

## Формат вывода
```
=== RIVERUSDT ===
Цена: 0.04523 USDT
24h: +12.3% | Объём: $1.2M
Тренд: BULL (EMA 26 > 50 > 200)
RSI: 62 | ADX: 28 | ATR: 0.00234
KNN: BULL (confidence: 78%)
Confluence: 4.5/5.5 (STRONG)
Сигнал: LONG
```
```

- [ ] **Step 6: Создать bot-control.md**

```markdown
---
name: bot-control
description: Управление торговыми ботами на VPS
user_invocable: true
---

# /bot-control — Управление ботами

## Использование
- `/bot-control status` — статус всех ботов
- `/bot-control start BOT_ID` — запустить бота
- `/bot-control stop BOT_ID` — остановить бота
- `/bot-control logs BOT_ID` — логи бота

## Шаги для status
```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker-compose exec api python -c 'from app.modules.trading.service import TradingService; print(TradingService.get_all_bots_status())'"
```
```

- [ ] **Step 7: Создать pine-convert.md**

```markdown
---
name: pine-convert
description: Конвертация Pine Script стратегии в Python
user_invocable: true
---

# /pine-convert — Конвертация Pine Script → Python

## Использование
`/pine-convert [путь_к_файлу.pine]`

Пример: `/pine-convert strategis_1.pine`

## Шаги

1. Прочитать Pine Script файл
2. Идентифицировать компоненты: inputs, индикаторы, условия входа/выхода, визуализация
3. Для каждого индикатора: создать Python-функцию (numpy/pandas)
4. Создать класс стратегии, наследующий BaseStrategy
5. Маппинг Pine Script input → Python config (JSONB)
6. Написать тесты: сравнение результатов с TradingView
7. Сохранить в `backend/app/modules/strategy/engines/`

## Маппинг типов
| Pine Script | Python |
|-------------|--------|
| `input.int()` | `int` в config JSONB |
| `input.float()` | `float` в config JSONB |
| `input.bool()` | `bool` в config JSONB |
| `ta.ema()` | `pandas_ta.ema()` или ручной расчёт |
| `ta.rsi()` | `pandas_ta.rsi()` |
| `ta.atr()` | `pandas_ta.atr()` |
| `strategy.entry()` | `Signal(direction=LONG/SHORT)` |
```

- [ ] **Step 8: Создать changelog.md**

```markdown
---
name: changelog
description: Обновление CHANGELOG.md по последним коммитам
user_invocable: true
---

# /changelog — Обновление CHANGELOG.md

## Использование
`/changelog`

## Шаги

1. Получить коммиты с последнего тега (или за последние N коммитов):
```bash
git log --oneline --since="$(git log --format=%aI -1 -- CHANGELOG.md)"
```

2. Классифицировать коммиты:
   - `feat:` → Добавлено
   - `fix:` → Исправлено
   - `refactor:` → Изменено
   - `docs:` → Документация
   - `chore:` → Прочее

3. Добавить записи в секцию `[Unreleased]` файла CHANGELOG.md

4. Сохранить и закоммитить
```

- [ ] **Step 9: Коммит всех скиллов**

```bash
git add .claude/skills/
git commit -m "feat: добавлены 8 скиллов Claude Code

- /deploy — деплой на VPS
- /backtest — запуск бэктеста стратегии
- /strategy-test — тест на live-данных
- /db-migrate — миграции Alembic
- /market-check — проверка рыночных данных
- /bot-control — управление ботами
- /pine-convert — конвертация Pine Script → Python
- /changelog — обновление CHANGELOG.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Claude Code хуки и команды

**Files:**
- Create: `.claude/hooks/pre-commit.sh`
- Create: `.claude/commands/status.md`
- Create: `.claude/commands/logs.md`
- Create: `.claude/commands/health.md`
- Create: `.claude/settings.json`

- [ ] **Step 1: Создать settings.json**

```json
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Glob(*)",
      "Grep(*)",
      "WebFetch(*)",
      "WebSearch(*)",
      "Agent(*)"
    ]
  }
}
```

- [ ] **Step 2: Создать pre-commit.sh**

```bash
#!/bin/bash
# Проверка на секреты в коде перед коммитом

# Паттерны секретов
SECRETS_PATTERNS=(
    "BYBIT_API_KEY=.+"
    "BYBIT_API_SECRET=.+"
    "JWT_SECRET_KEY=.+"
    "ENCRYPTION_KEY=.+"
    "password=.+"
)

for pattern in "${SECRETS_PATTERNS[@]}"; do
    if git diff --cached --diff-filter=ACM | grep -qiE "$pattern"; then
        echo "ОШИБКА: Обнаружен секрет в коммите! Паттерн: $pattern"
        echo "Используй .env файл для секретов."
        exit 1
    fi
done

echo "Проверка секретов пройдена."
```

- [ ] **Step 3: Создать commands/status.md**

```markdown
---
name: status
description: Статус всех сервисов AlgoBond
user_invocable: true
---

Проверь статус всех сервисов AlgoBond:

1. Локально: `docker-compose ps` (если Docker запущен)
2. На VPS: `ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker-compose ps"`
3. Healthcheck API: `ssh jeremy-vps "curl -s http://localhost:8000/health"`
4. Redis: `ssh jeremy-vps "docker-compose exec redis redis-cli ping"`
5. PostgreSQL: `ssh jeremy-vps "docker-compose exec db pg_isready -U algobond"`

Выведи статус в формате таблицы.
```

- [ ] **Step 4: Создать commands/logs.md**

```markdown
---
name: logs
description: Просмотр логов сервисов на VPS
user_invocable: true
---

Покажи логи сервисов AlgoBond с VPS:

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker-compose logs --tail=50 $ARGUMENTS"
```

Если аргумент не указан — покажи логи всех сервисов.
Если указан (api, redis, db, nginx, worker) — покажи логи конкретного сервиса.
```

- [ ] **Step 5: Создать commands/health.md**

```markdown
---
name: health
description: Healthcheck всех endpoints AlgoBond
user_invocable: true
---

Проверь здоровье всех endpoints:

1. API healthcheck: `curl -s https://algo.dev-james.bond/api/health`
2. Frontend: `curl -s -o /dev/null -w "%{http_code}" https://algo.dev-james.bond`
3. WebSocket: проверь подключение к `wss://algo.dev-james.bond/ws/`

Выведи результат с цветовой индикацией: OK (зелёный), FAIL (красный).
```

- [ ] **Step 6: Коммит хуков и команд**

```bash
git add .claude/hooks/ .claude/commands/ .claude/settings.json
git commit -m "feat: добавлены хуки, команды и settings.json

- pre-commit: проверка на секреты в коде
- /status: статус сервисов
- /logs: просмотр логов VPS
- /health: healthcheck endpoints
- settings.json: полные права для всех инструментов

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Backend skeleton (FastAPI)

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: Создать requirements.txt**

```txt
# Веб-фреймворк
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
pydantic-settings==2.7.1

# База данных
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.1

# Redis
redis==5.2.1

# Celery
celery[redis]==5.4.0

# Безопасность
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
cryptography==44.0.0

# HTTP
httpx==0.28.1

# Тестирование
pytest==8.3.4
pytest-asyncio==0.25.0
httpx==0.28.1

# Утилиты
python-multipart==0.0.20
python-dotenv==1.0.1
```

- [ ] **Step 2: Создать config.py**

```python
"""Конфигурация приложения AlgoBond."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Загружаются из переменных окружения."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Приложение
    app_name: str = "AlgoBond"
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # База данных
    database_url: str = "postgresql+asyncpg://algobond:changeme@db:5432/algobond"

    # Redis
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    # JWT
    jwt_secret_key: str = "changeme_jwt_secret_at_least_32_chars"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # Шифрование
    encryption_key: str = "changeme_fernet_key_base64"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Bybit
    bybit_testnet: bool = True


settings = Settings()
```

- [ ] **Step 3: Создать app/__init__.py**

```python
"""AlgoBond — платформа алгоритмической торговли."""
```

- [ ] **Step 4: Создать main.py**

```python
"""Точка входа FastAPI приложения AlgoBond."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(
    title=settings.app_name,
    description="Платформа алгоритмической торговли криптовалютными фьючерсами",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Проверка работоспособности API."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "0.1.0",
    }
```

- [ ] **Step 5: Написать тест для health endpoint**

```python
"""Тесты для healthcheck endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_check():
    """Проверка что /health возвращает статус ok."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "AlgoBond"
    assert "version" in data
```

- [ ] **Step 6: Создать Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Системные зависимости
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Python зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Код приложения
COPY . .

# Порт
EXPOSE 8000

# Запуск
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 7: Запустить тест локально (проверка)**

```bash
cd backend
pip install -r requirements.txt
pytest tests/test_health.py -v
```

Expected: `PASSED`

- [ ] **Step 8: Коммит**

```bash
git add backend/
git commit -m "feat: backend skeleton — FastAPI с healthcheck

- FastAPI приложение с CORS, docs
- Pydantic Settings конфигурация
- Dockerfile для контейнеризации
- Тест healthcheck endpoint

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Frontend skeleton (React + Vite)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Создать package.json**

```json
{
  "name": "algobond-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "axios": "^1.7.9",
    "zustand": "^5.0.2",
    "lucide-react": "^0.468.0",
    "lightweight-charts": "^4.2.2",
    "framer-motion": "^11.15.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.14",
    "@types/react-dom": "^18.3.2",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.16",
    "typescript": "^5.7.2",
    "vite": "^6.0.5"
  }
}
```

- [ ] **Step 2: Создать index.html**

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AlgoBond — Алгоритмическая торговля</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Создать vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 4: Создать tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Создать tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0d0d1a',
          card: '#1a1a2e',
          profit: '#00E676',
          loss: '#FF1744',
          premium: '#FFD700',
          accent: '#4488ff',
          border: '#333333',
        },
      },
      fontFamily: {
        sans: ['Jiro', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 6: Создать postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Создать src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: 'Jiro', system-ui, sans-serif;
  color: #ffffff;
  background-color: #0d0d1a;
}

body {
  margin: 0;
  min-height: 100vh;
}

/* Цифры всегда моноширинным шрифтом */
.font-data {
  font-family: 'JetBrains Mono', monospace;
}

/* Цвета PnL */
.pnl-positive { color: #00E676; }
.pnl-negative { color: #FF1744; }
.pnl-neutral { color: #aaaaaa; }
```

- [ ] **Step 8: Создать src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 9: Создать src/App.tsx**

```tsx
import { TrendingUp } from 'lucide-react'

function App() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-bg">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <TrendingUp className="w-10 h-10 text-brand-profit" />
          <h1 className="text-4xl font-bold text-white">AlgoBond</h1>
        </div>
        <p className="text-brand-accent text-lg">
          Платформа алгоритмической торговли
        </p>
        <p className="text-gray-500 mt-2 font-data">v0.1.0</p>
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 10: Создать Dockerfile**

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY ../nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 11: Коммит**

```bash
git add frontend/
git commit -m "feat: frontend skeleton — React + Vite + TailwindCSS

- React 18 + TypeScript strict mode
- Vite с proxy на backend API
- TailwindCSS с кастомной палитрой AlgoBond
- Шрифты: Jiro (UI) + JetBrains Mono (данные)
- Lucide React иконки
- Заглушка главной страницы

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Docker Compose и Nginx

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.prod.yml`
- Create: `nginx/nginx.conf`
- Create: `nginx/nginx.prod.conf`

- [ ] **Step 1: Создать docker-compose.yml (development)**

```yaml
services:
  api:
    build: ./backend
    container_name: algobond-api
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    container_name: algobond-db
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-algobond}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
      POSTGRES_DB: ${POSTGRES_DB:-algobond}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-algobond}"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: algobond-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  celery-worker:
    build: ./backend
    container_name: algobond-celery
    command: celery -A app.celery_app worker --loglevel=info
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      - redis
      - db
    restart: unless-stopped

  flower:
    build: ./backend
    container_name: algobond-flower
    command: celery -A app.celery_app flower --port=5555
    ports:
      - "5555:5555"
    env_file:
      - .env
    depends_on:
      - redis
      - celery-worker
    restart: unless-stopped

volumes:
  pgdata:
  redis_data:
```

- [ ] **Step 2: Создать docker-compose.prod.yml**

```yaml
services:
  api:
    build: ./backend
    container_name: algobond-api
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always

  frontend:
    build: ./frontend
    container_name: algobond-frontend
    restart: always

  nginx:
    image: nginx:alpine
    container_name: algobond-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.prod.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - api
      - frontend
    restart: always

  db:
    image: postgres:16-alpine
    container_name: algobond-db
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

  redis:
    image: redis:7-alpine
    container_name: algobond-redis
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

  celery-worker:
    build: ./backend
    container_name: algobond-celery
    command: celery -A app.celery_app worker --loglevel=info --concurrency=4
    env_file:
      - .env
    depends_on:
      - redis
      - db
    restart: always

  flower:
    build: ./backend
    container_name: algobond-flower
    command: celery -A app.celery_app flower --port=5555
    ports:
      - "5555:5555"
    env_file:
      - .env
    depends_on:
      - redis
    restart: always

volumes:
  pgdata:
  redis_data:
```

- [ ] **Step 3: Создать nginx/nginx.conf (development)**

```nginx
server {
    listen 80;
    server_name localhost;

    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://api:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://api:8000;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
    }
}
```

- [ ] **Step 4: Создать nginx/nginx.prod.conf**

```nginx
server {
    listen 80;
    server_name algo.dev-james.bond;

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name algo.dev-james.bond;

    # SSL-сертификаты (Let's Encrypt или от хостинга)
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # Безопасность
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    # API
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://api:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Healthcheck
    location /health {
        proxy_pass http://api:8000;
    }

    # Flower (мониторинг Celery)
    location /flower/ {
        proxy_pass http://flower:5555;
        proxy_set_header Host $host;
    }

    # Frontend
    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
    }
}
```

- [ ] **Step 5: Коммит**

```bash
git add docker-compose.yml docker-compose.prod.yml nginx/
git commit -m "feat: Docker Compose + Nginx конфигурация

- docker-compose.yml: dev (API, DB, Redis, Celery, Flower)
- docker-compose.prod.yml: prod (+ Nginx, frontend, SSL)
- nginx.conf: dev reverse proxy
- nginx.prod.conf: prod с SSL, WebSocket, Flower

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Deploy скрипт и подключение к GitHub

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Создать deploy.sh**

```bash
#!/bin/bash
# Скрипт деплоя AlgoBond на VPS
# Использование: ./scripts/deploy.sh

set -e

echo "=== AlgoBond Deploy ==="

# Конфигурация
VPS_HOST="jeremy-vps"
VPS_PATH="/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade"
BRANCH=$(git branch --show-current)

echo "[1/5] Проверка незакоммиченных изменений..."
if [ -n "$(git status --porcelain)" ]; then
    echo "ОШИБКА: Есть незакоммиченные изменения. Закоммить перед деплоем."
    exit 1
fi

echo "[2/5] Push на GitHub (ветка: $BRANCH)..."
git push origin "$BRANCH"

echo "[3/5] Деплой на VPS..."
ssh "$VPS_HOST" "cd $VPS_PATH && git pull origin $BRANCH && docker-compose -f docker-compose.prod.yml up -d --build"

echo "[4/5] Ожидание запуска (10 сек)..."
sleep 10

echo "[5/5] Healthcheck..."
HEALTH=$(ssh "$VPS_HOST" "curl -sf http://localhost:8000/health" || echo '{"status":"error"}')
echo "Ответ: $HEALTH"

if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "=== Деплой успешен! ==="
    echo "URL: https://algo.dev-james.bond"
else
    echo "=== ОШИБКА: Healthcheck не прошёл ==="
    ssh "$VPS_HOST" "cd $VPS_PATH && docker-compose logs --tail=30"
    exit 1
fi
```

- [ ] **Step 2: Сделать скрипт исполняемым**

```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 3: Подключить remote репозиторий**

```bash
git remote add origin git@github.com:Vento741/algo_bond.git
```

- [ ] **Step 4: Перенести документацию из ASO_tw**

```bash
# Скопировать документацию и архитектурную диаграмму
cp -r "c:/Users/Bear Soul/Desktop/Works/Projects/ASO_tw/docs" .
cp "c:/Users/Bear Soul/Desktop/Works/Projects/ASO_tw/strategis_1.pine" .
cp -r "c:/Users/Bear Soul/Desktop/Works/Projects/ASO_tw/config" .
```

- [ ] **Step 5: Коммит и пуш**

```bash
git add scripts/ docs/ strategis_1.pine config/
git commit -m "feat: deploy скрипт + документация проекта

- scripts/deploy.sh: автоматический деплой на VPS
- docs/: спецификация и архитектурная диаграмма
- strategis_1.pine: оригинальная стратегия (Pine Script)
- config/: скриншоты оптимизированных конфигов

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push -u origin main
```

---

## Task 10: Настройка VPS и первый деплой

- [ ] **Step 1: Клонировать репозиторий на VPS**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond && git clone git@github.com:Vento741/algo_bond.git algo_trade"
```

- [ ] **Step 2: Создать .env на VPS**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && cp .env.example .env"
```

Затем отредактировать `.env` на VPS — установить реальные значения для:
- `POSTGRES_PASSWORD` (сгенерировать надёжный)
- `JWT_SECRET_KEY` (сгенерировать: `openssl rand -hex 32`)
- `ENCRYPTION_KEY` (сгенерировать: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- `APP_ENV=production`
- `APP_DEBUG=false`

- [ ] **Step 3: Запустить Docker Compose**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker-compose -f docker-compose.prod.yml up -d --build"
```

- [ ] **Step 4: Проверить healthcheck**

```bash
ssh jeremy-vps "curl -s http://localhost:8000/health"
```

Expected: `{"status":"ok","app":"AlgoBond","version":"0.1.0"}`

- [ ] **Step 5: Проверить доступность по домену**

```bash
curl -s https://algo.dev-james.bond/health
```

Expected: `{"status":"ok","app":"AlgoBond","version":"0.1.0"}`

- [ ] **Step 6: Коммит подтверждения деплоя в CHANGELOG**

Обновить `CHANGELOG.md`:
```markdown
## [0.1.0] - 2026-03-29

### Добавлено
- Инициализация проекта AlgoBond
- 10 агентов Claude Code (model: opus)
- 8 скиллов (/deploy, /backtest, /strategy-test, и др.)
- Backend skeleton (FastAPI + healthcheck)
- Frontend skeleton (React + Vite + TailwindCSS)
- Docker Compose (dev + prod)
- Nginx reverse proxy (dev + prod с SSL)
- Deploy pipeline (git push → VPS → docker-compose)
- Спецификация платформы
- Архитектурная диаграмма
```

```bash
git add CHANGELOG.md
git commit -m "docs: обновлён CHANGELOG — v0.1.0 задеплоен

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```
