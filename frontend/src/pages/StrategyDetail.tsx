import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Brain,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Settings,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SymbolSearch } from '@/components/ui/symbol-search';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import api from '@/lib/api';
import type {
  StrategyDetail as StrategyDetailType,
  StrategyConfig,
  StrategyConfigCreate,
  StrategyConfigUpdate,
} from '@/types/api';

/* ================================================================
   Типы конфигурации стратегии
   ================================================================ */

interface KnnConfig {
  neighbors: number;
  lookback: number;
  weight: number;
  rsi_period: number;
  wt_ch_len: number;
  wt_avg_len: number;
  cci_period: number;
  adx_period: number;
}

interface TrendConfig {
  ema_fast: number;
  ema_slow: number;
  ema_filter: number;
}

interface RibbonConfig {
  use: boolean;
  type: string;
  mas: number[];
  threshold: number;
}

interface OrderFlowConfig {
  use: boolean;
  cvd_period: number;
  cvd_threshold: number;
}

interface SmcConfig {
  use: boolean;
  fvg_min_size: number;
  liquidity_lookback: number;
  bos_pivot: number;
}

interface RiskConfig {
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

interface FiltersConfig {
  adx_period: number;
  adx_threshold: number;
  volume_mult: number;
  min_confluence: number;
}

interface BacktestConfig {
  order_size: number;
  commission: number;
}

interface LiveConfig {
  order_size: number;
  leverage: number;
}

interface FullStrategyConfig {
  knn: KnnConfig;
  trend: TrendConfig;
  ribbon: RibbonConfig;
  order_flow: OrderFlowConfig;
  smc: SmcConfig;
  risk: RiskConfig;
  filters: FiltersConfig;
  backtest: BacktestConfig;
  live: LiveConfig;
}

/* ================================================================
   Дефолтные значения
   ================================================================ */

const DEFAULT_CONFIG: FullStrategyConfig = {
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
    type: 'EMA',
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
  },
  live: {
    order_size: 30,
    leverage: 1,
  },
};


const TIMEFRAMES = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
];

const RIBBON_TYPES = [
  { value: 'EMA', label: 'EMA' },
  { value: 'SMA', label: 'SMA' },
];

/* ================================================================
   Утилита: deep merge конфигов
   ================================================================ */

function mergeConfig(
  defaults: FullStrategyConfig,
  source: Record<string, unknown>,
): FullStrategyConfig {
  const result = structuredClone(defaults);
  for (const sectionKey of Object.keys(defaults) as (keyof FullStrategyConfig)[]) {
    const srcSection = source[sectionKey];
    if (srcSection && typeof srcSection === 'object' && !Array.isArray(srcSection)) {
      const defaultSection = result[sectionKey] as unknown as Record<string, unknown>;
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

/* ================================================================
   Collapsible секция
   ================================================================ */

interface CollapsibleSectionProps {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
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
          <span className="block text-xs text-gray-400 mt-0.5">{description}</span>
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

/* ================================================================
   NumberField — числовой инпут с label
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

function NumberField({
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

/* ================================================================
   ToggleField — переключатель boolean
   ================================================================ */

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleField({ label, value, onChange }: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <Label className="text-xs text-gray-400">{label}</Label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full
          border border-white/10 transition-colors
          ${value ? 'bg-brand-profit/30' : 'bg-white/5'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 rounded-full
            shadow-sm transition-transform
            ${value ? 'translate-x-4 bg-brand-profit' : 'translate-x-0 bg-gray-500'}
          `}
        />
      </button>
    </div>
  );
}

/* ================================================================
   MasArrayField — массив MA периодов
   ================================================================ */

interface MasArrayFieldProps {
  value: number[];
  onChange: (v: number[]) => void;
}

function MasArrayField({ value, onChange }: MasArrayFieldProps) {
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

/* ================================================================
   ConfigEditorDialog
   ================================================================ */

interface ConfigEditorDialogProps {
  open: boolean;
  onClose: () => void;
  strategyId: string;
  defaultConfig: Record<string, unknown>;
  editingConfig: StrategyConfig | null;
  onSaved: () => void;
}

function ConfigEditorDialog({
  open,
  onClose,
  strategyId,
  defaultConfig,
  editingConfig,
  onSaved,
}: ConfigEditorDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Основные поля
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('RIVERUSDT');
  const [timeframe, setTimeframe] = useState('5');

  // Секции конфига
  const [config, setConfig] = useState<FullStrategyConfig>(DEFAULT_CONFIG);

  // Инициализация при открытии
  useEffect(() => {
    if (!open) return;
    if (editingConfig) {
      setName(editingConfig.name);
      setSymbol(editingConfig.symbol);
      setTimeframe(editingConfig.timeframe);
      setConfig(mergeConfig(DEFAULT_CONFIG, editingConfig.config));
    } else {
      setName('');
      setSymbol('RIVERUSDT');
      setTimeframe('5');
      setConfig(mergeConfig(DEFAULT_CONFIG, defaultConfig));
    }
  }, [open, editingConfig, defaultConfig]);

  // Обновление вложенных секций
  const updateSection = <K extends keyof FullStrategyConfig>(
    section: K,
    patch: Partial<FullStrategyConfig[K]>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast('Введите название конфигурации', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingConfig) {
        const payload: StrategyConfigUpdate = {
          name: name.trim(),
          symbol,
          timeframe,
          config: config as unknown as Record<string, unknown>,
        };
        await api.patch(`/strategies/configs/${editingConfig.id}`, payload);
        toast('Конфигурация обновлена', 'success');
      } else {
        const payload: StrategyConfigCreate = {
          strategy_id: strategyId,
          name: name.trim(),
          symbol,
          timeframe,
          config: config as unknown as Record<string, unknown>,
        };
        await api.post('/strategies/configs', payload);
        toast('Конфигурация создана', 'success');
      }
      onSaved();
      onClose();
    } catch {
      toast('Ошибка сохранения конфигурации', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader onClose={onClose}>
          <DialogTitle>
            {editingConfig ? 'Редактировать конфигурацию' : 'Создать конфигурацию'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Секция 1: Основные */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-brand-premium">Основные</h3>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-400">Название</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Мой конфиг RIVER 5m"
                className="h-9 bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Символ</Label>
                <SymbolSearch
                  value={symbol}
                  onChange={setSymbol}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Таймфрейм</Label>
                <Select
                  options={TIMEFRAMES}
                  value={timeframe}
                  onChange={setTimeframe}
                />
              </div>
            </div>
          </div>

          {/* Секция 2: KNN */}
          <CollapsibleSection
            title="KNN"
            description="Параметры Lorentzian KNN классификатора"
            defaultOpen
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Соседи (neighbors)"
                value={config.knn.neighbors}
                onChange={(v) => updateSection('knn', { neighbors: v })}
                min={1}
                max={50}
              />
              <NumberField
                label="Глубина (lookback)"
                value={config.knn.lookback}
                onChange={(v) => updateSection('knn', { lookback: v })}
                min={10}
                max={200}
              />
              <NumberField
                label="Вес (weight)"
                value={config.knn.weight}
                onChange={(v) => updateSection('knn', { weight: v })}
                min={0}
                max={1}
                step={0.1}
              />
              <NumberField
                label="RSI период"
                value={config.knn.rsi_period}
                onChange={(v) => updateSection('knn', { rsi_period: v })}
                min={1}
              />
              <NumberField
                label="WT Channel Length"
                value={config.knn.wt_ch_len}
                onChange={(v) => updateSection('knn', { wt_ch_len: v })}
                min={1}
              />
              <NumberField
                label="WT Average Length"
                value={config.knn.wt_avg_len}
                onChange={(v) => updateSection('knn', { wt_avg_len: v })}
                min={1}
              />
              <NumberField
                label="CCI период"
                value={config.knn.cci_period}
                onChange={(v) => updateSection('knn', { cci_period: v })}
                min={1}
              />
              <NumberField
                label="ADX период"
                value={config.knn.adx_period}
                onChange={(v) => updateSection('knn', { adx_period: v })}
                min={1}
              />
            </div>
          </CollapsibleSection>

          {/* Секция 3: Trend */}
          <CollapsibleSection
            title="Trend"
            description="EMA фильтры тренда"
          >
            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="EMA Fast"
                value={config.trend.ema_fast}
                onChange={(v) => updateSection('trend', { ema_fast: v })}
                min={1}
              />
              <NumberField
                label="EMA Slow"
                value={config.trend.ema_slow}
                onChange={(v) => updateSection('trend', { ema_slow: v })}
                min={1}
              />
              <NumberField
                label="EMA Filter"
                value={config.trend.ema_filter}
                onChange={(v) => updateSection('trend', { ema_filter: v })}
                min={1}
              />
            </div>
          </CollapsibleSection>

          {/* Секция 4: MA Ribbon */}
          <CollapsibleSection
            title="MA Ribbon"
            description="Лента скользящих средних"
          >
            <ToggleField
              label="Использовать"
              value={config.ribbon.use}
              onChange={(v) => updateSection('ribbon', { use: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Тип MA</Label>
                <Select
                  options={RIBBON_TYPES}
                  value={config.ribbon.type}
                  onChange={(v) => updateSection('ribbon', { type: v })}
                />
              </div>
              <NumberField
                label="Порог (threshold)"
                value={config.ribbon.threshold}
                onChange={(v) => updateSection('ribbon', { threshold: v })}
                min={1}
              />
            </div>
            <MasArrayField
              value={config.ribbon.mas}
              onChange={(v) => updateSection('ribbon', { mas: v })}
            />
          </CollapsibleSection>

          {/* Секция 5: Order Flow */}
          <CollapsibleSection
            title="Order Flow"
            description="Анализ потока ордеров (CVD)"
          >
            <ToggleField
              label="Использовать"
              value={config.order_flow.use}
              onChange={(v) => updateSection('order_flow', { use: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="CVD период"
                value={config.order_flow.cvd_period}
                onChange={(v) => updateSection('order_flow', { cvd_period: v })}
                min={1}
              />
              <NumberField
                label="CVD порог"
                value={config.order_flow.cvd_threshold}
                onChange={(v) => updateSection('order_flow', { cvd_threshold: v })}
                min={0}
                max={1}
                step={0.1}
              />
            </div>
          </CollapsibleSection>

          {/* Секция 6: SMC */}
          <CollapsibleSection
            title="SMC"
            description="Smart Money Concepts: FVG, ликвидность, BOS"
          >
            <ToggleField
              label="Использовать"
              value={config.smc.use}
              onChange={(v) => updateSection('smc', { use: v })}
            />
            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="FVG мин. размер"
                value={config.smc.fvg_min_size}
                onChange={(v) => updateSection('smc', { fvg_min_size: v })}
                min={0}
                step={0.1}
              />
              <NumberField
                label="Ликвидность lookback"
                value={config.smc.liquidity_lookback}
                onChange={(v) => updateSection('smc', { liquidity_lookback: v })}
                min={1}
              />
              <NumberField
                label="BOS pivot"
                value={config.smc.bos_pivot}
                onChange={(v) => updateSection('smc', { bos_pivot: v })}
                min={1}
              />
            </div>
          </CollapsibleSection>

          {/* Секция 7: Risk Management */}
          <CollapsibleSection
            title="Risk Management"
            description="Стоп-лосс, тейк-профит, трейлинг"
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="ATR период"
                value={config.risk.atr_period}
                onChange={(v) => updateSection('risk', { atr_period: v })}
                min={1}
              />
              <NumberField
                label="Stop (ATR x)"
                value={config.risk.stop_atr_mult}
                onChange={(v) => updateSection('risk', { stop_atr_mult: v })}
                min={0.5}
                step={0.5}
              />
              <NumberField
                label="Take Profit (ATR x)"
                value={config.risk.tp_atr_mult}
                onChange={(v) => updateSection('risk', { tp_atr_mult: v })}
                min={1}
                step={1}
              />
              <NumberField
                label="Trailing (ATR x)"
                value={config.risk.trailing_atr_mult}
                onChange={(v) => updateSection('risk', { trailing_atr_mult: v })}
                min={1}
                step={1}
              />
            </div>
            <ToggleField
              label="Трейлинг-стоп"
              value={config.risk.use_trailing}
              onChange={(v) => updateSection('risk', { use_trailing: v })}
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <NumberField
                label="Min баров до trailing"
                value={config.risk.min_bars_trailing}
                onChange={(v) => updateSection('risk', { min_bars_trailing: v })}
                min={0}
                max={50}
              />
              <NumberField
                label="Cooldown после стопа"
                value={config.risk.cooldown_bars}
                onChange={(v) => updateSection('risk', { cooldown_bars: v })}
                min={0}
                max={50}
                suffix="баров"
              />
            </div>
          </CollapsibleSection>

          {/* Секция 8: Multi-TP + Breakeven */}
          <CollapsibleSection
            title="Multi-TP / Breakeven"
            description="Частичное закрытие + безубыток"
          >
            <ToggleField
              label="Multi-level TP (частичное закрытие)"
              value={config.risk.use_multi_tp}
              onChange={(v) => updateSection('risk', { use_multi_tp: v })}
            />
            {config.risk.use_multi_tp && (
              <div className="space-y-2 mt-3">
                {config.risk.tp_levels.map((lvl, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-3">
                    <NumberField
                      label={`TP${idx + 1} расстояние`}
                      value={lvl.atr_mult}
                      onChange={(v) => {
                        const levels = [...config.risk.tp_levels];
                        levels[idx] = { ...levels[idx], atr_mult: v };
                        updateSection('risk', { tp_levels: levels });
                      }}
                      min={1}
                      suffix="× ATR"
                    />
                    <NumberField
                      label={`TP${idx + 1} объём`}
                      value={lvl.close_pct}
                      onChange={(v) => {
                        const levels = [...config.risk.tp_levels];
                        levels[idx] = { ...levels[idx], close_pct: v };
                        updateSection('risk', { tp_levels: levels });
                      }}
                      min={1}
                      max={100}
                      suffix="% позиции"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <ToggleField
                label="Безубыток при TP1 (SL → цена входа)"
                value={config.risk.use_breakeven}
                onChange={(v) => updateSection('risk', { use_breakeven: v })}
              />
            </div>
          </CollapsibleSection>

          {/* Секция 9: Filters */}
          <CollapsibleSection
            title="Filters"
            description="ADX, объём и confluence фильтры"
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="ADX период"
                value={config.filters.adx_period}
                onChange={(v) => updateSection('filters', { adx_period: v })}
                min={1}
              />
              <NumberField
                label="ADX порог"
                value={config.filters.adx_threshold}
                onChange={(v) => updateSection('filters', { adx_threshold: v })}
                min={0}
              />
              <NumberField
                label="Объём множитель"
                value={config.filters.volume_mult}
                onChange={(v) => updateSection('filters', { volume_mult: v })}
                min={0}
                step={0.1}
              />
              <NumberField
                label="Min confluence"
                value={config.filters.min_confluence}
                onChange={(v) => updateSection('filters', { min_confluence: v })}
                min={0}
                max={5.5}
                step={0.5}
              />
            </div>
          </CollapsibleSection>

          {/* Секция 10: Backtest */}
          <CollapsibleSection
            title="Бэктест"
            description="Параметры бэктестинга"
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Размер ордера"
                value={config.backtest.order_size}
                onChange={(v) => updateSection('backtest', { order_size: v })}
                min={1}
                max={100}
                suffix="% от баланса"
              />
              <NumberField
                label="Комиссия"
                value={config.backtest.commission}
                onChange={(v) => updateSection('backtest', { commission: v })}
                min={0}
                step={0.01}
                suffix="%"
              />
            </div>
          </CollapsibleSection>

          {/* Секция 11: Live Trading */}
          <CollapsibleSection
            title="Live Trading"
            description="Параметры для реальной/демо торговли"
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Размер ордера"
                value={config.live.order_size}
                onChange={(v) => updateSection('live', { order_size: v })}
                min={1}
                max={100}
                suffix="% от баланса"
              />
              <NumberField
                label="Кредитное плечо"
                value={config.live.leverage}
                onChange={(v) => updateSection('live', { leverage: v })}
                min={1}
                max={100}
                suffix="×"
              />
            </div>
          </CollapsibleSection>

          {/* Кнопки */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Отмена
            </Button>
            <Button
              variant="premium"
              size="sm"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              {editingConfig ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================
   Карточка конфига
   ================================================================ */

interface ConfigCardProps {
  config: StrategyConfig;
  onEdit: (cfg: StrategyConfig) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}

function ConfigCard({ config: cfg, onEdit, onDelete, deleting }: ConfigCardProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="text-sm font-medium text-white truncate">
            {cfg.name}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="accent">{cfg.symbol}</Badge>
          <Badge variant="default">{cfg.timeframe}m</Badge>
          <span className="text-xs text-gray-600">
            {new Date(cfg.created_at).toLocaleDateString('ru-RU')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 ml-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-400 hover:text-white"
          onClick={() => onEdit(cfg)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-400 hover:text-brand-loss"
          onClick={() => onDelete(cfg.id)}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

/* ================================================================
   StrategyDetail — главная страница
   ================================================================ */

export function StrategyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();

  const [strategy, setStrategy] = useState<StrategyDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Конфиги пользователя
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Диалог редактора
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<StrategyConfig | null>(null);

  // Загрузка стратегии
  useEffect(() => {
    if (!slug) return;
    api
      .get(`/strategies/${slug}`)
      .then(({ data }) => setStrategy(data))
      .catch((err) => {
        setError(
          err.response?.status === 404
            ? 'Стратегия не найдена'
            : 'Ошибка загрузки',
        );
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Загрузка конфигов пользователя
  const fetchConfigs = useCallback(() => {
    if (!strategy) return;
    setConfigsLoading(true);
    api
      .get<StrategyConfig[]>('/strategies/configs/my', {
        params: { strategy_id: strategy.id },
      })
      .then(({ data }) => setConfigs(data))
      .catch(() => {
        /* Не авторизован — конфиги не загружаются, это нормально */
      })
      .finally(() => setConfigsLoading(false));
  }, [strategy]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleCopyConfig = () => {
    if (!strategy) return;
    navigator.clipboard.writeText(
      JSON.stringify(strategy.default_config, null, 2),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateConfig = () => {
    setEditingConfig(null);
    setEditorOpen(true);
  };

  const handleEditConfig = (cfg: StrategyConfig) => {
    setEditingConfig(cfg);
    setEditorOpen(true);
  };

  const handleDeleteConfig = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/strategies/configs/${id}`);
      toast('Конфигурация удалена', 'success');
      fetchConfigs();
    } catch {
      toast('Ошибка удаления', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="space-y-4">
        <Link to="/strategies">
          <Button variant="ghost" size="sm" className="text-gray-400">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к стратегиям
          </Button>
        </Link>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="h-12 w-12 text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">{error || 'Не найдено'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/strategies">
        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад к стратегиям
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-brand-premium/10">
          <Brain className="h-7 w-7 text-brand-premium" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{strategy.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="px-2 py-0.5 rounded-md bg-brand-accent/10 text-brand-accent text-xs font-medium">
              {strategy.engine_type}
            </span>
            <span className="text-gray-400 text-xs font-mono">
              v{strategy.version}
            </span>
            {strategy.is_public && (
              <span className="px-2 py-0.5 rounded-md bg-brand-profit/10 text-brand-profit text-xs font-medium">
                Public
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader>
              <CardTitle className="text-base text-white">Описание</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 leading-relaxed">
                {strategy.description || 'Описание не указано'}
              </p>
            </CardContent>
          </Card>

          {/* My Configs */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base text-white">
                Мои конфигурации
              </CardTitle>
              <Button
                variant="premium"
                size="sm"
                onClick={handleCreateConfig}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Создать конфигурацию
              </Button>
            </CardHeader>
            <CardContent>
              {configsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : configs.length === 0 ? (
                <div className="text-center py-8">
                  <Settings className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    Нет конфигураций. Создайте первую для запуска бота или бэктеста.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {configs.map((cfg) => (
                    <ConfigCard
                      key={cfg.id}
                      config={cfg}
                      onEdit={handleEditConfig}
                      onDelete={handleDeleteConfig}
                      deleting={deletingId === cfg.id}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Default config */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base text-white">
                Конфигурация по умолчанию
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyConfig}
                className="text-gray-400 hover:text-white"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5 text-brand-profit" />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Копировать
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 rounded-lg bg-black/30 text-sm font-mono text-gray-300 overflow-x-auto">
                {JSON.stringify(strategy.default_config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">Информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">ID</span>
                <span className="text-gray-300 font-mono text-xs truncate max-w-[140px]">
                  {strategy.id}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Slug</span>
                <span className="text-gray-300 font-mono text-xs">
                  {strategy.slug}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Движок</span>
                <span className="text-gray-300">{strategy.engine_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Версия</span>
                <span className="text-gray-300 font-mono">
                  {strategy.version}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Создана</span>
                <span className="text-gray-300 text-xs">
                  {new Date(strategy.created_at).toLocaleDateString('ru-RU')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quick stats about configs */}
          {configs.length > 0 && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">Конфиги</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Всего</span>
                  <span className="text-white font-mono">{configs.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Символы</span>
                  <span className="text-gray-300 text-xs">
                    {[...new Set(configs.map((c) => c.symbol))].join(', ')}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Config Editor Dialog */}
      <ConfigEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        strategyId={strategy.id}
        defaultConfig={strategy.default_config}
        editingConfig={editingConfig}
        onSaved={fetchConfigs}
      />
    </div>
  );
}
