# Risk/Reward Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Risk/Reward card between Stats Strip and Live Position Card on the bot detail page, showing potential profit vs risk with visual bar.

**Architecture:** Pure frontend change - new `RiskRewardCard` component inside `BotDetail.tsx`. All data already available in `PositionResponse`. Component receives open position and last closed position, computes R/R ratio and dollar amounts client-side.

**Tech Stack:** React 18, TypeScript, shadcn/ui Card, Tailwind CSS, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-04-09-risk-reward-card-design.md`

---

### Task 1: Compute lastClosedPosition and pass to RiskRewardCard placeholder

**Files:**
- Modify: `frontend/src/pages/BotDetail.tsx:626-628` (add lastClosedPosition memo)
- Modify: `frontend/src/pages/BotDetail.tsx:864-869` (insert RiskRewardCard between stats strip and position card)

- [ ] **Step 1: Add `lastClosedPosition` memo**

After the existing `openPosition` memo (line 626-628), add:

```typescript
const lastClosedPosition = useMemo(
  () => {
    const closed = positions
      .filter((p) => p.status === 'closed')
      .sort((a, b) => new Date(b.closed_at ?? 0).getTime() - new Date(a.closed_at ?? 0).getTime());
    return closed[0] ?? null;
  },
  [positions],
);
```

- [ ] **Step 2: Add RiskRewardCard placeholder between stats strip and position card**

Between the Stats Strip `</Card>` (line 864) and the `{/* ---- Live Position Card ---- */}` comment (line 866), insert:

```tsx
{/* ---- Risk/Reward Card ---- */}
<RiskRewardCard
  openPosition={openPosition}
  lastClosedPosition={lastClosedPosition}
/>
```

- [ ] **Step 3: Add minimal RiskRewardCard stub component**

Above the `LivePositionCard` function (line 1405), add:

```tsx
function RiskRewardCard({
  openPosition,
  lastClosedPosition,
}: {
  openPosition: PositionResponse | null;
  lastClosedPosition: PositionResponse | null;
}) {
  const position = openPosition ?? lastClosedPosition;
  if (!position) return null;

  return (
    <Card className="border-white/5 bg-white/[0.02]">
      <CardContent className="px-5 py-3">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Risk / Reward</span>
        <span className="text-lg font-bold font-mono text-brand-premium ml-3">TODO</span>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Verify placeholder renders**

Run: `cd frontend && npm run dev`
Open bot detail page - verify "Risk / Reward TODO" card appears between stats strip and position card.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/BotDetail.tsx
git commit -m "feat: add RiskRewardCard placeholder between stats strip and position card"
```

---

### Task 2: Implement R/R calculation logic

**Files:**
- Modify: `frontend/src/pages/BotDetail.tsx` (RiskRewardCard component)

- [ ] **Step 1: Replace RiskRewardCard stub with full calculation logic**

Replace the entire `RiskRewardCard` function with:

```tsx
function RiskRewardCard({
  openPosition,
  lastClosedPosition,
}: {
  openPosition: PositionResponse | null;
  lastClosedPosition: PositionResponse | null;
}) {
  const position = openPosition ?? lastClosedPosition;
  if (!position) return null;

  const isLastClosed = !openPosition && !!lastClosedPosition;

  const entryPrice = Number(position.entry_price);
  const stopLoss = Number(position.stop_loss);
  const quantity = Number(position.quantity);
  const side = position.side;

  const tp1Price = position.tp1_price ? Number(position.tp1_price) : null;
  const tp2Price = position.tp2_price ? Number(position.tp2_price) : null;
  const tp1Hit = position.tp1_hit;

  // Single TP fallback
  const singleTp = Number(position.take_profit);

  // Determine active TP for R/R ratio
  const hasMultiTp = tp1Price != null;
  const activeTpPrice = hasMultiTp
    ? (tp1Hit ? (tp2Price ?? tp1Price!) : tp1Price!)
    : singleTp;

  // Calculate dollar amounts based on side
  const riskPerUnit = side === 'long'
    ? entryPrice - stopLoss
    : stopLoss - entryPrice;
  const rewardTp1PerUnit = tp1Price != null
    ? (side === 'long' ? tp1Price - entryPrice : entryPrice - tp1Price)
    : (side === 'long' ? singleTp - entryPrice : entryPrice - singleTp);
  const rewardTp2PerUnit = tp2Price != null
    ? (side === 'long' ? tp2Price - entryPrice : entryPrice - tp2Price)
    : null;
  const rewardActivePerUnit = side === 'long'
    ? activeTpPrice - entryPrice
    : entryPrice - activeTpPrice;

  const risk = Math.abs(riskPerUnit * quantity);
  const rewardTp1 = Math.abs(rewardTp1PerUnit * quantity);
  const rewardTp2 = rewardTp2PerUnit != null ? Math.abs(rewardTp2PerUnit * quantity) : null;
  const rewardActive = Math.abs(rewardActivePerUnit * quantity);

  const rrRatio = risk > 0 ? rewardActive / risk : 0;

  // Bar percentages
  const totalRange = risk + rewardActive;
  const riskPct = totalRange > 0 ? (risk / totalRange) * 100 : 50;
  const rewardPct = 100 - riskPct;

  // TP1 position on bar (for multi-TP marker)
  const tp1BarPct = hasMultiTp && rewardTp2 != null && totalRange > 0
    ? ((risk + rewardTp1) / (risk + rewardTp2)) * 100
    : null;

  return (
    <Card className="border-white/5 bg-white/[0.02]">
      <CardContent className="px-5 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Risk / Reward</span>
            {isLastClosed && (
              <span className="text-[9px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded">
                Последняя сделка
              </span>
            )}
          </div>
          <span className="text-[22px] font-bold font-mono text-brand-premium">
            1 : {rrRatio.toFixed(1)}
          </span>
        </div>

        {/* Target cards */}
        <div className="flex gap-3 mb-3">
          {/* TP1 card */}
          <div className={`flex-1 px-3 py-2 rounded-md border ${
            hasMultiTp
              ? tp1Hit
                ? 'bg-white/[0.02] border-white/[0.04]'
                : 'bg-brand-profit/[0.03] border-brand-profit/[0.08]'
              : 'bg-brand-profit/[0.03] border-brand-profit/[0.08]'
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[9px] uppercase ${
                hasMultiTp
                  ? tp1Hit ? 'text-gray-500' : 'text-brand-profit'
                  : 'text-brand-profit'
              }`}>
                {hasMultiTp ? 'Цель TP1' : 'Цель (TP)'}
              </span>
              {hasMultiTp && (
                <span className={`text-[8px] font-mono ${tp1Hit ? 'text-brand-profit/40' : 'text-brand-profit/30'}`}>
                  {tp1Hit ? 'исполнен' : 'активный'}
                </span>
              )}
            </div>
            <div className={`font-bold text-lg font-mono ${tp1Hit ? 'text-gray-500 line-through' : 'text-brand-profit'}`}>
              +${rewardTp1.toFixed(2)}
            </div>
            <div className={`text-[9px] font-mono ${tp1Hit ? 'text-gray-600' : 'text-brand-profit/30'}`}>
              &rarr; {formatPrice(hasMultiTp ? tp1Price! : singleTp)}
            </div>
          </div>

          {/* TP2 card (only if multi-TP) */}
          {hasMultiTp && rewardTp2 != null && tp2Price != null && (
            <div className={`flex-1 px-3 py-2 rounded-md border ${
              tp1Hit
                ? 'bg-brand-profit/[0.03] border-brand-profit/[0.08]'
                : 'bg-white/[0.02] border-white/[0.04]'
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-[9px] uppercase ${tp1Hit ? 'text-brand-profit' : 'text-gray-500'}`}>
                  Цель TP2
                </span>
                <span className={`text-[8px] font-mono ${tp1Hit ? 'text-brand-profit/30' : 'text-white/15'}`}>
                  {tp1Hit ? 'активный' : 'следующий'}
                </span>
              </div>
              <div className={`font-bold text-lg font-mono ${tp1Hit ? 'text-brand-profit' : 'text-gray-500'}`}>
                +${rewardTp2.toFixed(2)}
              </div>
              <div className={`text-[9px] font-mono ${tp1Hit ? 'text-brand-profit/30' : 'text-white/20'}`}>
                &rarr; {formatPrice(tp2Price)}
              </div>
            </div>
          )}

          {/* Risk card */}
          <div className="flex-1 px-3 py-2 rounded-md border bg-brand-loss/[0.03] border-brand-loss/[0.08]">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[9px] text-brand-loss uppercase">Риск (SL)</span>
            </div>
            <div className="font-bold text-lg font-mono text-brand-loss">
              -${risk.toFixed(2)}
            </div>
            <div className="text-[9px] font-mono text-brand-loss/30">
              &rarr; {formatPrice(stopLoss)}
            </div>
          </div>
        </div>

        {/* R/R visual bar */}
        <div>
          <div className="relative">
            <div className="flex h-[6px] rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-brand-loss to-brand-loss/50"
                style={{ width: `${riskPct}%` }}
              />
              <div
                className="bg-gradient-to-r from-brand-profit/50 to-brand-profit"
                style={{ width: `${rewardPct}%` }}
              />
            </div>
            {/* TP1 marker on bar (multi-TP only) */}
            {tp1BarPct != null && (
              <div
                className="absolute top-[-2px] w-[2px] h-[10px] bg-brand-profit/40 rounded-sm"
                style={{ left: `${tp1BarPct}%` }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[8px] font-mono text-brand-loss/40">SL</span>
            {tp1BarPct != null && (
              <span className="text-[8px] font-mono text-brand-profit/30">TP1</span>
            )}
            <span className="text-[8px] font-mono text-brand-profit/50">
              {hasMultiTp && rewardTp2 != null ? 'TP2' : 'TP'}
            </span>
          </div>
          <div className="text-center mt-1">
            <span className="text-[9px] text-gray-600">
              $1 риска &rarr; ${rrRatio.toFixed(2)} прибыли
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify component renders correctly**

Run: `cd frontend && npm run dev`
Open bot detail page with an open position. Verify:
- R/R ratio displayed in gold
- TP1/TP2/Risk cards shown with correct dollar amounts
- Visual bar with correct proportions
- Stop bot and verify "Последняя сделка" badge appears

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/BotDetail.tsx
git commit -m "feat: implement RiskRewardCard with R/R calculation, multi-TP support, and visual bar"
```

---

### Task 3: Handle edge cases and polish

**Files:**
- Modify: `frontend/src/pages/BotDetail.tsx` (RiskRewardCard component)

- [ ] **Step 1: Add import for Shield icon**

In the lucide-react import block (line 11-33), add `Shield` to the imports:

```typescript
import {
  ArrowLeft,
  Bot,
  Play,
  Square,
  TrendingUp,
  TrendingDown,
  Activity,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Filter,
  Info,
  AlertTriangle,
  XCircle,
  Bug,
  Loader2,
  AlertCircle,
  Hash,
  BarChart3,
  Wifi,
  WifiOff,
  Target,
  LineChart,
  Shield,
} from 'lucide-react';
```

- [ ] **Step 2: Add Shield icon to card header**

In the RiskRewardCard header section, add the icon before the label:

Replace:
```tsx
<span className="text-[10px] text-gray-500 uppercase tracking-wider">Risk / Reward</span>
```

With:
```tsx
<Shield className="h-3.5 w-3.5 text-brand-premium/60" />
<span className="text-[10px] text-gray-500 uppercase tracking-wider">Risk / Reward</span>
```

- [ ] **Step 3: Guard against zero/negative values**

In the RiskRewardCard, after the `risk` and `rewardActive` calculations, add guards. Replace the line:

```tsx
const rrRatio = risk > 0 ? rewardActive / risk : 0;
```

With:

```tsx
// Guard: if SL or TP are not set properly, don't show the card
if (risk <= 0 || rewardActive <= 0) return null;

const rrRatio = rewardActive / risk;
```

- [ ] **Step 4: Verify edge cases**

Run: `cd frontend && npm run dev`
- Position with `stop_loss = 0` or `take_profit = 0` should not show the card
- Normal position should display correctly

- [ ] **Step 5: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/BotDetail.tsx
git commit -m "feat: add Shield icon and edge case guards to RiskRewardCard"
```
