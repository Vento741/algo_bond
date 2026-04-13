# Local Grid Search Workflow — Design Spec

**Дата:** 2026-04-14
**Автор:** Денис + Claude
**Статус:** Approved, ready for plan
**Тип:** Новые скрипты + локальный workflow
**Связанный артефакт:** [PivotPointMeanReversion strategy](2026-04-13-pivot-point-mean-reversion-design.md)

---

## 1. Контекст и мотивация

### 1.1 Проблема
Текущий `backend/scripts/optimize_strategy.py` жёстко захардкожен под Lorentzian KNN: engine type, symbol, BASE_CONFIG и grid parameters — всё для KNN. Также он sequential (без multiprocessing), без кэша свечей и запускается исторически на VPS.

Для новой стратегии `PivotPointMeanReversion` нужен:
- Свой grid search с параметрами из [спека раздел 8.3](2026-04-13-pivot-point-mean-reversion-design.md#83-grid-search-параметры-для-optimize_strategypy)
- **Локальный** запуск (мощный ноут ≫ слабый VPS)
- Параллелизация для скорости
- Кэш свечей для повторных запусков

### 1.2 Цель
Создать полный локальный workflow: download → optimize → import-to-VPS. Zero-impact на существующий `optimize_strategy.py` (он остаётся для KNN).

### 1.3 Non-goals (явно НЕ входит в MVP)
- Универсальный grid search framework для всех стратегий (отдельный проект)
- Numba-JIT ускорение индикаторов и backtest kernel (follow-up task)
- CI/CD интеграция
- Автоматический promote в live mode (требует ручного решения)
- UI для запуска оптимизации (пользуемся CLI)

---

## 2. Архитектура

### 2.1 Три независимых скрипта

```
┌─────────────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────────┐
│ download_candles.py     │     │ optimize_pivot_point_mr.py   │     │ import_optimized_config.py│
│                         │     │                              │     │                           │
│ Bybit API pagination    │───▶│ multiprocessing grid search  │───▶│ HTTP API → VPS            │
│ → data/candles/*.parquet│     │ Uses ENGINE_REGISTRY         │     │ POST /strategies/configs  │
└─────────────────────────┘     │ → optimize_results/*.json    │     └──────────────────────────┘
                                └──────────────────────────────┘
         [DATA]                          [COMPUTE]                          [DEPLOY]
```

Каждый скрипт имеет **одну ответственность** и коммуницирует через файлы (parquet/json), не через импорт друг друга. Это делает их независимо тестируемыми и запускаемыми.

### 2.2 Boundaries и zero-impact

**НЕ ТРОГАЕМ:**
- `backend/scripts/optimize_strategy.py` — остаётся для Lorentzian KNN
- `backend/app/modules/backtest/backtest_engine.py` — используем как есть
- `backend/app/modules/strategy/engines/*.py` — используем через `get_engine()` без правок
- `backend/app/modules/market/candle_service.py` — не используем (у нас свой cache)
- Существующие API endpoints — используем через HTTP в import script

**СОЗДАЁМ:**
- `backend/scripts/download_candles.py` — кэш свечей
- `backend/scripts/optimize_pivot_point_mr.py` — grid search
- `backend/scripts/import_optimized_config.py` — uploader
- `backend/tests/test_download_candles.py`
- `backend/tests/test_optimize_pivot_point_mr.py`
- `backend/tests/test_import_optimized_config.py`
- `data/candles/.gitkeep` — директория для parquet кэша
- `optimize_results/.gitkeep` — директория для результатов

**МОДИФИЦИРУЕМ (минимально):**
- `.gitignore` — добавить `data/candles/*.parquet` и `optimize_results/*`
- `backend/requirements.txt` — добавить `pyarrow` (parquet backend для pandas)

---

## 3. Компонент 1: `download_candles.py`

### 3.1 Ответственность
Скачать исторические OHLCV свечи с Bybit V5 API, сохранить локально в parquet формате. Идемпотентный — повторные запуски используют кэш.

### 3.2 CLI интерфейс

```bash
python backend/scripts/download_candles.py \
    --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT \
    --timeframe 5 \
    --days 180 \
    [--force]       # игнорировать кэш, качать заново
    [--verbose]     # подробные логи пагинации
```

**Флаги:**
- `--symbols` (required) — CSV список символов Bybit (например `WLDUSDT,LDOUSDT`)
- `--timeframe` (required) — `1, 3, 5, 15, 30, 60, 240, 1440` (Bybit kline intervals)
- `--days` (default 180) — сколько дней истории
- `--force` (optional) — перекачать даже если кэш есть
- `--verbose` (optional) — подробный вывод

### 3.3 Алгоритм `download(symbol, timeframe, days_back, force)`

1. Рассчитать `end_ts = now_ms`, `start_ts = end_ts - days_back * 86_400_000`
2. Путь кэша: `data/candles/{symbol}_{timeframe}.parquet`
3. Если файл существует и не `force`:
   - Прочитать через `pd.read_parquet()`
   - Если `df["timestamp"].min() <= start_ts` и `df["timestamp"].max() >= end_ts - tolerance` → return df
   - Tolerance = 1 bar (возможны задержки свежих свечей)
4. Иначе — качаем через `BybitClient.get_klines(symbol, interval=timeframe, limit=1000)`:
   - Backward pagination: `end = end_ts`, в каждой итерации запрос с `end`, полученные свечи сортируем, `end = min_timestamp - 1`
   - Стоп: когда `min_timestamp <= start_ts` или batch пустой
   - Дедупликация по `timestamp` через pandas `drop_duplicates`
   - Sort ASC
5. `df.to_parquet(path, compression="snappy", engine="pyarrow")`
6. Return DataFrame

### 3.4 Формат parquet

DataFrame с колонками:
- `timestamp` (int64) — Unix milliseconds
- `open` (float64)
- `high` (float64)
- `low` (float64)
- `close` (float64)
- `volume` (float64)
- `turnover` (float64, optional — Bybit даёт, сохраняем)

Индекс — `RangeIndex`, не datetime (для простоты).

### 3.5 Error handling

- **Bybit rate limit (429):** retry с exp backoff (1s, 2s, 4s, max 3 retries), потом raise
- **Invalid symbol (400):** log error, skip символ, продолжить остальные
- **Network errors:** retry 3 раза, потом raise с контекстом
- **Пустой ответ на первой странице:** предупреждение, но не crash (возможно symbol уже не торгуется)

### 3.6 Reuse существующего кода

`BybitClient` из `backend/app/modules/market/bybit_client.py` — используем как есть. Импорт через sys.path setup в начале скрипта (стандартный паттерн `backend/scripts/`).

---

## 4. Компонент 2: `optimize_pivot_point_mr.py`

### 4.1 Ответственность
Grid search оптимизация конфигурации `PivotPointMeanReversion` с multiprocessing. Читает свечи из parquet кэша, использует реальный `run_backtest()`, сохраняет топ конфиги в JSON + markdown отчёт.

### 4.2 CLI интерфейс

```bash
python backend/scripts/optimize_pivot_point_mr.py \
    --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT \
    --timeframe 5 \
    [--phase coarse|fine|tuning|all]  # default: all
    [--workers N]                      # default: cpu_count() - 2
    [--top-n 10]                       # размер top-N для дампа
    [--days 180]                       # сколько дней истории использовать
```

### 4.3 BASE_CONFIG

Импортируется из `seed_strategy.py` напрямую — DRY:

```python
from scripts.seed_strategy import STRATEGIES

BASE_CONFIG = next(
    s["default_config"] for s in STRATEGIES if s["slug"] == "pivot-point-mr"
)
```

Это гарантирует что grid search стартует с актуального default, и при изменении default в seed — optimizer автоматически подхватит.

### 4.4 Grid parameters (из спека 8.3)

**Phase 1 — Coarse (243 combinations):**
```python
phase1_grid = {
    "pivot.period": [24, 48, 96],                    # 3
    "entry.min_distance_pct": [0.10, 0.15, 0.25],    # 3
    "entry.min_confluence": [1.0, 1.5, 2.0],         # 3
    "risk.sl_max_pct": [0.015, 0.02, 0.03],          # 3
    "entry.cooldown_bars": [1, 3, 5],                # 3
}
# 3^5 = 243 combinations per symbol-timeframe
```

**Phase 2 — Fine (top 10 из Coarse → ~150 combinations):**
```python
# Берём best 10 конфигов из Phase 1, вокруг каждого — узкий grid
phase2_additional_grid = {
    "regime.adx_strong_trend": [25, 30, 35],         # 3
    "filters.rsi_oversold": [35, 40, 45],            # 3
    "risk.trailing_atr_mult": [1.2, 1.5, 2.0],       # 3
    "entry.impulse_check_bars": [3, 5, 7],           # 3
}
# 10 baseline configs * 3^4 = 810 total combinations
# Если > 300 — применяем stratified sampling до 300:
#   - keep ВСЕ 10 baseline configs
#   - из оставшихся 800 sampling'уем 290 случайно с seed=42
# Итого: 300 комбинаций per symbol-timeframe в Phase 2
```

**Phase 3 — Tuning (top 3 из Fine → ~60 combinations each):**
```python
phase3_grid = {
    "risk.tp1_close_pct": [0.4, 0.5, 0.6, 0.7],      # 4
    "risk.tp2_close_pct": [0.3, 0.4, 0.5, 0.6],      # 4 (но фильтруем: сумма с tp1 ≤ 1.0)
    "pivot.velocity_lookback": [8, 12, 16],          # 3
    "filters.volume_min_ratio": [1.0, 1.2, 1.5],     # 3 (если volume filter включён)
}
# ~3 configs * 120 valid combinations = ~360 total
```

### 4.5 Single backtest runner (multiprocessing worker)

```python
def run_one_backtest(args: tuple) -> dict:
    """Worker function для multiprocessing.Pool.

    Args:
        (symbol, timeframe, config, run_id)

    Returns:
        {"run_id", "symbol", "timeframe", "config", "metrics", "score"}
    """
    symbol, timeframe, config, run_id = args

    # Load candles from parquet cache (inside worker — parquet I/O is fast)
    df = pd.read_parquet(f"data/candles/{symbol}_{timeframe}.parquet")
    ohlcv = OHLCV(
        open=df["open"].values.astype(np.float64),
        high=df["high"].values.astype(np.float64),
        low=df["low"].values.astype(np.float64),
        close=df["close"].values.astype(np.float64),
        volume=df["volume"].values.astype(np.float64),
        timestamps=df["timestamp"].values.astype(np.float64),
    )

    # Run strategy
    engine = get_engine("pivot_point_mr", config)
    result = engine.generate_signals(ohlcv)

    # Run backtest
    metrics = run_backtest(
        ohlcv=ohlcv,
        signals=result.signals,
        initial_capital=100.0,
        commission_pct=0.06,
        slippage_pct=0.03,
        order_size_pct=75.0,
        use_multi_tp=True,
        use_breakeven=True,
        timeframe_minutes=int(timeframe),
        leverage=1,
        on_reverse="close",
    )

    score = score_mean_reversion(metrics)

    return {
        "run_id": run_id,
        "symbol": symbol,
        "timeframe": timeframe,
        "config": config,
        "metrics": metrics_to_dict(metrics),
        "score": score,
    }
```

### 4.6 Parallelization

```python
from multiprocessing import Pool, cpu_count

workers = args.workers or max(1, cpu_count() - 2)
with Pool(workers) as pool:
    results = pool.map(run_one_backtest, all_tasks)
```

**Note on memory:** каждый worker читает свой DataFrame (~10-15MB) из parquet. 14 workers × 15MB = 210MB — приемлемо. Не используем `initializer` для shared state, т.к. candles разные per symbol.

### 4.7 Mean Reversion scoring

```python
def score_mean_reversion(metrics) -> float:
    """Scoring adapted for mean reversion strategies.

    Base scoring: same as score_profit (pnl - dd*0.3 + bonuses).
    Additional MR-specific adjustments:
        +5  if avg_trade_duration_bars < 20 (fast reversions = good)
        -10 if max_winning_streak > 10    (suspicious, likely trend fluke)
        -20 if total_trades < 5            (too few signals)
    """
    if metrics.total_trades < 3:
        return -999.0

    base_score = (
        metrics.total_pnl_pct
        - metrics.max_drawdown * 0.3
    )
    # Bonuses
    if metrics.win_rate > 55:
        base_score += 5
    if metrics.profit_factor > 1.5:
        base_score += 5
    if metrics.total_trades > 20:
        base_score += 5

    # MR-specific
    avg_duration = _extract_avg_duration(metrics)  # из equity_curve или trades_log
    if avg_duration > 0 and avg_duration < 20:
        base_score += 5

    max_streak = _extract_max_win_streak(metrics)
    if max_streak > 10:
        base_score -= 10

    if metrics.total_trades < 5:
        base_score -= 20

    return base_score
```

### 4.8 Output artifacts

**Per-symbol-timeframe JSON:**
`optimize_results/pivot_mr_{symbol}_{timeframe}_{timestamp}.json`
```json
{
  "symbol": "WLDUSDT",
  "timeframe": "5",
  "days_back": 180,
  "timestamp": "2026-04-14T18:30:00Z",
  "base_config": {...},
  "phases": {
    "coarse": {
      "combinations_tested": 243,
      "top_10": [{"config": {...}, "metrics": {...}, "score": ...}, ...]
    },
    "fine": {
      "combinations_tested": 300,
      "top_10": [...]
    },
    "tuning": {
      "combinations_tested": 360,
      "top_10": [...]
    }
  },
  "final_top_10": [...],
  "runtime_seconds": 1234.5
}
```

**Per-symbol-timeframe Markdown:**
`optimize_results/pivot_mr_{symbol}_{timeframe}_{timestamp}.md`
```markdown
# Pivot Point MR — WLDUSDT 5m — 2026-04-14

**Runtime:** 8m 34s | **Combinations:** 903 | **Workers:** 14

## Top 10 Final Configs

| # | PnL% | DD% | WR% | PF | Sharpe | Trades | AvgDur | Score | pivot.period | min_conf | sl_max | cooldown |
|---|------|-----|-----|-----|--------|--------|--------|-------|--------------|----------|--------|----------|
| 1 | 45.2 | 8.1 | 61 | 2.34 | 2.1 | 89 | 12 | 38.5 | 48 | 1.5 | 0.02 | 3 |
| ... |

## Config #1 (best)
```json
{...}
```
```

**Progress dump:** после каждой фазы промежуточный JSON `_phaseN.json` чтобы при crash не потерять работу.

### 4.9 Reuse и DRY

- `apply_params()` — копируем из `optimize_strategy.py` (nested keys через точку)
- `candles_to_ohlcv()` — пишем заново, т.к. читаем из parquet (не из Bybit API как в LK optimizer)
- `run_backtest()` — импортируется напрямую из `backend/app/modules/backtest/backtest_engine.py`
- `get_engine()` — импортируется из `backend/app/modules/strategy/engines`

---

## 5. Компонент 3: `import_optimized_config.py`

### 5.1 Ответственность
Взять JSON результаты optimizer'а, выбрать топ-N конфигов, создать `StrategyConfig` записи на VPS через HTTP API.

### 5.2 CLI

```bash
python backend/scripts/import_optimized_config.py \
    --results optimize_results/pivot_mr_WLDUSDT_5_20260414_1830.json \
    --top-n 3 \
    --target https://algo.dev-james.bond \
    [--login deniskim@yandex.ru]  # email for login, prompt for password
    [--dry-run]                     # print payloads without POSTing
    [--name-prefix "Optimized"]     # prefix for StrategyConfig.name
```

### 5.3 Auth flow

1. Если `ALGOBOND_TOKEN` env var установлен — используем напрямую
2. Иначе если `--login EMAIL` передан — prompt password через `getpass.getpass()`, `POST /api/auth/login`, сохраняем token в памяти (не в файл)
3. Иначе — ошибка с инструкцией как получить токен

### 5.4 Import flow

```python
def main():
    args = parse_args()
    token = get_token(args)
    results = json.load(open(args.results))

    # 1. Resolve strategy_id
    strategy_id = http_get(
        f"{args.target}/api/strategies/by-slug/pivot-point-mr",
        token,
    )["id"]

    # 2. Select top-N from final_top_10
    top_configs = results["final_top_10"][:args.top_n]

    # 3. Create configs
    created = skipped = errors = 0
    for i, entry in enumerate(top_configs, 1):
        name = generate_name(args.name_prefix, results, entry, i)

        # Idempotent check
        existing = http_get(
            f"{args.target}/api/strategies/configs?name={urlencode(name)}",
            token,
        )
        if existing:
            print(f"  [{i}] SKIP (exists): {name}")
            skipped += 1
            continue

        payload = {
            "strategy_id": strategy_id,
            "name": name,
            "symbol": results["symbol"],
            "timeframe": results["timeframe"],
            "config": entry["config"],
        }

        if args.dry_run:
            print(f"  [{i}] DRY-RUN would POST: {json.dumps(payload, indent=2)}")
            continue

        try:
            response = http_post(
                f"{args.target}/api/strategies/configs",
                token,
                payload,
            )
            print(f"  [{i}] CREATED: {name} → {response['id']}")
            created += 1
        except HttpError as e:
            print(f"  [{i}] ERROR: {e}")
            errors += 1

    print(f"\nSummary: {created} created, {skipped} skipped, {errors} errors")
```

### 5.5 Name generation

```python
def generate_name(prefix: str, results: dict, entry: dict, rank: int) -> str:
    """Pivot MR #1 WLDUSDT 5m PF2.34 DD8.1 2026-04-14"""
    m = entry["metrics"]
    date = results["timestamp"][:10]
    return (
        f"{prefix} #{rank} {results['symbol']} {results['timeframe']}m "
        f"PF{m['profit_factor']:.2f} DD{m['max_drawdown']:.1f} {date}"
    )
```

### 5.6 Error handling

- **401 Unauthorized:** fail fast, инструкция пользователю перелогиниться
- **409 Conflict / duplicate name:** skip с сообщением, продолжить другие
- **422 Validation error:** print error body, skip этот конфиг, продолжить
- **5xx:** retry 3 раза с exp backoff, потом skip
- **Network timeout:** default 30s, если timeout — retry
- **Dry-run mode:** никаких POST, только GET для idempotent check, печатаем payloads

### 5.7 Endpoints используемые

- `POST /api/auth/login` — получить JWT (если нет env var)
- `GET /api/strategies/by-slug/pivot-point-mr` — получить `strategy_id` по slug
  - *Если этого endpoint'а нет в текущем API — используем `GET /api/strategies` и фильтруем по slug клиентом*
- `GET /api/strategies/configs?name=<name>` — idempotent check
  - *Если фильтра по name нет — берём все конфиги пользователя и фильтруем клиентом*
- `POST /api/strategies/configs` — создание StrategyConfig

**Discovery note:** реальные endpoint paths проверяются в плане через чтение `backend/app/modules/strategy/router.py`. Если GET эндпоинтов с фильтрацией нет — план включает клиент-сайд фильтрацию как fallback.

---

## 6. Зависимости

### 6.1 Новые pip packages

Добавить в `backend/requirements.txt`:
```
pandas>=2.0        # если ещё не было (скорее всего есть)
pyarrow>=14.0      # parquet backend
```

**Проверка:** перед добавлением — проверить существующий `requirements.txt`, возможно `pandas` уже есть (SQLAlchemy иногда тянет).

### 6.2 Python stdlib (без новых deps)

- `multiprocessing` (pool)
- `argparse` (CLI)
- `urllib.request` или `requests` (HTTP client — `requests` вероятно уже есть, иначе используем `httpx` если он в requirements, иначе stdlib)
- `getpass` (password prompt)
- `json`, `time`, `itertools`, `datetime`
- `pathlib` (пути)

---

## 7. Data flow

```
[Ноут]
   │
   │ 1. python backend/scripts/download_candles.py --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT --timeframe 5 --days 180
   ▼
data/candles/WLDUSDT_5.parquet  (~14MB, 52k rows)
data/candles/LDOUSDT_5.parquet
data/candles/FETUSDT_5.parquet
data/candles/NEARUSDT_5.parquet
   │
   │ 2. python backend/scripts/optimize_pivot_point_mr.py --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT --timeframe 5 --workers 14
   ▼
optimize_results/pivot_mr_WLDUSDT_5_20260414_1830.json (+ .md)
optimize_results/pivot_mr_LDOUSDT_5_20260414_1835.json (+ .md)
optimize_results/pivot_mr_FETUSDT_5_20260414_1840.json (+ .md)
optimize_results/pivot_mr_NEARUSDT_5_20260414_1845.json (+ .md)
   │
   │ 3. User reviews .md reports, selects best token
   │
   │ 4. python backend/scripts/import_optimized_config.py --results pivot_mr_WLDUSDT_5_20260414_1830.json --top-n 3 --target https://algo.dev-james.bond
   ▼
[VPS PostgreSQL]
   strategy_configs (3 new rows for WLDUSDT 5m)
   │
   │ 5. User in UI at https://algo.dev-james.bond/strategies → selects one of new configs → creates demo bot
   ▼
[bot_worker picks config, runs live]
```

---

## 8. Testing strategy

### 8.1 Unit tests — download_candles

`backend/tests/test_download_candles.py`:

1. `test_first_download_creates_parquet` — mock `BybitClient.get_klines`, запускаем, проверяем файл создан с правильными колонками
2. `test_cached_download_skips_api` — параметризованный mock, первый вызов качает, второй использует cache
3. `test_force_bypasses_cache` — с `force=True` всегда дёргает API
4. `test_pagination_combines_batches` — mock возвращает 3 батча по 1000 свечей, проверяем объединение и дедуп
5. `test_deduplication_by_timestamp` — mock с overlap, проверяем что дубли убраны
6. `test_rate_limit_retry` — mock возвращает 429 → success, проверяем retry
7. `test_insufficient_data_warning` — mock возвращает 50 свечей, проверяем warning но не crash

### 8.2 Unit tests — optimize_pivot_point_mr

`backend/tests/test_optimize_pivot_point_mr.py`:

1. `test_apply_params_nested` — `{"pivot.period": 96}` правильно ставит `cfg["pivot"]["period"]`
2. `test_base_config_from_seed` — BASE_CONFIG импортируется из seed и имеет все нужные секции
3. `test_grid_expansion_coarse` — `itertools.product` даёт ожидаемое число комбинаций
4. `test_score_mean_reversion_bonuses` — проверка всех MR bonus/penalty веток
5. `test_score_mean_reversion_min_trades` — trades < 3 → -999
6. `test_run_one_backtest_end_to_end` — с mock parquet файлом (crafted OHLCV), запускаем один бэктест через worker, проверяем что возвращает ожидаемую форму
7. `test_top_n_filtering` — сортировка по score, отбор top-N

### 8.3 Unit tests — import_optimized_config

`backend/tests/test_import_optimized_config.py`:

1. `test_name_generation_format` — проверка что имя конфига соответствует шаблону
2. `test_idempotent_skip_existing` — mock HTTP: GET возвращает existing → POST не вызывается
3. `test_dry_run_no_post` — с `--dry-run` не делает POST calls
4. `test_auth_from_env_var` — `ALGOBOND_TOKEN` используется без login
5. `test_auth_from_login_prompt` — mock `getpass` → POST /api/auth/login → token
6. `test_http_409_continues` — 409 conflict на одном конфиге не роняет весь импорт
7. `test_http_401_fails_fast` — 401 останавливает скрипт

### 8.4 Manual verification

После реализации, перед запуском реального грида:

1. `python backend/scripts/download_candles.py --symbols WLDUSDT --timeframe 5 --days 7` — проверить что parquet создался, открывается в pandas, ~2000 rows
2. `python -c "import pandas as pd; df = pd.read_parquet('data/candles/WLDUSDT_5.parquet'); print(df.describe()); print(df.head())"` — sanity check
3. `python backend/scripts/optimize_pivot_point_mr.py --symbols WLDUSDT --timeframe 5 --workers 4 --phase coarse --days 30` — ограниченный прогон (30 дней, только coarse, 4 workers) → проверить что JSON/MD генерируются, не крашится
4. Читаем markdown отчёт глазами — разумные метрики? PF > 1? Топ-10 отсортирован по score?
5. `python backend/scripts/import_optimized_config.py --results optimize_results/... --top-n 1 --dry-run --target https://algo.dev-james.bond` — проверить payload корректный
6. Убираем `--dry-run`, запускаем, проверяем `GET /api/strategies/configs` на VPS что конфиг появился

---

## 9. Success criteria (Definition of Done)

**Реализация:**
- [ ] 3 скрипта созданы и проходят свои unit тесты
- [ ] `pyarrow` добавлен в `requirements.txt`, `.gitignore` обновлён
- [ ] Zero-impact verified: существующий `optimize_strategy.py`, `backtest_engine.py`, `engines/*.py`, `trading/*.py` нетронуты

**Функциональность:**
- [ ] `download_candles.py` качает 4 токена × 5m × 180 дней, создаёт 4 parquet файла
- [ ] `optimize_pivot_point_mr.py` запускается на всех 4 токенах, не падает, даёт 4 результата JSON + MD
- [ ] Хоть один токен имеет топ-конфиг с: **PF > 1.3, DD < 20%, WR > 50%, total_trades > 10** (иначе стратегия не жизнеспособна на commission=0.06%)
- [ ] `import_optimized_config.py --dry-run` генерирует корректный payload для POST /api/strategies/configs
- [ ] Реальный импорт создаёт StrategyConfig на VPS, видно через `GET /api/strategies/configs`

**Performance:**
- [ ] Полный прогон (4 токена × 3 фазы × ~903 комбинаций) занимает < 60 минут на 14-core ноуте
- [ ] Memory usage < 4GB при 14 workers

---

## 10. Risks и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| Bybit rate limit при массовом скачивании | Средняя | Кэш свечей, запрос 1 раз на N дней, exp backoff retry |
| pyarrow несовместимость на Windows | Низкая | Fallback на json.gz в конфиге (доп. задача, если всплывёт) |
| Топ-конфиги не проходят critical success criteria (PF > 1.3) | **Высокая** | Задокументировать в markdown, попробовать другие токены/таймфреймы, возможно стратегия не подходит для Bybit комиссий — сделать явный вывод |
| multiprocessing overhead > выигрыша | Низкая | Worker count настраивается, можно 1 для дебага |
| API endpoints для import не существуют в ожидаемой форме | Средняя | План включает discovery шаг — чтение `router.py` перед реализацией import script, адаптация под реальные пути |
| Grid search fine phase генерирует слишком много комбинаций (810) | Средняя | Random sampling до 200-300, либо жёсткое ограничение top-5 из coarse → 405 → filter top-10 |

---

## 11. Команда реализации

| Задача | Агент | Что делает |
|---|---|---|
| Discovery API endpoints | Explore | Читает `router.py` для strategy module, определяет реальные пути и методы |
| Реализация `download_candles.py` + tests | general-purpose implementer | TDD цикл |
| Реализация `optimize_pivot_point_mr.py` + tests | general-purpose implementer | TDD цикл |
| Реализация `import_optimized_config.py` + tests | general-purpose implementer | TDD цикл |
| Combined review after each task | general-purpose reviewer | spec compliance + code quality |
| Final review | code-reviewer agent | Полный обзор всех 3 скриптов перед запуском |

---

## 12. Out of scope (явно НЕ в MVP)

1. **Numba JIT** — отдельная follow-up задача после того как pipeline работает
2. **Incremental parquet append** — только полный перекачивание при устаревшем кэше
3. **Distributed грид-сёрч** через Ray/Dask — multiprocessing хватает
4. **Резюмирование прогона** (web UI / dashboard) — markdown отчётов достаточно
5. **Автоматический promote конфигов в live mode** — требует ручного одобрения
6. **Generalizacing для других стратегий** — specifically pivot_point_mr, другие стратегии получат свои скрипты при необходимости
7. **CI/CD интеграция** — запуск вручную с ноута
