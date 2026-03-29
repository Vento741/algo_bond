# Strategy Optimizer Agent — Spec

## Context
AlgoBond имеет Lorentzian KNN стратегию с ~40 настраиваемых параметров и backtest API.
Нужен Claude Code агент для автоматической оптимизации параметров через grid search backtesting.

## Agent: optimizer

### Команды
- `/optimize SYMBOL TF` — полная оптимизация (coarse → fine tune)
- `/optimize SYMBOL TF --quick` — только coarse grid
- `/optimize SYMBOL TF --params ГРУППА` — оптимизация конкретной группы (knn/risk/filters/trend/ribbon/smc/flow)
- `/optimize-analyze` — анализ последних результатов
- `/optimize-apply CONFIG_ID` — применить лучший конфиг к боту

### Алгоритм

**Фаза 1: Coarse Grid (~100 комбинаций)**
Ключевые параметры с широкими шагами:
- knn.neighbors: [4, 8, 12, 16]
- knn.lookback: [30, 50, 80]
- risk.stop_atr_mult: [1.0, 1.5, 2.0, 3.0]
- risk.tp_atr_mult: [10, 20, 30, 50]
- filters.adx_threshold: [8, 10, 15, 20]

Запускает бэктесты через API, собирает метрики.
Ранжирует по composite score: `0.4*sharpe + 0.3*pnl_norm + 0.2*(1-drawdown) + 0.1*win_rate`
Выбирает TOP-5 регионов.

**Фаза 2: Fine Tune (~50 комбинаций вокруг TOP-5)**
Дополнительные параметры с мелким шагом:
- knn.weight: [0.3, 0.5, 0.7]
- trend.ema_fast/ema_slow: [20/40, 26/50, 30/60]
- ribbon.threshold: [3, 4, 5, 6]
- order_flow.cvd_threshold: [0.5, 0.7, 0.9]
- smc.fvg_min_size: [0.3, 0.5, 0.8]
- risk.trailing_atr_mult: [5, 10, 15, 20]
- risk.use_trailing: [true, false]
- backtest.order_size: [50, 75, 100]

**Фаза 3: Анализ и вывод**
- TOP-10 таблица с метриками
- Сравнение с дефолтным конфигом
- Сохранение лучшего конфига в БД
- Markdown отчёт в `docs/optimization/`

### Межагентное взаимодействие
Оптимизатор может вызывать:
- `@backend-dev` — модификация кода стратегии (изменение формул, добавление фильтров)
- `@algorithm-engineer` — эксперименты с индикаторами (замена EMA→HMA, добавление фич в KNN)
- `@market-analyst` — анализ участков просадки, корреляция с рыночными условиями

### API Flow
```
1. Login → JWT token
2. GET /strategies → strategy_id
3. POST /strategies/configs → config с модифицированными параметрами
4. POST /backtest/runs → run_id
5. Poll GET /backtest/runs/{id} → status=completed
6. GET /backtest/runs/{id}/result → metrics
7. Repeat 3-6 для каждой комбинации
8. DELETE /strategies/configs/{id} (cleanup промежуточных конфигов)
9. POST /strategies/configs → сохранить лучший
```

### Вывод
```
╔══════════════════════════════════════════════════════════════╗
║ OPTIMIZER: RIVERUSDT 15m — 150 backtests in 12 min         ║
╠════╤════════╤═══════╤══════╤═══════╤══════╤════════════════╣
║ #  │ PnL %  │ Sharp │ Win% │ DD %  │ Trad │ Key params     ║
╠════╪════════╪═══════╪══════╪═══════╪══════╪════════════════╣
║  1 │ +142%  │  2.31 │ 38%  │ 22%   │  47  │ k=12 s=1.5    ║
║  2 │ +118%  │  1.98 │ 35%  │ 28%   │  52  │ k=8 s=2 t=20  ║
║ .. │        │       │      │       │      │                ║
║ D  │ +43%   │  1.69 │ 100% │ 14%   │   2  │ DEFAULT        ║
╚════╧════════╧═══════╧══════╧═══════╧══════╧════════════════╝
Improvement: +99% PnL, +0.62 Sharpe vs default
Config saved: "RIVER 15m Optimized v1 (Sharpe 2.31)"
```

### Файлы
- `.claude/agents/optimizer.md` — определение агента
- `.claude/skills/optimize.md` — скилл /optimize
- `docs/optimization/YYYY-MM-DD-SYMBOL-TF.md` — отчёты
