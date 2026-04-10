/**
 * Общие компоненты и типы для редактирования конфигурации стратегий.
 * Используется в StrategyDetail (диалог) и Backtest (инлайн-редактор).
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ================================================================
   Типы конфигурации стратегии
   ================================================================ */

export interface KnnConfig {
  neighbors: number;
  lookback: number;
  weight: number;
  rsi_period: number;
  wt_ch_len: number;
  wt_avg_len: number;
  cci_period: number;
  adx_period: number;
}

export interface TrendConfig {
  ema_fast: number;
  ema_slow: number;
  ema_filter: number;
}

export interface RibbonConfig {
  use: boolean;
  type: string;
  mas: number[];
  threshold: number;
}

export interface OrderFlowConfig {
  use: boolean;
  cvd_period: number;
  cvd_threshold: number;
}

export interface SmcConfig {
  use: boolean;
  fvg_min_size: number;
  liquidity_lookback: number;
  bos_pivot: number;
}

export interface RiskConfig {
  atr_period: number;
  stop_atr_mult: number;
  tp_atr_mult: number;
  use_trailing: boolean;
  trailing_atr_mult: number;
  use_multi_tp: boolean;
  tp_levels: { atr_mult: number; close_pct: number }[];
  use_breakeven: boolean;
  min_bars_trailing: number;
  cooldown_bars: number;
}

export interface FiltersConfig {
  adx_period: number;
  adx_threshold: number;
  volume_mult: number;
  min_confluence: number;
}

export interface BacktestConfig {
  order_size: number;
  commission: number;
  slippage: number;
  use_supertrend_exit: boolean;
}

export interface LiveConfig {
  order_size: number;
  leverage: number;
  on_reverse: string;
}

export interface HybridConfig {
  knn_min_confidence: number;
  knn_min_score: number;
  use_knn_direction: boolean;
  knn_boost_threshold: number;
  knn_boost_mult: number;
}

export interface SuperTrendConfig {
  st1_period: number;
  st1_mult: number;
  st2_period: number;
  st2_mult: number;
  st3_period: number;
  st3_mult: number;
  min_agree: number;
}

export interface SqueezeConfig {
  use: boolean;
  bb_period: number;
  bb_mult: number;
  kc_period: number;
  kc_mult: number;
  mom_period: number;
  min_duration: number;
  duration_norm: number;
  max_weight: number;
}

export interface EntryConfig {
  rsi_period: number;
  rsi_long_max: number;
  rsi_short_min: number;
  use_volume: boolean;
  volume_mult: number;
}

export interface TrendFilterConfig {
  ema_period: number;
  use_adx: boolean;
  adx_period: number;
  adx_threshold: number;
}

export interface TimeFilterConfig {
  use: boolean;
  block_start_utc: number;
  block_end_utc: number;
}

export interface RegimeConfig {
  use: boolean;
  adx_ranging: number;
  atr_high_vol_pct: number;
  vol_scale: number;
  skip_ranging: boolean;
}

export interface FullStrategyConfig {
  knn: KnnConfig;
  trend: TrendConfig;
  ribbon: RibbonConfig;
  order_flow: OrderFlowConfig;
  smc: SmcConfig;
  risk: RiskConfig;
  filters: FiltersConfig;
  backtest: BacktestConfig;
  live: LiveConfig;
  hybrid: HybridConfig;
  supertrend: SuperTrendConfig;
  squeeze: SqueezeConfig;
  entry: EntryConfig;
  trend_filter: TrendFilterConfig;
  time_filter: TimeFilterConfig;
  regime: RegimeConfig;
}

/* ================================================================
   Дефолтные значения
   ================================================================ */

export const DEFAULT_CONFIG: FullStrategyConfig = {
  knn: {
    neighbors: 8,
    lookback: 50,
    weight: 0.5,
    rsi_period: 15,
    wt_ch_len: 10,
    wt_avg_len: 21,
    cci_period: 20,
    adx_period: 14,
  },
  trend: {
    ema_fast: 26,
    ema_slow: 50,
    ema_filter: 200,
  },
  ribbon: {
    use: true,
    type: "EMA",
    mas: [9, 14, 21, 35, 55, 89, 144, 233],
    threshold: 4,
  },
  order_flow: {
    use: true,
    cvd_period: 20,
    cvd_threshold: 0.7,
  },
  smc: {
    use: true,
    fvg_min_size: 0.5,
    liquidity_lookback: 20,
    bos_pivot: 5,
  },
  risk: {
    atr_period: 14,
    stop_atr_mult: 2,
    tp_atr_mult: 30,
    use_trailing: true,
    trailing_atr_mult: 10,
    use_multi_tp: false,
    tp_levels: [
      { atr_mult: 5, close_pct: 50 },
      { atr_mult: 10, close_pct: 50 },
    ],
    use_breakeven: true,
    min_bars_trailing: 5,
    cooldown_bars: 10,
  },
  filters: {
    adx_period: 15,
    adx_threshold: 10,
    volume_mult: 1,
    min_confluence: 3.0,
  },
  backtest: {
    order_size: 75,
    commission: 0.05,
    slippage: 0,
    use_supertrend_exit: false,
  },
  live: {
    order_size: 30,
    leverage: 1,
    on_reverse: "ignore",
  },
  hybrid: {
    knn_min_confidence: 55,
    knn_min_score: 0.1,
    use_knn_direction: true,
    knn_boost_threshold: 75,
    knn_boost_mult: 1.3,
  },
  supertrend: {
    st1_period: 10,
    st1_mult: 1.0,
    st2_period: 11,
    st2_mult: 3.0,
    st3_period: 10,
    st3_mult: 7.0,
    min_agree: 2,
  },
  squeeze: {
    use: true,
    bb_period: 20,
    bb_mult: 2.0,
    kc_period: 20,
    kc_mult: 1.5,
    mom_period: 20,
    min_duration: 0,
    duration_norm: 30,
    max_weight: 1.0,
  },
  entry: {
    rsi_period: 14,
    rsi_long_max: 40,
    rsi_short_min: 60,
    use_volume: true,
    volume_mult: 1.0,
  },
  trend_filter: {
    ema_period: 200,
    use_adx: true,
    adx_period: 14,
    adx_threshold: 25,
  },
  time_filter: {
    use: false,
    block_start_utc: 2,
    block_end_utc: 7,
  },
  regime: {
    use: false,
    adx_ranging: 20,
    atr_high_vol_pct: 75,
    vol_scale: 1.5,
    skip_ranging: true,
  },
};

/* ================================================================
   Константы
   ================================================================ */

export const RIBBON_TYPES = [
  { value: "EMA", label: "EMA" },
  { value: "SMA", label: "SMA" },
];

export const ON_REVERSE_OPTIONS = [
  { value: "ignore", label: "Игнорировать" },
  { value: "close", label: "Закрыть позицию" },
  { value: "reverse", label: "Развернуть позицию" },
];

export const ENGINE_SECTIONS: Record<string, (keyof FullStrategyConfig)[]> = {
  lorentzian_knn: [
    "knn",
    "trend",
    "ribbon",
    "order_flow",
    "smc",
    "risk",
    "filters",
    "backtest",
    "live",
  ],
  supertrend_squeeze: [
    "supertrend",
    "squeeze",
    "entry",
    "trend_filter",
    "risk",
    "regime",
    "time_filter",
    "backtest",
    "live",
  ],
  hybrid_knn_supertrend: [
    "hybrid",
    "knn",
    "supertrend",
    "squeeze",
    "entry",
    "trend_filter",
    "risk",
    "regime",
    "time_filter",
    "backtest",
    "live",
  ],
};

/* ================================================================
   Утилиты
   ================================================================ */

export function mergeConfig(
  defaults: FullStrategyConfig,
  source: Record<string, unknown>,
): FullStrategyConfig {
  const result = structuredClone(defaults);
  for (const sectionKey of Object.keys(
    defaults,
  ) as (keyof FullStrategyConfig)[]) {
    const srcSection = source[sectionKey];
    if (
      srcSection &&
      typeof srcSection === "object" &&
      !Array.isArray(srcSection)
    ) {
      const defaultSection = result[sectionKey] as unknown as Record<
        string,
        unknown
      >;
      const sourceSection = srcSection as Record<string, unknown>;
      for (const key of Object.keys(defaultSection)) {
        if (key in sourceSection) {
          defaultSection[key] = sourceSection[key];
        }
      }
    }
  }
  return result;
}

export function detectEngineType(config: Record<string, unknown>): string {
  const hasKnn = "knn" in config;
  const hasSupertrend = "supertrend" in config;
  const hasHybrid = "hybrid" in config;
  if (hasHybrid || (hasKnn && hasSupertrend)) return "hybrid_knn_supertrend";
  if (hasSupertrend) return "supertrend_squeeze";
  return "lorentzian_knn";
}

export function getCleanConfig(
  config: FullStrategyConfig,
  engineType: string,
): Record<string, unknown> {
  const sections = ENGINE_SECTIONS[engineType] || Object.keys(config);
  const clean: Record<string, unknown> = {};
  for (const key of sections) {
    if (key in config) {
      clean[key] = config[key as keyof FullStrategyConfig];
    }
  }
  return clean;
}

/* ================================================================
   Компоненты полей
   ================================================================ */

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: NumberFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-400">
        {label}
        {suffix && <span className="text-gray-600 ml-1">{suffix}</span>}
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="h-8 bg-white/5 border-white/10 text-white font-mono text-sm"
      />
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function ToggleField({ label, value, onChange }: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <Label className="text-xs text-gray-400">{label}</Label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full
          border border-white/10 transition-colors
          ${value ? "bg-brand-profit/30" : "bg-white/5"}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 rounded-full
            shadow-sm transition-transform
            ${value ? "translate-x-4 bg-brand-profit" : "translate-x-0 bg-gray-500"}
          `}
        />
      </button>
    </div>
  );
}

interface MasArrayFieldProps {
  value: number[];
  onChange: (v: number[]) => void;
}

export function MasArrayField({ value, onChange }: MasArrayFieldProps) {
  const handleChange = (index: number, num: number) => {
    const next = [...value];
    next[index] = num;
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-400">Периоды MA (8 значений)</Label>
      <div className="grid grid-cols-4 gap-2">
        {value.map((v, i) => (
          <Input
            key={i}
            type="number"
            value={v}
            onChange={(e) => handleChange(i, Number(e.target.value))}
            min={1}
            className="h-8 bg-white/5 border-white/10 text-white font-mono text-sm"
          />
        ))}
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div>
          <span className="text-sm font-medium text-white">{title}</span>
          <span className="block text-xs text-gray-400 mt-0.5">
            {description}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
