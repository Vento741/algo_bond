# Implementation Plan: Bot Worker Quality Fixes

**Spec:** `docs/superpowers/specs/2026-04-07-bot-worker-quality-fixes.md`

## Tasks

### Task 1: Smart Cycle + Logging (bot_worker.py + celery_app.py)
**Files:** `backend/app/modules/trading/bot_worker.py`, `backend/app/celery_app.py`

1. Change beat interval in celery_app.py: 300 → 60
2. In run_bot_cycle, restructure main flow:
   - Move candle fetch BEFORE open_position check
   - Add Redis last_candle tracking for skip logic
   - 3 modes: full cycle (new candle), manage-only (position open), skip
3. Replace unconditional "Цикл бота запущен" log with contextual logs
4. Add logs for all silent skip paths (signal too old, managing, reverse detected)
5. Run /simplify after completion

### Task 2: Reverse Signal Handling (bot_worker.py)
**Files:** `backend/app/modules/trading/bot_worker.py`
**Depends on:** Task 1 (restructured flow)

1. Add `_close_position_market()` helper function
2. After strategy runs with open position: compare signal direction vs position side
3. Read `on_reverse` from `live_cfg.get("on_reverse", "ignore")`
4. Implement 3 modes: "reverse" (close + open), "close" (close only), "ignore" (manage + log)
5. For "reverse": close → sync → open as 2 separate steps with error handling
6. Run /simplify after completion

### Task 3: ATR Fix + SL Safety (bot_worker.py)
**Files:** `backend/app/modules/trading/bot_worker.py`

1. In _manage_position: replace hardcoded ATR with engine's calc_atr + config atr_period
2. Pass timeframe as argument to _manage_position instead of hardcoded "15"
3. In _place_order multi-TP section: if SL double failure → emergency market close
4. Run /simplify after completion

### Task 4: Frontend on_reverse config + seed update
**Files:** `frontend/src/pages/StrategyDetail.tsx`, `backend/scripts/seed_strategy.py`

1. Add `on_reverse` to LiveConfig interface and DEFAULT_CONFIG
2. Add select/dropdown in Live Trading section of ConfigEditorDialog
3. Add `on_reverse: "ignore"` to seed_strategy.py default configs (both strategies)
4. Run /simplify after completion

### Task 5: Tests
**Files:** `backend/tests/test_bot_worker.py`

1. Verify existing 10 tests still pass
2. Add test: reverse signal detected with on_reverse="reverse" → close + open
3. Add test: reverse signal detected with on_reverse="ignore" → manage only
4. Add test: smart cycle skip when no new candle and no position
5. Add test: SL failure → emergency close
6. Run /simplify after completion
