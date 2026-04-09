# Chart Module Research: lightweight-charts + React 18 + TypeScript

Date: 2026-04-10
Library: lightweight-charts (currently v4.2.2, latest v5.1.0)

---

## 1. CRITICAL DECISION: v4.2 vs v5 Upgrade

### Current State
- Project uses lightweight-charts ^4.2.2
- v4.2.3 is the last v4.x release (no more v4 updates)
- v5.1.0 is the latest stable (latest npm tag)

### v5 Adds Native Multi-Pane Support
v4 has NO native pane support - multi-pane requires multiple createChart() instances manually synced.
v5 adds paneIndex parameter to addSeries(), chart.panes(), PaneApi, chart.addPane().

### v4 to v5 Breaking Changes

| Area | v4 | v5 |
|------|----|----|
| Series creation | chart.addCandlestickSeries(opts) | chart.addSeries(CandlestickSeries, opts) |
| Series creation | chart.addLineSeries(opts) | chart.addSeries(LineSeries, opts) |
| Series creation | chart.addHistogramSeries(opts) | chart.addSeries(HistogramSeries, opts) |
| Imports | import { createChart } from lw-charts | import { createChart, CandlestickSeries, LineSeries } from lw-charts |
| Series markers | series.setMarkers([...]) | createSeriesMarkers(series, [...]) |
| Watermark | createChart(el, { watermark: {...} }) | createTextWatermark(chart.panes()[0], {...}) |
| Module format | CJS + ESM | ESM only (ES2020) |
| Bundle size | ~42kB | ~35kB (-16%) |
| Panes | Not supported | Native paneIndex param |
| Plugin types | ISeriesPrimitivePaneView | IPrimitivePaneView |

### RECOMMENDATION: Upgrade to v5.1.0

Reasons:
1. Native multi-pane eliminates 200+ lines of manual sync code
2. v4 is EOL - no more patches
3. Migration is mechanical (find-replace series creation methods)
4. 16% smaller bundle
5. lightweight-charts-react-components (v1.4.1, 106 stars, MIT) requires v5
6. lightweight-charts-indicators (v0.4.0, 88 stars) is version-agnostic (pure calculation)

Migration effort: ~2 hours for the existing TradingChart.tsx (single component, 209 lines).

---

## 2. lightweight-charts v5 API Reference

### 2.1 Chart Creation

```typescript
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries,
  AreaSeries, ColorType, CrosshairMode
} from "lightweight-charts";

const chart = createChart(container, {
  layout: {
    background: { type: ColorType.Solid, color: "#0d0d1a" },
    textColor: "#666",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
  },
  grid: {
    vertLines: { color: "#1a1a2e" },
    horzLines: { color: "#1a1a2e" },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: "#FFD700", width: 1, style: 3, labelBackgroundColor: "#FFD700" },
    horzLine: { color: "#FFD700", width: 1, style: 3, labelBackgroundColor: "#FFD700" },
  },
  rightPriceScale: { borderColor: "#2a2a3e" },
  timeScale: { borderColor: "#2a2a3e", timeVisible: true, secondsVisible: false },
});
```

### 2.2 Series Types (v5 syntax)

```typescript
// Candlestick (main pane)
const candles = chart.addSeries(CandlestickSeries, {
  upColor: "#00E676",
  downColor: "#FF1744",
  borderUpColor: "#00E676",
  borderDownColor: "#FF1744",
  wickUpColor: "#00E676",
  wickDownColor: "#FF1744",
});

// Line (for EMA overlay on pane 0)
const ema8 = chart.addSeries(LineSeries, {
  color: "#FFD700",
  lineWidth: 1,
  lastValueVisible: false,
  priceLineVisible: false,
});

// Histogram (volume overlay on pane 0)
const volume = chart.addSeries(HistogramSeries, {
  priceFormat: { type: "volume" },
  priceScaleId: "",
}, 0);
volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

// Histogram on separate pane (MACD)
const macdHist = chart.addSeries(HistogramSeries, { color: "#26A69A" }, 1);
```

### 2.3 Native Multi-Pane (v5)

```typescript
// Pane 0: Candles + overlays
const candles = chart.addSeries(CandlestickSeries, opts);     // pane 0
const ema = chart.addSeries(LineSeries, emaOpts);              // pane 0

// Pane 1: RSI - created automatically when paneIndex=1
const rsi = chart.addSeries(LineSeries, rsiOpts, 1);           // pane 1

// Pane 2: MACD - created automatically
const macdLine = chart.addSeries(LineSeries, macdLineOpts, 2); // pane 2
const signal = chart.addSeries(LineSeries, signalOpts, 2);     // pane 2
const hist = chart.addSeries(HistogramSeries, histOpts, 2);    // pane 2

// Control pane heights
const panes = chart.panes(); // PaneApi[]
panes[0].setHeight(400);     // Main chart
panes[1].setHeight(120);     // RSI
panes[2].setHeight(120);     // MACD

// PaneApi methods:
// pane.getHeight()       - current height px
// pane.paneIndex()       - index in layout
// pane.getSeries()       - all series in this pane
// pane.setHeight(height) - set height (min 30px)
// pane.moveTo(newIndex)  - reorder pane
// pane.getHTMLElement()  - DOM element
// series.moveToPane(idx) - move series to another pane
```

### 2.4 Series Markers (v5 - Buy/Sell Signals)

```typescript
import { createSeriesMarkers } from "lightweight-charts";

const markers = createSeriesMarkers(candleSeries, [
  {
    time: 1642425322,
    position: "belowBar",
    color: "#00E676",
    shape: "arrowUp",
    text: "BUY",
  },
  {
    time: 1642857322,
    position: "aboveBar",
    color: "#FF1744",
    shape: "arrowDown",
    text: "SELL",
  },
]);

// Update markers later:
markers.setMarkers(newMarkersArray);
```

### 2.5 Crosshair Events

```typescript
chart.subscribeCrosshairMove((param) => {
  if (!param.point || !param.time) return;
  const data = param.seriesData.get(candleSeries);
  if (data && "close" in data) {
    // Show OHLCV tooltip
  }
});

// Programmatic positioning
chart.setCrosshairPosition(price, time, series);
chart.clearCrosshairPosition();
```

### 2.6 TimeScale Sync (v4 multi-chart fallback only)

```typescript
let isSyncing = false;
chart1.timeScale().subscribeVisibleLogicalRangeChange(range => {
  if (isSyncing || !range) return;
  isSyncing = true;
  chart2.timeScale().setVisibleLogicalRange(range);
  isSyncing = false;
});
```

### 2.7 Crosshair Sync (v4 multi-chart fallback only)

```typescript
function getCrosshairDataPoint(series, param) {
  if (!param.time) return null;
  return param.seriesData.get(series) || null;
}

function syncCrosshair(chart, series, dataPoint) {
  if (dataPoint) {
    chart.setCrosshairPosition(dataPoint.value, dataPoint.time, series);
  } else {
    chart.clearCrosshairPosition();
  }
}

chart1.subscribeCrosshairMove(param => {
  syncCrosshair(chart2, series2, getCrosshairDataPoint(series1, param));
});
```

### 2.8 Cleanup

```typescript
chart.remove();           // Removes canvas, event listeners, internal state
ro.disconnect();          // ResizeObserver
chart.unsubscribeCrosshairMove(handler);
```

---

## 3. Indicator Calculation Library

### lightweight-charts-indicators v0.4.0

- GitHub: https://github.com/deepentropy/lightweight-charts-indicators
- Stars: 88
- License: MIT
- Peer deps: oakscriptjs ^0.2.0 (NO peer dep on lightweight-charts - pure calculation)
- Indicators: 446 total (82 standard + 317 community + 44 candlestick patterns)
- Install: npm install lightweight-charts-indicators oakscriptjs
- PineScript v6 compatible - validated against TradingView built-in indicators

### Key Indicators Available

**Moving Averages:** SMA, EMA, WMA, RMA, DEMA, TEMA, HMA, LSMA, ALMA, VWMA, SMMA, McGinley Dynamic
**Oscillators:** RSI, Stochastic, StochRSI, CCI, Williams %R, Awesome Oscillator, KDJ, WaveTrend
**Momentum:** MACD, Momentum, ROC, Squeeze Momentum, Impulse MACD
**Trend:** ADX, DMI, Ichimoku Cloud, Parabolic SAR, Supertrend, Aroon
**Volatility:** ATR, ADR, Bollinger Bands, Keltner Channels, Donchian Channels
**Volume:** OBV, MFI, PVT, Volume Oscillator, Chaikin Money Flow

### API Pattern

```typescript
import { EMA, RSI, MACD, BollingerBands, ATR, SMA } from "lightweight-charts-indicators";
import type { Bar } from "oakscriptjs";

const bars: Bar[] = klines.map(k => ({
  time: k.time, open: k.open, high: k.high,
  low: k.low, close: k.close, volume: k.volume,
}));

// All return { plots: { plot0: [{time, value}], plot1?: [...], ... } }
```

### 3.1 EMA (8/21/55) - Overlay on Main Pane

```typescript
const ema8 = EMA.calculate(bars, { len: 8, src: "close", offset: 0 });
const ema21 = EMA.calculate(bars, { len: 21, src: "close", offset: 0 });
const ema55 = EMA.calculate(bars, { len: 55, src: "close", offset: 0 });

const ema8Series = chart.addSeries(LineSeries, {
  color: "#FFD700", lineWidth: 1,
  lastValueVisible: false, priceLineVisible: false,
}, 0);
ema8Series.setData(ema8.plots.plot0);
```

### 3.2 RSI (14) - Separate Pane

```typescript
const rsi = RSI.calculate(bars, { length: 14, src: "close" });

const rsiSeries = chart.addSeries(LineSeries, {
  color: "#7E57C2", lineWidth: 2,
}, 1);
rsiSeries.setData(rsi.plots.plot0);

// 30/70 reference lines on pane 1
const times = bars.map(b => b.time);
const line70 = chart.addSeries(LineSeries, {
  color: "rgba(255,23,68,0.3)", lineWidth: 1, lineStyle: 2,
  lastValueVisible: false, priceLineVisible: false,
}, 1);
line70.setData(times.map(t => ({ time: t, value: 70 })));

const line30 = chart.addSeries(LineSeries, {
  color: "rgba(0,230,118,0.3)", lineWidth: 1, lineStyle: 2,
  lastValueVisible: false, priceLineVisible: false,
}, 1);
line30.setData(times.map(t => ({ time: t, value: 30 })));
```

### 3.3 MACD (12,26,9) - Separate Pane

```typescript
const macd = MACD.calculate(bars, {
  fastLength: 12, slowLength: 26, signalLength: 9, src: "close"
});
// plot0 = histogram, plot1 = MACD line, plot2 = signal line

const macdHist = chart.addSeries(HistogramSeries, { color: "#26A69A" }, 2);
macdHist.setData(macd.plots.plot0.map(p => ({
  time: p.time, value: p.value,
  color: p.value >= 0 ? "#26A69A" : "#EF5350",
})));

const macdLineSeries = chart.addSeries(LineSeries, {
  color: "#2962FF", lineWidth: 2,
  lastValueVisible: false, priceLineVisible: false,
}, 2);
macdLineSeries.setData(macd.plots.plot1);

const signalSeries = chart.addSeries(LineSeries, {
  color: "#FF6D00", lineWidth: 2,
  lastValueVisible: false, priceLineVisible: false,
}, 2);
signalSeries.setData(macd.plots.plot2);
```

### 3.4 Bollinger Bands (20,2) - Overlay on Main Pane

```typescript
const bb = BollingerBands.calculate(bars, {
  length: 20, maType: "SMA", src: "close", mult: 2, offset: 0
});
// plot0 = basis, plot1 = upper, plot2 = lower

const bbUpper = chart.addSeries(LineSeries, {
  color: "#787B86", lineWidth: 1,
  lastValueVisible: false, priceLineVisible: false,
}, 0);
bbUpper.setData(bb.plots.plot1);

const bbBasis = chart.addSeries(LineSeries, {
  color: "#FF6D00", lineWidth: 1,
  lastValueVisible: false, priceLineVisible: false,
}, 0);
bbBasis.setData(bb.plots.plot0);

const bbLower = chart.addSeries(LineSeries, {
  color: "#787B86", lineWidth: 1,
  lastValueVisible: false, priceLineVisible: false,
}, 0);
bbLower.setData(bb.plots.plot2);
```

### 3.5 ATR (14)

```typescript
const atr = ATR.calculate(bars, { length: 14, maType: "RMA" });
// Preferred: display latest value in tooltip/info panel
// atr.plots.plot0[atr.plots.plot0.length - 1].value
```

---

## 4. Where to Calculate Indicators

### RECOMMENDATION: Frontend (lightweight-charts-indicators)

- Zero backend changes needed
- Instant recalculation on timeframe change
- ~50ms for 1000 bars with 5 indicators (pure JS)
- For 500-2000 candles (our typical load), <10ms per indicator
- Reserve Web Worker for future optimization if >10K candles needed
- Backend calculation adds latency per indicator toggle - unnecessary

---

## 5. Multi-Pane Layout

### With v5 (Native Panes) -- RECOMMENDED

Single createChart() call. Series assigned to panes via paneIndex parameter.
Crosshair and timeScale automatically synced (single chart instance).
Pane heights via PaneApi.setHeight().

**No manual crosshair sync. No manual timeScale sync.**
Eliminates ~200+ lines of v4 multi-chart boilerplate.

### With v4 (Multiple Chart Instances) -- FALLBACK ONLY

Requires: multiple createChart() instances, manual range sync, manual crosshair sync, infinite-loop guards, hidden time axes on upper panes, shared ResizeObserver.

---

## 6. Performance Best Practices

1. **Real-time:** Use series.update() for streaming, NOT setData() on every tick
2. **Timeframe change:** Clear series with setData(newData), do NOT destroy/recreate chart
3. **Cleanup:** chart.remove(), ResizeObserver.disconnect(), unsubscribeCrosshairMove()
4. **React 18 strict mode:** useRef to guard against double-mount, set null in cleanup
5. **10K+ candles:** lightweight-charts handles natively (canvas virtual rendering)
6. **Resize:** ResizeObserver on container, NOT window resize event

---

## 7. Proposed Component Architecture

```
components/charts/
  TradingChart.tsx          -- Main wrapper, creates chart, manages lifecycle
  hooks/
    useChart.ts             -- createChart + cleanup + resize
    useIndicators.ts        -- Calculate indicators from kline data
    useCrosshairSync.ts     -- Tooltip data from crosshairMove
  types.ts                  -- KlineData, IndicatorConfig, etc.
  constants.ts              -- Colors, default options
```

---

## 8. Migration Checklist (v4.2.2 -> v5.1.0)

1. npm install lightweight-charts@5.1.0
2. Update imports: add CandlestickSeries, LineSeries, HistogramSeries
3. chart.addCandlestickSeries(opts) -> chart.addSeries(CandlestickSeries, opts)
4. chart.addHistogramSeries(opts) -> chart.addSeries(HistogramSeries, opts)
5. chart.addLineSeries(opts) -> chart.addSeries(LineSeries, opts)
6. series.setMarkers([...]) -> createSeriesMarkers(series, [...]) if used
7. Update TypeScript types if needed
8. Test: verify chart renders, candles, volume overlay
9. Add paneIndex params for indicator panes

---

## 9. Dependencies to Install

```bash
npm install lightweight-charts@5.1.0
npm install lightweight-charts-indicators oakscriptjs
```

---

## 10. Sources

- Official docs: https://tradingview.github.io/lightweight-charts/
- v4 to v5 migration: https://tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5
- v5 breaking changes: https://github.com/tradingview/lightweight-charts/issues/1791
- Panes tutorial: https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes
- Crosshair sync: https://tradingview.github.io/lightweight-charts/tutorials/how_to/set-crosshair-position
- React advanced: https://tradingview.github.io/lightweight-charts/tutorials/react/advanced
- Indicators lib: https://github.com/deepentropy/lightweight-charts-indicators
- React components: https://github.com/ukorvl/lightweight-charts-react-components
- Release notes: https://tradingview.github.io/lightweight-charts/docs/release-notes
