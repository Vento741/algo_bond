# Changelog

Все заметные изменения в проекте AlgoBond документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## [0.8.0] — 2026-03-29

### Добавлено

#### Фаза 2: Стратегия
- Портирование Lorentzian KNN из Pine Script (895 строк) → Python (numpy)
- 12 индикаторов: RSI, EMA, SMA, HMA, WMA, ADX/DMI, ATR, WaveTrend, CCI, BB, VWAP, CVD
- SMC индикаторы: Order Blocks, FVG, Liquidity Sweeps, BOS, Demand/Supply Zones
- KNN классификатор: 4 фичи, z-score нормализация, Lorentzian distance, inverse distance weighting
- Confluence scoring (max 5.5): MTF + Ribbon + Order Flow + SMC + ADX + KNN boost
- BaseStrategy ABC + LorentzianKNNStrategy + engine registry (`get_engine()`)
- Модуль strategy: models, schemas, service, router (9 API endpoints)
- Seed скрипт: Lorentzian KNN с полным default_config из TradingView

#### Фаза 3: Торговый бот + Bybit
- BybitClient: обёртка pybit V5 API (klines, ticker, orders, positions, balance, SL/TP/trailing)
- BybitWebSocket: public (kline, ticker) + private (order, position, execution) стримы
- Market module: OHLCVCandle модель, MarketService с Redis-кэшем, 4 API endpoints
- Trading module: 4 таблицы (bots, orders, positions, trade_signals), 8 API endpoints
- Bot worker: `run_bot_cycle()` — полный цикл: fetch → strategy → signal → Bybit order → DB
- Celery task: `trading.run_bot_cycle` с persistent event loop

#### Фаза 4: Бэктест
- Backtest engine: симуляция с SL/TP/trailing stop, equity curve (downsample до 500 точек)
- Метрики: win_rate, profit_factor, max_drawdown, sharpe_ratio, total_pnl, trades_log
- 2 таблицы (backtest_runs, backtest_results), 4 API endpoints

#### Фаза 5: Frontend MVP
- Landing page: gradient hero, +710% стат, gold CTA, glass-morphism карточки
- Auth: login/register с JWT, Zustand auth store, ProtectedRoute
- Dashboard: quick stats, strategy list, quick actions
- Strategies: список из API + деталь с default_config
- Axios API client с JWT interceptors (auto refresh)

#### Фазы 6-8: Графики + Real-time + Polish
- TradingView Lightweight Charts: candlestick + volume, dark AlgoBond theme
- Chart page: interval selector (1m-1D), fullscreen, symbol dropdown
- WebSocket hooks: useMarketStream (auto-reconnect), useTradingStream
- Backend WebSocket endpoints: /ws/market/{symbol}, /ws/trading (JWT auth)
- ConnectionManager: fan-out broadcast по каналам
- Bots page: create/start/stop, status badges
- Backtest page: config form, 6 metric cards, equity curve chart, trades table
- UI компоненты: badge, select, dialog, table, tabs, toast, skeleton
- Keyboard shortcuts: Ctrl+D (dashboard), Ctrl+B (backtest), Ctrl+T (chart)
- Mobile responsive sidebar с hamburger menu

### Исправлено (аудит)
- Rate limiting (slowapi): 5/min login, 3/min register
- CORS: ограничен до конкретных methods/headers
- Bybit API вызовы обёрнуты в `asyncio.to_thread()` (не блокируют event loop)
- Убран auto-commit из `get_db()`, явный commit в сервисах
- Пагинация (limit/offset) на всех list-эндпоинтах
- FK индексы на user_id, bot_id, strategy_config_id
- Pydantic schemas: типизированные NotificationChannels, UIPreferences
- Balance endpoint использует ключи пользователя (exchange_account_id)
- Celery task: persistent event loop вместо asyncio.run()
- Alembic env.py: импорт всех моделей (auth, billing, strategy, trading, backtest)
- Flower: basic auth + localhost-only binding
- Dockerfile: убран --reload, app_debug default False

### Инфраструктура
- Frontend + nginx Docker контейнеры в docker-compose
- FastPanel: обратный прокси на 127.0.0.1:8100
- Let's Encrypt SSL-сертификат для algo.dev-james.bond
- HTTPS + HTTP2 включены, HTTP → HTTPS redirect

## [0.1.0] — 2026-03-29

### Добавлено

#### Фаза 0: Фундамент
- Инициализация проекта: Git репо, Docker Compose, Nginx
- Frontend skeleton (React + Vite + TailwindCSS)
- Backend skeleton (FastAPI healthcheck)
- 10 агентов, 8 скиллов, хуки, команды Claude Code
- Деплой на VPS (algo.dev-james.bond)
- Спецификация платформы
- Архитектурная диаграмма

#### Фаза 1: Backend Core
- Модуль auth: User, ExchangeAccount, UserSettings (3 таблицы), 10 API endpoints
- JWT access + refresh tokens, bcrypt, Fernet encryption
- Модуль billing: Plan, Subscription (2 таблицы), 4 API endpoints
- Alembic async setup + первая миграция
- Seed: 4 тарифных плана (Free/Basic/Pro/VIP)
- 24 теста passing
