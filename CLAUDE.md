# AlgoBond — Платформа алгоритмической торговли

Веб-платформа алготрейдинга криптофьючерсами на Bybit. Стратегия: Lorentzian KNN (+710% RIVERUSDT).
Модульный монолит: FastAPI + Celery + React SPA + PostgreSQL + Redis + Docker.

## Команды

```bash
# Тесты
cd backend && pytest tests/ -v

# Линтинг
cd backend && python -c "from app.main import app; print('OK')"

# Миграции
docker compose exec api alembic revision --autogenerate -m "описание"
docker compose exec api alembic upgrade head

# Деплой
git push origin main
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose up -d --build api"
ssh jeremy-vps "curl -sf http://localhost:8100/health"
```

## Правила кода

### Backend (Python 3.12)
- Type hints обязательны на всех функциях
- Docstrings и комментарии на русском
- Каждый модуль изолирован: `modules/{name}/` → models.py, schemas.py, service.py, router.py
- Модули общаются через service layer, НЕ через прямой импорт моделей
- Pydantic v2: `ConfigDict(from_attributes=True)`, `model_validate` (НЕ `parse_obj`, НЕ `from_orm`)
- SQLAlchemy 2.0: `Mapped[]`, `mapped_column()` (НЕ `Column()`, НЕ `declarative_base()`)
- Async для endpoints и DB-операций (asyncpg)
- UUID первичные ключи, `DateTime(timezone=True)`
- Секреты только из `app.config.settings`, API-ключи бирж шифруются Fernet

### Frontend (React 18 + TypeScript)
- TypeScript strict: никаких `any`, `@ts-ignore`
- Shadcn/UI (НЕ Material UI, НЕ Ant Design, НЕ Bootstrap)
- Zustand (НЕ Redux, НЕ MobX)
- Иконки: ТОЛЬКО `lucide-react`
- Шрифт UI: Tektur | Шрифт цифр: JetBrains Mono
- Axios с JWT interceptors (auto refresh)

### Дизайн
- Лендинг + Auth: luxury fintech (градиенты, blur, gold CTA #FFD700)
- ЛК + Дашборды: trading terminal (плотная информация, тёмная тема)
- Палитра: #0d0d1a (фон), #1a1a2e (карточки), #00E676 (profit), #FF1744 (loss), #FFD700 (premium)
- Desktop-first: 1920 → 1440 → 768 → 375, dark default

### Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- Ветки: main (prod), feature/* (фичи)

## Deploy

- **VPS:** 5.101.181.11 (ssh: `jeremy-vps`)
- **Путь:** `/var/www/dev_james_usr/data/www/dev-james.bond/algo_trade`
- **API порт:** 8100 снаружи (8000 внутри Docker) — порт 8000 занят другим сервисом
- **Домен:** algo.dev-james.bond

## Текущее состояние (v0.9.0)

- **148 тестов**, 14 таблиц PostgreSQL, ~58 API endpoints
- **6 модулей**: auth, billing, strategy, market, trading, backtest
- **9 страниц**: Landing, Login, Register, Dashboard, Strategies, StrategyDetail, Chart, Bots, Backtest
- **8 Docker контейнеров**: api, frontend, nginx, db, redis, celery, celery-beat, listener
- **Live**: https://algo.dev-james.bond/

## Операционные команды

```bash
# Сверка P&L бота с Bybit (reconciliation)
# Сравнивает realized_pnl в БД с closed PnL на бирже, исправляет расхождения
POST /api/trading/bots/{bot_id}/reconcile
# Матчинг по entry_price (округление до 3 знаков из-за float64 precision в БД)
# Возвращает: positions_checked, bybit_records, corrections[], new_total_pnl
```

## Gotchas

- `passlib` + `bcrypt 5.x` несовместимы → пинить `bcrypt==4.0.1`
- Порт 8000 на VPS занят → Docker nginx слушает 8100, FastPanel проксирует на 127.0.0.1:8100
- SQLite для тестов: патч JSONB → JSON в conftest.py, shared-cache mode для bot_worker
- `email-validator 2.1.0` yanked но работает — обновить при случае
- Alembic autogenerate не видит модели без явного import в `env.py` — ВСЕ модули импортированы
- `.env` в gitignore — на VPS свой `.env`, не коммитить
- pybit: все numeric params — strings (`str(qty)`, `str(price)`); klines в обратном порядке — reverse
- `set_leverage` raises 110043 если уже установлено — catch и ignore
- FastPanel перезаписывает nginx конфиг — НЕ редактировать вручную, только через панель
- Bybit API sync → async: все вызовы BybitClient обёрнуты в `asyncio.to_thread()`
- `get_db()` без auto-commit — сервисы должны вызывать `await self.db.commit()` явно
- Bybit: testnet НЕ используется. Demo mode (`HTTP(demo=True)`) = api-demo.bybit.com (реальные цены, симулированные ордера). Колонка `is_testnet` в БД означает "demo mode" (без миграции). `BybitClient(demo=True)` для demo, `BybitClient()` для публичных данных (mainnet)
- Multi-TP P&L: при partial close (TP1) `realized_pnl` накапливается (+=), при финальном закрытии — добавляется к накопленному (если `original_quantity is not None`). `bot.total_pnl` пересчитывается из ВСЕХ закрытых позиций (не инкрементально) чтобы избежать двойного подсчёта
- Bybit closed PnL API: поле `avgEntryPrice` (не `entryPrice`). DB хранит float64 precision → при сравнении округлять до 3 знаков

## Рабочий процесс агентов

- Каждый агент после реализации вызывает `/simplify` для ревью
- При неуверенности агент отправляет `researcher` за документацией
- Оркестратор координирует, НЕ пишет код сам
- Agent Teams включены (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)

## Спецификация

Полная спецификация: `docs/superpowers/specs/2026-03-29-algobond-platform-design.md`
Планы реализации: `docs/superpowers/plans/`
Оригинальная стратегия: `strategis_1.pine` (Pine Script v6, ~895 строк)
Конфиги TradingView: `docs/config_tw/*.png` (10 скриншотов)
