# Signals Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Signals tab from a plain table to expandable card-rows with indicator scorecard pills, filter chips, and enriched backend indicator data.

**Architecture:** Backend: extend `Signal` dataclass with `indicators` dict, populate in `lorentzian_knn.py`, pass through to `indicators_snapshot` in `bot_worker.py` (2 places). Frontend: replace signals table in `BotDetail.tsx` with `SignalCard` component + filter chips.

**Tech Stack:** Python (FastAPI, SQLAlchemy JSONB), React 18, TypeScript, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-10-signals-tab-redesign.md`

---

### Task 1: Extend Signal dataclass with indicators field

**Files:**
- Modify: `backend/app/modules/strategy/engines/base.py:32-43`

- [ ] **Step 1: Add `indicators` field to Signal dataclass**

In `backend/app/modules/strategy/engines/base.py`, add the `indicators` field to the `Signal` dataclass:

```python
@dataclass
class Signal:
    """Торговый сигнал."""
    bar_index: int
    direction: str  # "long", "short"
    entry_price: float
    stop_loss: float
    take_profit: float
    trailing_atr: float | None = None
    confluence_score: float = 0.0
    signal_type: str = ""  # "trend", "breakout", "mean_reversion"
    tp_levels: list[dict] | None = None  # [{"atr_mult": 5, "close_pct": 50}, ...]
    indicators: dict | None = None  # snapshot of indicator values at signal bar
```

- [ ] **Step 2: Verify imports still work**

Run: `cd backend && python -c "from app.modules.strategy.engines.base import Signal; s = Signal(0, 'long', 1.0, 0.9, 1.1); print(s.indicators)"`
Expected: `None`

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/strategy/engines/base.py
git commit -m "feat: add indicators field to Signal dataclass"
```

---

### Task 2: Populate indicators in lorentzian_knn.py

**Files:**
- Modify: `backend/app/modules/strategy/engines/lorentzian_knn.py:497-507` (long signal creation)
- Modify: `backend/app/modules/strategy/engines/lorentzian_knn.py:528-538` (short signal creation)

- [ ] **Step 1: Add helper function to build indicators dict**

At the top of the `generate_signals` method (after all indicator arrays are computed, around line 348), add a local helper:

```python
        def _build_indicators(i: int, direction: str) -> dict:
            """Snapshot индикаторов на баре i."""
            # EMA trend
            ema_trend_val = "bull" if (
                not np.isnan(ema_fast_line[i]) and not np.isnan(ema_slow_line[i])
                and ema_fast_line[i] > ema_slow_line[i]
            ) else "bear"

            # Ribbon
            ribbon_val = None
            if use_ribbon:
                ribbon_val = "bull" if ribbon_bull[i] else ("bear" if ribbon_bear[i] else None)

            # ADX
            adx_val = round(float(adx_safe[i]), 1)

            # RSI
            rsi_val = round(float(np.nan_to_num(rsi_vals[i], nan=50.0)), 1)

            # Volume
            vol_spike = bool(volume_spike[i])
            vol_ratio = round(float(data.volume[i] / volume_sma_line[i]), 2) if (
                not np.isnan(volume_sma_line[i]) and volume_sma_line[i] > 0
            ) else None

            # Bollinger Bands position
            bb_pos = "mid"
            if not np.isnan(bb_upper[i]) and not np.isnan(bb_lower[i]):
                if data.close[i] > bb_upper[i]:
                    bb_pos = "upper"
                elif data.close[i] < bb_lower[i]:
                    bb_pos = "lower"

            # VWAP
            vwap_pos = None
            if use_order_flow:
                try:
                    if not np.isnan(vwap_line[i]):
                        vwap_pos = "above" if data.close[i] > vwap_line[i] else "below"
                except (NameError, IndexError):
                    pass

            # CVD
            cvd_val = None
            if use_order_flow:
                try:
                    cvd_val = "bull" if of_filter_long[i] else ("bear" if of_filter_short[i] else None)
                except (NameError, IndexError):
                    pass

            # SMC
            smc_val = None
            if use_smc:
                try:
                    smc_val = "bull" if smc_filter_long[i] else ("bear" if smc_filter_short[i] else None)
                except (NameError, IndexError):
                    pass

            # ATR
            atr_val = round(float(atr_vals[i]), 6) if not np.isnan(atr_vals[i]) else None

            return {
                "ema_trend": ema_trend_val,
                "ribbon": ribbon_val,
                "adx": adx_val,
                "rsi": rsi_val,
                "volume_spike": vol_spike,
                "volume_ratio": vol_ratio,
                "bb_position": bb_pos,
                "vwap_position": vwap_pos,
                "cvd": cvd_val,
                "smc": smc_val,
                "atr": atr_val,
            }
```

- [ ] **Step 2: Pass indicators to long Signal creation**

At line ~497, where `signals.append(Signal(` for long, add the `indicators` param:

```python
                signals.append(Signal(
                    bar_index=i,
                    direction="long",
                    entry_price=entry,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trail,
                    confluence_score=float(score_long[i]),
                    signal_type=sig_type,
                    tp_levels=sig_tp_levels,
                    indicators=_build_indicators(i, "long"),
                ))
```

- [ ] **Step 3: Pass indicators to short Signal creation**

At line ~528, where `signals.append(Signal(` for short, add the `indicators` param:

```python
                signals.append(Signal(
                    bar_index=i,
                    direction="short",
                    entry_price=entry,
                    stop_loss=sl,
                    take_profit=tp,
                    trailing_atr=trail,
                    confluence_score=float(score_short[i]),
                    signal_type=sig_type,
                    tp_levels=sig_tp_levels,
                    indicators=_build_indicators(i, "short"),
                ))
```

- [ ] **Step 4: Verify engine runs**

Run: `cd backend && python -c "from app.modules.strategy.engines.lorentzian_knn import LorentzianKNN; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/strategy/engines/lorentzian_knn.py
git commit -m "feat: populate indicators snapshot in lorentzian_knn signal generation"
```

---

### Task 3: Pass indicators through bot_worker to TradeSignal

**Files:**
- Modify: `backend/app/modules/trading/bot_worker.py:222-227` (main signal creation)
- Modify: `backend/app/modules/trading/bot_worker.py:616-621` (reverse signal creation)

- [ ] **Step 1: Update main TradeSignal creation (line ~222)**

Replace the `indicators_snapshot` dict at line 222-227:

```python
            trade_signal = TradeSignal(
                bot_id=bot.id, strategy_config_id=strategy_config.id,
                symbol=symbol, direction=direction,
                signal_strength=latest_signal.confluence_score,
                knn_class=knn_class,
                knn_confidence=float(result.knn_confidence[-1]) if len(result.knn_confidence) > 0 else 50.0,
                indicators_snapshot={
                    "entry_price": latest_signal.entry_price,
                    "stop_loss": latest_signal.stop_loss,
                    "take_profit": latest_signal.take_profit,
                    "signal_type": latest_signal.signal_type,
                    **(latest_signal.indicators or {}),
                },
                was_executed=False,
            )
```

- [ ] **Step 2: Update reverse TradeSignal creation (line ~616)**

Replace the `indicators_snapshot` dict at line 616-621:

```python
        trade_signal = TradeSignal(
            bot_id=bot.id, strategy_config_id=bot.strategy_config.id,
            symbol=symbol, direction=direction,
            signal_strength=latest_signal.confluence_score,
            knn_class=knn_class,
            knn_confidence=float(strategy_result.knn_confidence[-1]) if len(strategy_result.knn_confidence) > 0 else 50.0,
            indicators_snapshot={
                "entry_price": latest_signal.entry_price,
                "stop_loss": latest_signal.stop_loss,
                "take_profit": latest_signal.take_profit,
                "signal_type": latest_signal.signal_type,
                "reverse_from": pos_side,
                **(latest_signal.indicators or {}),
            },
            was_executed=False,
        )
```

- [ ] **Step 3: Verify bot_worker imports**

Run: `cd backend && python -c "from app.modules.trading.bot_worker import _run_bot_cycle; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Run existing tests**

Run: `cd backend && pytest tests/ -v --timeout=30 -x -q 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/trading/bot_worker.py
git commit -m "feat: pass indicator snapshot from engine through bot_worker to TradeSignal"
```

---

### Task 4: Replace signals table with SignalCard components

**Files:**
- Modify: `frontend/src/pages/BotDetail.tsx:915-989` (signals tab content)

- [ ] **Step 1: Add filter state and SignalCard component**

Above the existing `PositionExpandableCard` function, add:

```tsx
/** Signal filter type */
type SignalFilter = 'all' | 'long' | 'short';

/** Expandable signal card with indicator scorecard */
function SignalCard({ signal: s }: { signal: TradeSignalResponse }) {
  const [expanded, setExpanded] = useState(false);
  const snap = s.indicators_snapshot as Record<string, unknown>;

  // R/R calculation from snapshot
  const entry = Number(snap.entry_price ?? 0);
  const sl = Number(snap.stop_loss ?? 0);
  const tp = Number(snap.take_profit ?? 0);
  const rrRatio = Math.abs(sl - entry) > 0
    ? Math.abs(tp - entry) / Math.abs(sl - entry)
    : 0;

  // KNN class color
  const knnColor = s.knn_class === 'BULL' ? 'text-blue-400' : s.knn_class === 'BEAR' ? 'text-brand-loss' : 'text-gray-500';

  // Indicator pill helper
  const Pill = ({ label, value, state }: { label: string; value: string; state: 'bull' | 'bear' | 'neutral' }) => {
    const colors = {
      bull: 'bg-brand-profit/[0.06] border-brand-profit/10',
      bear: 'bg-brand-loss/[0.06] border-brand-loss/10',
      neutral: 'bg-white/[0.03] border-white/[0.06]',
    };
    const dotColor = {
      bull: 'bg-brand-profit',
      bear: 'bg-brand-loss',
      neutral: 'bg-gray-500',
    };
    const textColor = {
      bull: 'text-brand-profit',
      bear: 'text-brand-loss',
      neutral: 'text-white/60',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded border text-[10px] ${colors[state]}`}>
        <span className={`w-[5px] h-[5px] rounded-full ${dotColor[state]}`} />
        <span className="text-white/50">{label}</span>
        <span className={`font-mono ${textColor[state]}`}>{value}</span>
      </span>
    );
  };

  // Determine indicator states
  const emaTrend = snap.ema_trend as string | undefined;
  const ribbon = snap.ribbon as string | undefined;
  const adx = snap.adx as number | undefined;
  const rsiVal = snap.rsi as number | undefined;
  const volSpike = snap.volume_spike as boolean | undefined;
  const volRatio = snap.volume_ratio as number | undefined;
  const bbPos = snap.bb_position as string | undefined;
  const vwapPos = snap.vwap_position as string | undefined;
  const cvd = snap.cvd as string | undefined;
  const smc = snap.smc as string | undefined;
  const atrVal = snap.atr as number | undefined;
  const signalType = snap.signal_type as string | undefined;

  const hasIndicators = emaTrend != null || adx != null;

  return (
    <div
      className={`flex overflow-hidden rounded-md cursor-pointer transition-all hover:bg-white/[0.015] ${expanded ? 'ring-1 ring-brand-premium/20' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className={`w-[3px] shrink-0 ${s.direction === 'long' ? 'bg-brand-profit' : 'bg-brand-loss'}`} />
      <div className="flex-1">
        {/* Collapsed row */}
        <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <span className={`font-bold text-[11px] min-w-[42px] ${s.direction === 'long' ? 'text-brand-profit' : 'text-brand-loss'}`}>
              {s.direction === 'long' ? 'LONG' : 'SHORT'}
            </span>
            <span className={`font-mono text-[11px] ${knnColor}`}>
              {s.knn_class} <span className="text-white/25">{Number(s.knn_confidence).toFixed(1)}%</span>
            </span>
            {entry > 0 && (
              <>
                <div className="w-px h-3 bg-white/5" />
                <span className="text-white/30 font-mono text-[10px]">{formatPrice(entry)}</span>
              </>
            )}
            {rrRatio > 0 && (
              <span className="text-brand-premium font-mono text-[10px]">R/R 1:{rrRatio.toFixed(1)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {s.was_executed ? (
              <span className="text-brand-profit text-[9px]">&#10003;</span>
            ) : (
              <span className="text-gray-600 text-[9px]">-</span>
            )}
            <span className="text-gray-600 text-[10px]">{formatDatetime(s.created_at)}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="px-3 py-2.5 border-t border-white/5">
            {/* Prices row */}
            {entry > 0 && (
              <div className="flex gap-[2px] mb-2.5">
                <div className="flex-1 px-2 py-1.5 bg-white/[0.02] rounded-l">
                  <p className="text-[7px] text-gray-600 uppercase">Entry</p>
                  <p className="font-mono text-white text-xs">{formatPrice(entry)}</p>
                </div>
                <div className="flex-1 px-2 py-1.5 bg-brand-loss/[0.03]">
                  <p className="text-[7px] text-gray-600 uppercase">SL</p>
                  <p className="font-mono text-brand-loss text-xs">{formatPrice(sl)}</p>
                </div>
                <div className="flex-1 px-2 py-1.5 bg-brand-profit/[0.03]">
                  <p className="text-[7px] text-gray-600 uppercase">TP</p>
                  <p className="font-mono text-brand-profit text-xs">{formatPrice(tp)}</p>
                </div>
                <div className="flex-1 px-2 py-1.5 bg-brand-premium/[0.02] rounded-r">
                  <p className="text-[7px] text-gray-600 uppercase">R/R</p>
                  <p className="font-mono text-brand-premium text-xs">1:{rrRatio.toFixed(1)}</p>
                </div>
              </div>
            )}

            {/* Indicator pills */}
            {hasIndicators && (
              <div className="space-y-2">
                {/* Trend group */}
                <div>
                  <p className="text-[8px] text-gray-700 uppercase tracking-wider mb-1">Тренд</p>
                  <div className="flex flex-wrap gap-1">
                    {emaTrend != null && (
                      <Pill label="EMA" value={emaTrend === 'bull' ? '↑' : '↓'} state={emaTrend === 'bull' ? 'bull' : 'bear'} />
                    )}
                    {ribbon != null && (
                      <Pill label="Ribbon" value={ribbon === 'bull' ? 'BULL' : 'BEAR'} state={ribbon === 'bull' ? 'bull' : 'bear'} />
                    )}
                    {adx != null && (
                      <Pill label="ADX" value={String(adx)} state={adx > 20 ? 'bull' : 'neutral'} />
                    )}
                  </div>
                </div>

                {/* Oscillators group */}
                <div>
                  <p className="text-[8px] text-gray-700 uppercase tracking-wider mb-1">Осцилляторы</p>
                  <div className="flex flex-wrap gap-1">
                    {rsiVal != null && (
                      <Pill label="RSI" value={String(rsiVal)} state={rsiVal < 30 ? 'bull' : rsiVal > 70 ? 'bear' : 'neutral'} />
                    )}
                    {volSpike != null && (
                      <Pill
                        label="Vol"
                        value={volSpike ? `↑${volRatio != null ? ` ${volRatio}x` : ''}` : '-'}
                        state={volSpike ? 'bull' : 'neutral'}
                      />
                    )}
                    {bbPos != null && (
                      <Pill label="BB" value={bbPos} state={bbPos === 'lower' ? 'bull' : bbPos === 'upper' ? 'bear' : 'neutral'} />
                    )}
                  </div>
                </div>

                {/* Order Flow group */}
                {(vwapPos != null || cvd != null || smc != null) && (
                  <div>
                    <p className="text-[8px] text-gray-700 uppercase tracking-wider mb-1">Order Flow</p>
                    <div className="flex flex-wrap gap-1">
                      {vwapPos != null && (
                        <Pill label="VWAP" value={vwapPos === 'above' ? '↑' : '↓'} state={vwapPos === 'above' ? 'bull' : 'bear'} />
                      )}
                      {cvd != null && (
                        <Pill label="CVD" value={cvd} state={cvd === 'bull' ? 'bull' : 'bear'} />
                      )}
                      {smc != null && (
                        <Pill label="SMC" value={smc} state={smc === 'bull' ? 'bull' : 'bear'} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2.5 mt-2 pt-1.5 border-t border-white/[0.03] text-[9px] text-gray-600">
              <span>KNN: <span className={knnColor}>{s.knn_class} {Number(s.knn_confidence).toFixed(1)}%</span></span>
              <span className="text-white/5">|</span>
              <span>Confluence: <span className="text-white font-mono">{Number(s.signal_strength).toFixed(2)}</span><span className="text-gray-700">/6</span></span>
              {signalType && (
                <>
                  <span className="text-white/5">|</span>
                  <span>Тип: <span className="text-white/40">{signalType}</span></span>
                </>
              )}
              {atrVal != null && (
                <>
                  <span className="text-white/5">|</span>
                  <span>ATR: <span className="text-white/40 font-mono">{atrVal.toFixed(4)}</span></span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace signals tab content with filter chips + SignalCard list**

Replace the entire signals tab content (lines 915-989) with:

```tsx
        {/* ---- Signals Tab ---- */}
        <TabsContent value="signals">
          {signalsLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : signals.length === 0 ? (
            <EmptyState message="Нет сигналов" />
          ) : (
            <SignalsList signals={signals} />
          )}
        </TabsContent>
```

- [ ] **Step 3: Add SignalsList component**

Above the `SignalCard` component, add:

```tsx
/** Signals list with filter chips */
function SignalsList({ signals }: { signals: TradeSignalResponse[] }) {
  const [filter, setFilter] = useState<SignalFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return signals;
    return signals.filter((s) => s.direction === filter);
  }, [signals, filter]);

  const longCount = signals.filter((s) => s.direction === 'long').length;
  const shortCount = signals.filter((s) => s.direction === 'short').length;

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
              filter === 'all'
                ? 'bg-white/[0.05] text-white border-white/[0.08]'
                : 'bg-transparent text-gray-500 border-transparent hover:border-white/[0.05]'
            }`}
          >
            Все ({signals.length})
          </button>
          <button
            onClick={() => setFilter('short')}
            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
              filter === 'short'
                ? 'bg-brand-loss/[0.06] text-brand-loss border-brand-loss/15'
                : 'bg-transparent text-gray-500 border-transparent hover:border-brand-loss/10'
            }`}
          >
            SHORT ({shortCount})
          </button>
          <button
            onClick={() => setFilter('long')}
            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
              filter === 'long'
                ? 'bg-brand-profit/[0.06] text-brand-profit border-brand-profit/15'
                : 'bg-transparent text-gray-500 border-transparent hover:border-brand-profit/10'
            }`}
          >
            LONG ({longCount})
          </button>
        </div>
        <span className="text-[9px] text-gray-600">
          Исполнено: <span className="text-brand-premium font-mono">{signals.filter((s) => s.was_executed).length}/{signals.length}</span>
        </span>
      </div>

      {/* Signal cards */}
      <div className="space-y-1">
        {filtered.map((s) => (
          <SignalCard key={s.id} signal={s} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/BotDetail.tsx
git commit -m "feat: redesign signals tab - expandable cards with indicator scorecard and filter chips"
```
