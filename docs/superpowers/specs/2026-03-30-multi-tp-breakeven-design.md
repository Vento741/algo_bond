# Multi-TP + Breakeven — Design Spec

**Date:** 2026-03-30
**Status:** Approved

## Overview

Add multi-level take-profit (partial position closes) and breakeven stop to the Lorentzian KNN strategy.

## Config Schema

New fields in `risk` section of strategy config:

```json
{
  "risk": {
    "use_multi_tp": false,
    "tp_levels": [
      { "atr_mult": 5, "close_pct": 50 },
      { "atr_mult": 10, "close_pct": 50 }
    ],
    "use_breakeven": true
  }
}
```

- `use_multi_tp` (bool, default false): enable multi-TP mode. When false, existing single `tp_atr_mult` behavior.
- `tp_levels` (array): ordered list of TP levels. Each has `atr_mult` (ATR distance from entry) and `close_pct` (% of original position to close). Sum of `close_pct` must equal 100.
- `use_breakeven` (bool, default true): on TP1 hit, move SL to entry price.

## Backtest Engine Changes

### Position tracking (backtest_engine.py)

New state variables per position:
- `remaining_pct`: starts at 100, decreases on each partial close
- `tp_levels_hit`: tracks which TP levels have been triggered
- `breakeven_active`: whether SL has been moved to entry

### Execution flow per bar:

1. Check TP levels in order (TP1 first, then TP2, etc.):
   - LONG: `bar_high >= entry + atr * tp_level.atr_mult`
   - SHORT: `bar_low <= entry - atr * tp_level.atr_mult`
2. On TP hit: partial close of `close_pct` of ORIGINAL quantity
   - Record as Trade with `exit_reason: "take_profit_1"`, `"take_profit_2"`, etc.
   - Reduce `remaining_pct`
3. On TP1 hit + `use_breakeven`: set `position_sl = entry_price`
4. Trailing stop operates on remaining quantity only
5. When SL/trailing hits: close ALL remaining at once
   - If SL == entry_price: `exit_reason: "breakeven"`
6. When `remaining_pct` reaches 0: position fully closed

### Trade log format

Partial closes produce separate Trade entries:
```
Trade(entry_bar=100, exit_bar=120, direction="long",
      entry_price=10.0, exit_price=12.5,
      quantity=0.5,  # partial qty
      pnl=1.25, exit_reason="take_profit_1")
Trade(entry_bar=100, exit_bar=150, direction="long",
      entry_price=10.0, exit_price=11.0,
      quantity=0.5,  # remaining qty
      pnl=0.5, exit_reason="trailing_stop")
```

Same `entry_bar` and `entry_price` for all parts of one position.

## Strategy Engine Changes (lorentzian_knn.py)

- Read `use_multi_tp`, `tp_levels`, `use_breakeven` from config
- Internal position tracking: when multi-TP enabled, consider position closed only when ALL TP levels hit or SL/trailing exits remaining
- Signal.take_profit set to the LAST tp_level (for backward compat)

## Signal Dataclass (base.py)

Add optional field:
```python
tp_levels: list[dict] | None = None  # [{"atr_mult": 5, "close_pct": 50}, ...]
```

## Frontend Changes

### Strategy config UI (StrategyDetail.tsx or Backtest.tsx config section)

- Checkbox: "Multi-level TP" (toggles `use_multi_tp`)
- When enabled: dynamic list of TP levels (add/remove rows)
  - Each row: ATR mult input + close % input
- Checkbox: "Breakeven on TP1" (toggles `use_breakeven`)

## Backward Compatibility

- `use_multi_tp: false` (default) → existing single TP behavior unchanged
- Old configs without these fields work exactly as before
- `tp_levels` ignored when `use_multi_tp` is false

## Files to Modify

1. `backend/app/modules/strategy/engines/base.py` — Signal dataclass
2. `backend/app/modules/backtest/backtest_engine.py` — partial close logic
3. `backend/app/modules/strategy/engines/lorentzian_knn.py` — read config, pass tp_levels
4. `backend/app/modules/backtest/celery_tasks.py` — pass new params
5. `backend/scripts/seed_strategy.py` — default config
6. `frontend/src/pages/Backtest.tsx` — UI controls (deferred to separate PR)
