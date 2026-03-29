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
