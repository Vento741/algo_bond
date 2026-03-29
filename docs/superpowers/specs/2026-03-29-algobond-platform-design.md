# AlgoBond — Спецификация платформы алгоритмической торговли

> Дата: 2026-03-29
> Автор: Денис + Claude Code
> Статус: Утверждено

---

## 1. Обзор проекта

### Что строим

Веб-платформа алгоритмической торговли криптовалютными фьючерсами на Bybit.
Пользователи получают: графики, выбор стратегий, настройку конфигов, бэктестинг,
автоматическую торговлю ботами, мониторинг позиций в реальном времени.

### Происхождение стратегии

Базовая стратегия — **Machine Learning: Lorentzian KNN Classifier** (BertTradeTech),
Pine Script v6, ~895 строк. Протестирована на TradingView для токена RIVERUSDT
(Bybit фьючерсы) с 1 февраля по 29 марта 2026 — результат **+710.44%**.

Оптимизированные конфиги зафиксированы в `config/*.png` (10 скриншотов).

### Бизнес-модель

SaaS-подписка: бесплатный демо-режим + платные тарифы (базовый/про/VIP).
Ограничения по тарифу: количество ботов, стратегий, бэктестов в день.

---

## 2. Решения из брейнсторма

| Вопрос | Решение |
|--------|---------|
| Стратегия запуска | Параллельно: бот торгует на VPS + строим платформу |
| Стек | Python fullstack: FastAPI (бэк) + React SPA с Vite (фронт) |
| БД | PostgreSQL + Redis |
| Графики | TradingView Lightweight Charts + свой движок индикаторов |
| Монетизация | SaaS-подписка (free / basic / pro / vip) |
| Деплой | Docker Compose на VPS (код на Windows → git → VPS → docker) |
| Авторизация | JWT + email/пароль (подтверждение email — в TODO, последняя очередь) |
| Bybit интеграция | API-ключи пользователя (зашифрованные в БД) |
| Архитектура | Модульный монолит (FastAPI + Celery workers + asyncio workers) |
| Автономность агентов | Максимальная: агенты сами мониторят, тестируют, фиксят, оптимизируют |

---

## 3. Архитектура

> Диаграмма: `docs/architecture/algobond-architecture.png`

### Слои системы

```
Browser (React SPA + TradingView Lightweight Charts)
  │
  ▼ HTTP / WebSocket
Nginx (reverse proxy + SSL, Let's Encrypt)
  │
  ▼
FastAPI — Модульный монолит
  ├── modules/auth         — JWT, users, roles
  ├── modules/trading      — Bybit API, ордера, позиции
  ├── modules/strategy     — KNN, конфиги, движки стратегий
  ├── modules/backtest     — исторические данные, симуляция
  ├── modules/market       — WebSocket endpoint, свечи, тикеры
  ├── modules/billing      — подписки, тарифы, лимиты
  └── modules/notifications — сигналы, алерты, push
  │
  ├──▼ Celery Workers (дискретные задачи)
  │   ├── backtest_worker  — симуляция стратегий
  │   ├── notification_worker — отправка уведомлений
  │   └── data_worker      — загрузка исторических OHLCV
  │
  └──▼ Asyncio Workers (persistent процессы, отдельные контейнеры)
      ├── market_stream    — Bybit WebSocket → Redis pub/sub
      ├── trading_bot      — мониторинг сигналов → исполнение ордеров
      └── order_monitor    — отслеживание открытых позиций
  │
  ▼
Data Layer
  ├── PostgreSQL — users, strategies, trades, configs, subscriptions
  ├── Redis      — кэш свечей, сессии, очередь Celery, pub/sub
  └── Bybit API  — REST + WebSocket (фьючерсы, USDT-M)
```

### Deploy Pipeline

```
Windows (код) → git push → GitHub (algo_bond) → ssh → VPS 5.101.181.11 → docker-compose up
```

- Репозиторий: `git@github.com:Vento741/algo_bond.git`
- SSH-ключ: `C:\Users\Bear Soul\.ssh\github_vento741`
- VPS: `5.101.181.11` (ssh: `jeremy-vps`, user: `root`)
- Путь на сервере: `/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade`
- Домен: `algo.dev-james.bond`

---

## 4. Структура проекта

```
algo_bond/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── CLAUDE.md
├── CHANGELOG.md
│
├── docs/
│   ├── architecture/
│   │   └── algobond-architecture.png
│   └── superpowers/specs/
│       └── 2026-03-29-algobond-platform-design.md  # этот файл
│
├── .claude/
│   ├── agents/                    # 10 специализированных агентов
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
│   ├── skills/                    # 8 скиллов
│   │   ├── deploy.md
│   │   ├── backtest.md
│   │   ├── strategy-test.md
│   │   ├── db-migrate.md
│   │   ├── market-check.md
│   │   ├── bot-control.md
│   │   ├── pine-convert.md
│   │   └── changelog.md
│   ├── hooks/
│   │   ├── pre-commit.sh
│   │   ├── post-push.sh
│   │   └── on-error.sh
│   ├── commands/
│   │   ├── status.md
│   │   ├── logs.md
│   │   └── health.md
│   ├── settings.json
│   └── CLAUDE.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── celery_app.py
│   │   │
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── router.py
│   │   │   │   ├── models.py
│   │   │   │   ├── schemas.py
│   │   │   │   ├── service.py
│   │   │   │   └── dependencies.py
│   │   │   ├── trading/
│   │   │   │   ├── router.py
│   │   │   │   ├── models.py
│   │   │   │   ├── schemas.py
│   │   │   │   ├── service.py
│   │   │   │   ├── bybit_client.py
│   │   │   │   └── tasks.py
│   │   │   ├── strategy/
│   │   │   │   ├── router.py
│   │   │   │   ├── models.py
│   │   │   │   ├── schemas.py
│   │   │   │   ├── service.py
│   │   │   │   └── engines/
│   │   │   │       ├── base.py
│   │   │   │       └── lorentzian_knn.py
│   │   │   ├── backtest/
│   │   │   │   ├── router.py
│   │   │   │   ├── models.py
│   │   │   │   ├── schemas.py
│   │   │   │   ├── service.py
│   │   │   │   └── tasks.py
│   │   │   ├── market/
│   │   │   │   ├── router.py
│   │   │   │   ├── websocket.py
│   │   │   │   ├── service.py
│   │   │   │   └── tasks.py
│   │   │   ├── billing/
│   │   │   │   ├── router.py
│   │   │   │   ├── models.py
│   │   │   │   ├── schemas.py
│   │   │   │   └── service.py
│   │   │   └── notifications/
│   │   │       ├── router.py
│   │   │       ├── models.py
│   │   │       ├── service.py
│   │   │       └── tasks.py
│   │   │
│   │   ├── workers/               # Long-running asyncio процессы
│   │   │   ├── market_stream.py
│   │   │   ├── trading_bot.py
│   │   │   └── order_monitor.py
│   │   │
│   │   └── core/
│   │       ├── security.py
│   │       ├── exceptions.py
│   │       └── middleware.py
│   │
│   └── tests/
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── ForgotPassword.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Chart.tsx
│   │   │   ├── Backtest.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── chart/
│   │   │   │   ├── TradingChart.tsx
│   │   │   │   └── indicators/
│   │   │   ├── ui/
│   │   │   └── layout/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── store/
│   └── public/
│
├── nginx/
│   └── nginx.conf
│
└── scripts/
    ├── deploy.sh
    ├── backup_db.sh
    └── seed_strategies.py
```

---

## 5. Модели базы данных

### 5.1 modules/auth

#### users

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| email | VARCHAR(255) UNIQUE | |
| hashed_password | VARCHAR(255) | bcrypt |
| username | VARCHAR(100) | |
| is_active | BOOLEAN | |
| is_verified | BOOLEAN | TODO: подтверждение email (последняя очередь) |
| role | ENUM(user, admin) | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### exchange_accounts

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users | |
| exchange | ENUM(bybit) | Расширяемо |
| label | VARCHAR(100) | Название аккаунта |
| api_key_encrypted | TEXT | AES-256 шифрование |
| api_secret_encrypted | TEXT | AES-256 шифрование |
| is_testnet | BOOLEAN | Тестнет или реальный |
| is_active | BOOLEAN | |
| created_at | TIMESTAMP | |

#### user_settings

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users (1:1) | |
| timezone | VARCHAR(50) | default 'Europe/Moscow' |
| notification_channels | JSONB | {"email": true, "websocket": true} |
| default_symbol | VARCHAR(30) | default 'RIVERUSDT' |
| default_timeframe | VARCHAR(10) | default '5' |
| ui_preferences | JSONB | {"theme": "dark", "chart_style": "candles"} |

### 5.2 modules/billing

#### plans

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| name | VARCHAR(50) | Free / Basic / Pro / VIP |
| slug | VARCHAR(50) UNIQUE | |
| price_monthly | DECIMAL(10,2) | |
| max_bots | INT | |
| max_strategies | INT | |
| max_backtests_per_day | INT | |
| features | JSONB | Дополнительные фичи тарифа |

#### subscriptions

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users | |
| plan_id | FK → plans | |
| status | ENUM(active, expired, cancelled) | |
| started_at | TIMESTAMP | |
| expires_at | TIMESTAMP | |

### 5.3 modules/strategy

#### strategies

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| name | VARCHAR(200) | |
| slug | VARCHAR(200) UNIQUE | |
| engine_type | VARCHAR(50) | 'lorentzian_knn', 'custom', etc. |
| description | TEXT | |
| is_public | BOOLEAN | |
| author_id | FK → users | |
| default_config | JSONB | Дефолтные параметры стратегии |
| version | VARCHAR(20) | |
| created_at | TIMESTAMP | |

#### strategy_configs

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users | |
| strategy_id | FK → strategies | |
| name | VARCHAR(200) | Название конфига пользователя |
| symbol | VARCHAR(30) | 'RIVERUSDT' |
| timeframe | VARCHAR(10) | '5', '15', '60', '240', 'D' |
| config | JSONB | Все параметры стратегии |

Пример `config` JSONB для Lorentzian KNN (из скриншотов):
```json
{
  "time_filter": {"use": false, "session": "01:30-23:45"},
  "trend": {"ema_fast": 26, "ema_slow": 50, "ema_filter": 200},
  "mtf": {"use": false, "timeframe": "1", "ema_fast": 25, "ema_slow": 50},
  "ribbon": {"use": true, "type": "EMA", "mas": [9,14,21,35,55,89,144,233], "threshold": 4},
  "order_flow": {"use": true, "show_vwap": true, "vwap_stds": [1,2,3], "cvd_period": 20, "cvd_threshold": 0.7, "show_vp_poc": true, "vp_bins": 20},
  "smc": {"use": true, "order_blocks": true, "fvg": true, "liquidity": true, "bos": true, "demand_supply": true, "ob_lookback": 10, "fvg_min_size": 0.5, "liquidity_lookback": 20, "bos_pivot": 5, "ds_impulse_mult": 1.5, "ds_max_zones": 8},
  "volatility": {"use": true, "bb_period": 20, "bb_mult": 2, "atr_percentile_period": 100, "expansion": 1.5, "contraction": 0.7},
  "breakout": {"period": 15, "atr_mult": 1.5},
  "mean_reversion": {"bb_period": 20, "bb_std": 2, "rsi_period": 14, "rsi_ob": 70, "rsi_os": 30},
  "risk": {"atr_period": 14, "stop_atr_mult": 2, "tp_atr_mult": 30, "use_trailing": true, "trailing_atr_mult": 10},
  "filters": {"adx_period": 15, "adx_threshold": 10, "volume_mult": 1},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
  "kernel": {"show": true, "ema_length": 34, "atr_period": 20},
  "display": {"dashboard": true, "sr_lines": true, "tp_sl_lines": true, "sr_lookback": 50, "sr_style": "Dotted", "tp_sl_style": "Solid", "gradient_candles": true},
  "backtest": {"initial_capital": 100, "currency": "USDT", "order_size": 75, "order_size_type": "percent_equity", "pyramiding": 0, "commission": 0.05, "slippage": 0, "margin_long": 100, "margin_short": 100}
}
```

### 5.4 modules/trading

#### bots

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users | |
| strategy_config_id | FK → strategy_configs | |
| exchange_account_id | FK → exchange_accounts | |
| status | ENUM(running, stopped, error) | |
| mode | ENUM(live, demo) | |
| total_pnl | DECIMAL | Суммарный PnL |
| total_trades | INT | |
| win_rate | DECIMAL | |
| started_at | TIMESTAMP | |
| stopped_at | TIMESTAMP NULL | |

#### orders

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| bot_id | FK → bots | |
| exchange_order_id | VARCHAR | ID ордера на Bybit |
| symbol | VARCHAR(30) | |
| side | ENUM(buy, sell) | |
| type | ENUM(market, limit) | |
| quantity | DECIMAL | |
| price | DECIMAL | |
| filled_price | DECIMAL NULL | Фактическая цена исполнения |
| status | ENUM(open, filled, cancelled, error) | |
| filled_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |

#### positions

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| bot_id | FK → bots | |
| symbol | VARCHAR(30) | |
| side | ENUM(long, short) | |
| entry_price | DECIMAL | |
| quantity | DECIMAL | |
| stop_loss | DECIMAL | |
| take_profit | DECIMAL | |
| trailing_stop | DECIMAL NULL | |
| unrealized_pnl | DECIMAL | |
| realized_pnl | DECIMAL NULL | |
| status | ENUM(open, closed) | |
| opened_at | TIMESTAMP | |
| closed_at | TIMESTAMP NULL | |

#### trade_signals

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| bot_id | FK → bots | |
| strategy_config_id | FK → strategy_configs | |
| symbol | VARCHAR(30) | |
| direction | ENUM(long, short) | |
| signal_strength | DECIMAL | Confluence score (0-5.5) |
| knn_class | VARCHAR(10) | BULL / BEAR / NEUTRAL |
| knn_confidence | DECIMAL | 0-100% |
| indicators_snapshot | JSONB | RSI, WaveTrend, CCI, ADX и др. |
| was_executed | BOOLEAN | Превратился ли в ордер |
| created_at | TIMESTAMP | |

### 5.5 modules/backtest

#### backtest_runs

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users | |
| strategy_config_id | FK → strategy_configs | |
| symbol | VARCHAR(30) | |
| timeframe | VARCHAR(10) | |
| start_date | TIMESTAMP | |
| end_date | TIMESTAMP | |
| initial_capital | DECIMAL | |
| status | ENUM(pending, running, completed, failed) | |
| progress | INT | 0-100 |
| created_at | TIMESTAMP | |

#### backtest_results

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| run_id | FK → backtest_runs (1:1) | |
| total_trades | INT | |
| winning_trades | INT | |
| losing_trades | INT | |
| win_rate | DECIMAL | |
| profit_factor | DECIMAL | |
| total_pnl | DECIMAL | |
| total_pnl_pct | DECIMAL | |
| max_drawdown | DECIMAL | |
| sharpe_ratio | DECIMAL | |
| avg_trade_duration | INTERVAL | |
| equity_curve | JSONB | Массив точек equity |
| trades_log | JSONB | Массив всех сделок |

### 5.6 modules/market

#### ohlcv_candles (партиционирование по месяцам)

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | |
| symbol | VARCHAR(30) | |
| timeframe | VARCHAR(10) | |
| open_time | TIMESTAMP | |
| open | DECIMAL | |
| high | DECIMAL | |
| low | DECIMAL | |
| close | DECIMAL | |
| volume | DECIMAL | |

INDEX: (symbol, timeframe, open_time)

#### demo_balances

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users | |
| balance | DECIMAL | default 10000 |
| initial_balance | DECIMAL | default 10000 |
| currency | VARCHAR(10) | default 'USDT' |
| updated_at | TIMESTAMP | |

### 5.7 modules/notifications

#### notifications

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | FK → users | |
| type | ENUM(signal, order_filled, stop_hit, system) | |
| title | VARCHAR(200) | |
| message | TEXT | |
| data | JSONB | Доп. данные (ордер, позиция, etc.) |
| is_read | BOOLEAN | |
| created_at | TIMESTAMP | |

### 5.8 Redis-кэш

| Ключ | Описание |
|------|----------|
| `market:ticker:{symbol}` | Последняя цена |
| `market:candles:{symbol}:{tf}` | Последние N свечей |
| `market:orderbook:{symbol}` | Стакан (top 20) |
| `bot:status:{bot_id}` | Статус бота (JSON) |
| `session:{token}` | JWT blacklist |
| `signals:{user_id}` | Pub/sub канал сигналов |

### Связи (FK)

```
users 1:N exchange_accounts
users 1:1 user_settings
users 1:1 subscriptions
users 1:N strategy_configs
users 1:N bots
users 1:N backtest_runs
users 1:N notifications
users 1:N demo_balances
strategies 1:N strategy_configs
strategy_configs 1:N bots
strategy_configs 1:N backtest_runs
strategy_configs 1:N trade_signals
exchange_accounts 1:N bots
bots 1:N orders
bots 1:N positions
bots 1:N trade_signals
backtest_runs 1:1 backtest_results
plans 1:N subscriptions
```

**Итого: 16 таблиц PostgreSQL + 6 ключей Redis**

---

## 6. Система агентов Claude Code

### 6.1 Агенты (.claude/agents/)

#### orchestrator.md — Оркестратор
- Координирует всех агентов, декомпозирует задачи
- Знает архитектуру проекта, текущую фазу, приоритеты
- Следит за CHANGELOG.md, обновляет статус задач
- Принимает решения о делегировании
- Модель: opus
- Все права разрешены

#### backend-dev.md — Backend-разработчик
- FastAPI, SQLAlchemy, Alembic, Celery, Pydantic
- Модульная архитектура: каждый модуль изолирован
- Type hints обязательны, docstrings на русском
- Модель: opus
- Все права разрешены

#### frontend-dev.md — Frontend-разработчик
- React 18+, TypeScript, Vite, TailwindCSS, Shadcn/UI
- Дизайн-правила:
  - Лендинг + Auth: "luxury fintech" (градиенты, blur, анимации, hero с графиком)
  - ЛК + Дашборды: "trading terminal" (плотная информация, тёмная тема, минимум декора)
  - Иконки: только Lucide Icons / Phosphor Icons (НЕ системные эмодзи)
  - Палитра: #0d0d1a, #1a1a2e, #00E676 (прибыль), #FF1744 (убыток), #FFD700 (premium)
  - Шрифты: Jiro (UI), JetBrains Mono (цифры/данные)
  - Micro-animations: count-up PnL, пульсирующие live-точки, skeleton-загрузки
  - Desktop-first: 1920 → 1440 → 768 → 375
  - Числовое форматирование: крипто-точность, разделители тысяч
  - PnL-градиент: интенсивность цвета пропорциональна проценту
  - Toast-уведомления: slide-in + звуковой тик
  - Hotkeys: Ctrl+D (дашборд), Ctrl+B (бэктест), Space (пауза/старт бота)
  - Onboarding tour: 3-5 шагов для новых пользователей
  - Dark theme по умолчанию, toggle light
  - Real-time индикатор WebSocket в хедере
- Модель: opus
- Все права разрешены

#### researcher.md — Ресёрчер
- Поиск решений на GitHub, npm, PyPI, Stack Overflow
- Глубокий анализ: звёзды, активность, лицензия, качество кода
- Сравнение альтернатив, рекомендация лучшего варианта
- Адаптация найденного кода под архитектуру проекта
- Модель: opus
- Все права разрешены

#### trader.md — Трейдер-агент
- Bybit API (pybit), USDT-M фьючерсы
- Знание: маржа, плечо, ликвидации, funding rate, mark price
- Управление ордерами: market, limit, conditional, trailing stop
- Risk management: позиция не больше X% депозита
- Мониторинг позиций, автоматическое закрытие по SL/TP
- Модель: opus
- Все права разрешены

#### algorithm-engineer.md — Алгоритмист
- Портирование Pine Script → Python (numpy, pandas, ta-lib)
- Lorentzian KNN: 4D feature space, inverse distance weighting
- Индикаторы: RSI, WaveTrend, CCI, ADX, EMA, HMA, BB, VWAP, ATR
- SMC: Order Blocks, FVG, Liquidity Sweeps, BOS/CHoCH, Demand/Supply
- Kernel Envelope: EMA regression + ATR bands
- Оптимизация параметров, grid search
- Модель: opus
- Все права разрешены

#### debugger.md — Дебаггер
- Диагностика ошибок: трейсы, логи, профилирование
- Docker logs, Redis MONITOR, pg_stat_activity
- Анализ performance bottlenecks
- Воспроизведение и фикс багов
- Модель: opus
- Все права разрешены

#### code-reviewer.md — Ревьюер/Рефакторер
- Code review: PEP8, SOLID, DRY, type hints, security
- Проверка: SQL injection, XSS, secrets в коде, race conditions
- Рефакторинг: выделение абстракций, упрощение, оптимизация
- Модель: opus
- Все права разрешены

#### consultant.md — Консультант
- Архитектурные решения, trade-offs
- Знание домена: алготрейдинг, SaaS, финтех
- Масштабирование: когда переходить на микросервисы
- Модель: opus
- Все права разрешены

#### market-analyst.md — Рыночный аналитик
- Bybit WebSocket API: подписка на стримы
- Проверка торговых гипотез на live-данных
- Анализ: свечные паттерны, объёмы, корреляции
- Формирование отчётов по результатам стратегий
- Модель: opus
- Все права разрешены

### 6.2 Скиллы (.claude/skills/)

| Файл | Команда | Описание |
|------|---------|----------|
| deploy.md | `/deploy [env]` | SSH на VPS, git pull, docker-compose build/up, healthcheck |
| backtest.md | `/backtest SYMBOL TF START END` | Запуск бэктеста через API или локально |
| strategy-test.md | `/strategy-test` | Подписка на WS, прогон стратегии на live-данных |
| db-migrate.md | `/db-migrate [message]` | Alembic revision --autogenerate + upgrade |
| market-check.md | `/market-check SYMBOL` | Текущая цена, объём, тренд, сигналы |
| bot-control.md | `/bot-control [start|stop|status]` | Управление ботами на VPS |
| pine-convert.md | `/pine-convert [file]` | Pine Script → Python класс стратегии |
| changelog.md | `/changelog` | Генерация записи CHANGELOG по последним коммитам |

### 6.3 Хуки (.claude/hooks/)

- **pre-commit.sh** — ruff lint + format, проверка .env/секретов в коде, type check
- **post-push.sh** — уведомление, опциональный триггер деплоя
- **on-error.sh** — логирование ошибок агентов

### 6.4 Команды (.claude/commands/)

- `/status` — статус всех сервисов (API, Redis, PG, bots, workers)
- `/logs` — docker logs с VPS (последние N строк)
- `/health` — healthcheck всех endpoints

---

## 7. Дизайн-система фронтенда

### Лендинг + Auth (luxury fintech)
- Градиенты: тёмные, subtle
- Стекло-морфизм: backdrop-blur на карточках
- Hero-секция: live-график или анимированный фон (particles/three.js)
- CTA кнопки: золотой акцент #FFD700
- Анимации: fade-in при скролле, parallax

### ЛК + Дашборды (trading terminal)
- Плотная информация, минимум whitespace
- Тёмная тема: #0d0d1a фон, #1a1a2e карточки
- Зелёный #00E676 (прибыль), красный #FF1744 (убыток)
- Sidebar навигация (collapsible)
- Графики: TradingView Lightweight Charts + кастомные индикаторы

### Общее
- Шрифты: Jiro (UI), JetBrains Mono (цифры)
- Иконки: Lucide Icons (основные), Phosphor Icons (акценты)
- Компоненты: Shadcn/UI (TailwindCSS)
- Состояние: Zustand
- API-клиент: axios с interceptors (JWT refresh)

---

## 8. Roadmap реализации

### Фаза 0: Фундамент
- Инициализация git-репозитория
- CLAUDE.md, агенты, скиллы, хуки
- Docker Compose skeleton (FastAPI + React + PG + Redis + Nginx)
- CI/CD: git push → VPS deploy script
- Результат: пустой проект деплоится на algo.dev-james.bond

### Фаза 1: Backend Core
- FastAPI каркас с модульной структурой
- Модуль auth: JWT, регистрация, логин, роли
- Модуль billing: планы, подписки
- PostgreSQL + Alembic миграции
- Redis подключение
- Результат: API авторизации работает

### Фаза 2: Стратегия
- Портирование Lorentzian KNN из Pine Script → Python
- Модуль strategy: CRUD стратегий, конфигов
- Обновление конфигов из скриншотов (config/*.png)
- Движок стратегии: base.py + lorentzian_knn.py
- Результат: стратегия запускается на исторических данных

### Фаза 3: Торговый бот
- Модуль trading: bybit_client.py (pybit)
- Workers: market_stream, trading_bot, order_monitor
- Celery tasks для ордеров
- Режимы: live + demo (testnet)
- Результат: бот торгует RIVERUSDT на Bybit

### Фаза 4: Бэктест
- Модуль backtest: загрузка OHLCV, симуляция
- backtest_worker (Celery)
- Метрики: win rate, profit factor, drawdown, Sharpe, equity curve
- Результат: бэктест воспроизводит +710% из TradingView

### Фаза 5: Frontend MVP
- React SPA: лендинг, auth, ЛК, дашборд
- Дизайн-система: Shadcn/UI + TailwindCSS
- Zustand состояние, axios API-клиент
- Результат: веб-интерфейс на algo.dev-james.bond

### Фаза 6: Графики
- TradingView Lightweight Charts интеграция
- Кастомные индикаторы: KNN confidence, Kernel Envelope, SMC зоны, MA Ribbon
- Результат: полноценный торговый график в браузере

### Фаза 7: Real-time
- WebSocket: live-свечи, обновление позиций
- Уведомления: toast + звук при исполнении ордеров
- Статус ботов в реальном времени
- Результат: всё обновляется live

### Фаза 8: Polish
- Подписки/биллинг UI
- Onboarding tour
- Hotkeys
- Мобильная адаптация
- Подтверждение email (TODO, последняя очередь)
- Результат: продукт готов к первым пользователям

---

## 9. Ключевые зависимости (Python)

### Backend
- fastapi, uvicorn, pydantic, pydantic-settings
- sqlalchemy, alembic, asyncpg
- celery, redis, flower
- pybit (Bybit SDK)
- cryptography (шифрование API-ключей)
- python-jose (JWT), passlib[bcrypt]
- numpy, pandas, ta-lib (индикаторы)
- httpx, websockets

### Frontend
- react, react-router-dom, typescript, vite
- lightweight-charts (TradingView)
- tailwindcss, shadcn/ui
- zustand (состояние)
- axios
- lucide-react (иконки)
- framer-motion (анимации)

---

## 10. Референсные проекты (из исследования)

Для адаптации готовых решений в Celery Workers:

| Компонент | Источник | Что берём |
|-----------|----------|-----------|
| Celery config + routing | [Stock Analysis Engine](https://github.com/AlgoTraders/stock-analysis-engine) | celery_config, именованные очереди, retry |
| Trading Worker | [CATEd](https://github.com/OnGridSystems/CATEd) | 4 worker-а с приоритетами, CCXT, WS |
| ORM-модели | [django-crypto-trading-bot](https://github.com/linuxluigi/django-crypto-trading-bot) | Account, Market, Order, Bot, OHLCV |
| WebSocket фиды | [Cryptofeed](https://github.com/bmoscon/cryptofeed) | 40+ бирж, Bybit, Redis Streams |
| Backtest Worker | Stock Analysis Engine | Распределённый бэктест |
| Архитектура | [AAT](https://github.com/AsyncAlgoTrading/aat) | 4 engines: Trading/Risk/Execution/Backtest |
