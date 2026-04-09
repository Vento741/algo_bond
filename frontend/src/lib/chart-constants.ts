import type { IndicatorDefinition, ChartTheme } from './chart-types';

/** Палитра AlgoBond */
export const CHART_COLORS = {
  bg: '#0d0d1a',
  card: '#1a1a2e',
  grid: 'rgba(255,255,255,0.04)',
  border: '#2a2a3e',
  crosshair: '#FFD700',
  up: '#00E676',
  down: '#FF1744',
  volumeUp: 'rgba(0,230,118,0.35)',
  volumeDown: 'rgba(255,23,68,0.35)',
  premium: '#FFD700',
  accent: '#4488ff',
  text: '#8a8a9a',
  textLight: '#999',
} as const;

/** Тема графика AlgoBond */
export const CHART_THEME: ChartTheme = {
  background: CHART_COLORS.bg,
  textColor: CHART_COLORS.text,
  gridColor: CHART_COLORS.grid,
  borderColor: CHART_COLORS.border,
  crosshairColor: CHART_COLORS.crosshair,
  upColor: CHART_COLORS.up,
  downColor: CHART_COLORS.down,
  volumeUpColor: CHART_COLORS.volumeUp,
  volumeDownColor: CHART_COLORS.volumeDown,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
};

/** Реестр доступных индикаторов */
export const INDICATOR_REGISTRY: IndicatorDefinition[] = [
  // --- Overlays (pane 0) ---
  {
    id: 'ema8',
    label: 'EMA 8',
    group: 'overlay',
    paneIndex: 0,
    colors: ['#FFD700'],
    defaultParams: { period: 8 },
  },
  {
    id: 'ema21',
    label: 'EMA 21',
    group: 'overlay',
    paneIndex: 0,
    colors: ['#00BCD4'],
    defaultParams: { period: 21 },
  },
  {
    id: 'ema55',
    label: 'EMA 55',
    group: 'overlay',
    paneIndex: 0,
    colors: ['#CE93D8'],
    defaultParams: { period: 55 },
  },
  {
    id: 'bbands',
    label: 'Bollinger Bands',
    group: 'overlay',
    paneIndex: 0,
    colors: ['#FF6D00', '#787B86', '#787B86'],
    defaultParams: { period: 20, mult: 2 },
  },
  // --- Oscillators (pane 2 - radio behavior) ---
  {
    id: 'rsi',
    label: 'RSI',
    group: 'oscillator',
    paneIndex: 2,
    colors: ['#B39DDB'],
    defaultParams: { period: 14 },
  },
  {
    id: 'macd',
    label: 'MACD',
    group: 'oscillator',
    paneIndex: 2,
    colors: ['#2962FF', '#FF6D00', '#26A69A'],
    defaultParams: { fast: 12, slow: 26, signal: 9 },
  },
];

/** Доступные таймфреймы */
export const INTERVALS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
  { value: 'D', label: '1D' },
] as const;
