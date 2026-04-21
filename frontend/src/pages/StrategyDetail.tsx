import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  ClipboardPaste,
  Download,
  Upload,
  Play,
  CopyPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { SymbolSearch } from '@/components/ui/symbol-search';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/api';
import type {
  StrategyDetail as StrategyDetailType,
  StrategyConfig,
  StrategyConfigCreate,
  StrategyConfigUpdate,
} from '@/types/api';

/* ================================================================
   Типы и компоненты конфигурации - из shared модуля
   ================================================================ */

import {
  type FullStrategyConfig,
  DEFAULT_CONFIG,
  RIBBON_TYPES,
  ON_REVERSE_OPTIONS,
  ENGINE_SECTIONS,
  mergeConfig,
  getCleanConfig,
  NumberField,
  ToggleField,
  MasArrayField,
  CollapsibleSection,
} from '@/components/strategy-config';

const TIMEFRAMES = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
];

/* ================================================================
   ConfigEditorDialog
   ================================================================ */

interface ConfigEditorDialogProps {
  open: boolean;
  onClose: () => void;
  strategyId: string;
  engineType: string;
  defaultConfig: Record<string, unknown>;
  editingConfig: StrategyConfig | null;
  onSaved: () => void;
}

function ConfigEditorDialog({
  open,
  onClose,
  strategyId,
  engineType,
  defaultConfig,
  editingConfig,
  onSaved,
}: ConfigEditorDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
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
  const updateSection = <K extends keyof FullStrategyConfig>(section: K, patch: Partial<FullStrategyConfig[K]>) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  };

  // Какие секции показывать для данного engineType.
  // Fallback: если engineType неизвестен — показываем все.
  const sectionsForEngine =
    ENGINE_SECTIONS[engineType] || (Object.keys(DEFAULT_CONFIG) as (keyof FullStrategyConfig)[]);
  const showSection = (section: keyof FullStrategyConfig) => sectionsForEngine.includes(section);
  // Хелпер: является ли движок SMC-семейством
  const isSmcV2 = engineType === 'smc_sweep_scalper_v2';
  const isSmc = engineType === 'smc_sweep_scalper' || isSmcV2;
  const isPivotMr = engineType === 'pivot_point_mr';

  const saveConfig = async (): Promise<string> => {
    const cleanConfig = getCleanConfig(config, engineType);
    if (editingConfig) {
      const payload: StrategyConfigUpdate = {
        name: name.trim(),
        symbol,
        timeframe,
        config: cleanConfig,
      };
      await api.patch(`/strategies/configs/${editingConfig.id}`, payload);
      return editingConfig.id;
    }
    const payload: StrategyConfigCreate = {
      strategy_id: strategyId,
      name: name.trim(),
      symbol,
      timeframe,
      config: cleanConfig,
    };
    const { data } = await api.post<StrategyConfig>('/strategies/configs', payload);
    return data.id;
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast('Введите название конфигурации', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveConfig();
      toast(editingConfig ? 'Конфигурация обновлена' : 'Конфигурация создана', 'success');
      onSaved();
      onClose();
    } catch {
      toast('Ошибка сохранения конфигурации', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyJson = async () => {
    const fullConfig = { name, symbol, timeframe, config };
    try {
      await navigator.clipboard.writeText(JSON.stringify(fullConfig, null, 2));
      toast('JSON скопирован в буфер обмена', 'success');
    } catch {
      toast('Не удалось скопировать в буфер обмена', 'error');
    }
  };

  const handlePasteJson = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) {
        toast('Невалидный JSON: ожидается объект', 'error');
        return;
      }
      const obj = parsed as Record<string, unknown>;

      if ('config' in obj && typeof obj.config === 'object' && obj.config !== null) {
        if (typeof obj.name === 'string') setName(obj.name);
        if (typeof obj.symbol === 'string') setSymbol(obj.symbol);
        if (typeof obj.timeframe === 'string') setTimeframe(obj.timeframe);
        setConfig(mergeConfig(DEFAULT_CONFIG, obj.config as Record<string, unknown>));
      } else {
        setConfig(mergeConfig(DEFAULT_CONFIG, obj));
      }
      toast('JSON вставлен из буфера обмена', 'success');
    } catch {
      toast('Не удалось прочитать JSON из буфера обмена', 'error');
    }
  };

  const handleSaveAndBacktest = async () => {
    if (!name.trim()) {
      toast('Введите название конфигурации', 'error');
      return;
    }

    setSaving(true);
    try {
      const configId = await saveConfig();
      onSaved();
      onClose();
      navigate(`/backtest?config_id=${configId}`);
    } catch {
      toast('Ошибка сохранения конфигурации', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[calc(100vw-1rem)] sm:w-auto">
        <DialogHeader onClose={onClose}>
          <DialogTitle>{editingConfig ? 'Редактировать конфигурацию' : 'Создать конфигурацию'}</DialogTitle>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Символ</Label>
                <SymbolSearch value={symbol} onChange={setSymbol} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Таймфрейм</Label>
                <Select options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
              </div>
            </div>
          </div>

          {/* Секция 2: KNN */}
          {showSection('knn') && (
            <CollapsibleSection title="KNN" description="Параметры Lorentzian KNN классификатора" defaultOpen>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          )}

          {/* Секция 3: Trend */}
          {showSection('trend') && (
            <CollapsibleSection title="Trend" description="EMA фильтры тренда">
              {/* KNN движок использует тройку EMA, SMC / Pivot MR — одиночный период */}
              {engineType === 'lorentzian_knn' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="EMA период"
                    value={config.trend.ema_period ?? 200}
                    onChange={(v) => updateSection('trend', { ema_period: v })}
                    min={1}
                  />
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* Секция 4: MA Ribbon */}
          {showSection('ribbon') && (
            <CollapsibleSection title="MA Ribbon" description="Лента скользящих средних">
              <ToggleField
                label="Использовать"
                value={config.ribbon.use}
                onChange={(v) => updateSection('ribbon', { use: v })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <MasArrayField value={config.ribbon.mas} onChange={(v) => updateSection('ribbon', { mas: v })} />
            </CollapsibleSection>
          )}

          {/* Секция 5: Order Flow */}
          {showSection('order_flow') && (
            <CollapsibleSection title="Order Flow" description="Анализ потока ордеров (CVD)">
              <ToggleField
                label="Использовать"
                value={config.order_flow.use}
                onChange={(v) => updateSection('order_flow', { use: v })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          )}

          {/* Секция Pivot (Pivot Point MR) */}
          {showSection('pivot') && (
            <CollapsibleSection title="Pivot" description="Pivot period + velocity lookback" defaultOpen>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="Pivot период"
                  value={config.pivot.period}
                  onChange={(v) => updateSection('pivot', { period: v })}
                  min={1}
                  suffix="баров"
                />
                <NumberField
                  label="Velocity lookback"
                  value={config.pivot.velocity_lookback}
                  onChange={(v) => updateSection('pivot', { velocity_lookback: v })}
                  min={1}
                />
              </div>
            </CollapsibleSection>
          )}

          {/* Секция Sweep (SMC v1/v2) */}
          {showSection('sweep') && (
            <CollapsibleSection title="Sweep" description="Liquidity sweep lookback" defaultOpen>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="Lookback"
                  value={config.sweep.lookback}
                  onChange={(v) => updateSection('sweep', { lookback: v })}
                  min={1}
                  suffix="баров"
                />
              </div>
            </CollapsibleSection>
          )}

          {/* Секция Confirmation (SMC v1/v2) */}
          {showSection('confirmation') && (
            <CollapsibleSection title="Confirmation" description="BOS / FVG / OB подтверждение после sweep">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="Window"
                  value={config.confirmation.window}
                  onChange={(v) => updateSection('confirmation', { window: v })}
                  min={1}
                  suffix="баров"
                />
                <NumberField
                  label="FVG мин. размер"
                  value={config.confirmation.fvg_min_size}
                  onChange={(v) => updateSection('confirmation', { fvg_min_size: v })}
                  min={0}
                  step={0.1}
                />
                <NumberField
                  label="BOS pivot"
                  value={config.confirmation.bos_pivot}
                  onChange={(v) => updateSection('confirmation', { bos_pivot: v })}
                  min={1}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <ToggleField
                  label="Use BOS"
                  value={config.confirmation.use_bos}
                  onChange={(v) => updateSection('confirmation', { use_bos: v })}
                />
                <ToggleField
                  label="Use FVG"
                  value={config.confirmation.use_fvg}
                  onChange={(v) => updateSection('confirmation', { use_fvg: v })}
                />
                <ToggleField
                  label="Use OB"
                  value={config.confirmation.use_ob}
                  onChange={(v) => updateSection('confirmation', { use_ob: v })}
                />
              </div>
            </CollapsibleSection>
          )}

          {/* Секция 6: SMC */}
          {showSection('smc') && (
            <CollapsibleSection title="SMC" description="Smart Money Concepts: FVG, ликвидность, BOS">
              <ToggleField
                label="Использовать"
                value={config.smc.use}
                onChange={(v) => updateSection('smc', { use: v })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
          )}

          {/* Секция 7: Risk Management */}
          {showSection('risk') &&
            (isSmc ? (
              /* SMC v2 / v1 — R-multiple TP + SL buffer */
              <CollapsibleSection title="Risk Management" description="SL buffer, multi-TP по R, trailing" defaultOpen>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="ATR период"
                    value={config.risk.atr_period}
                    onChange={(v) => updateSection('risk', { atr_period: v })}
                    min={1}
                  />
                  <NumberField
                    label="SL ATR buffer"
                    value={config.risk.sl_atr_buffer ?? 0.3}
                    onChange={(v) => updateSection('risk', { sl_atr_buffer: v })}
                    min={0}
                    step={0.1}
                  />
                  <NumberField
                    label="SL max %"
                    value={config.risk.sl_max_pct ?? 0.015}
                    onChange={(v) => updateSection('risk', { sl_max_pct: v })}
                    min={0}
                    step={0.001}
                  />
                  <NumberField
                    label="Trailing (ATR x)"
                    value={config.risk.trailing_atr_mult}
                    onChange={(v) => updateSection('risk', { trailing_atr_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                </div>

                {/* Multi-TP на R-multiple */}
                <div className="pt-3 mt-3 border-t border-white/5 space-y-2.5">
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    Take Profit (R-multiple)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumberField
                      label="TP1 R"
                      value={config.risk.tp1_r_mult ?? 0.5}
                      onChange={(v) => updateSection('risk', { tp1_r_mult: v })}
                      min={0}
                      step={0.1}
                      suffix="× R"
                    />
                    <NumberField
                      label="TP1 close"
                      value={config.risk.tp1_close_pct ?? 0.5}
                      onChange={(v) => updateSection('risk', { tp1_close_pct: v })}
                      min={0}
                      max={1}
                      step={0.05}
                      suffix="доля"
                    />
                    <NumberField
                      label="TP2 R"
                      value={config.risk.tp2_r_mult ?? 1.5}
                      onChange={(v) => updateSection('risk', { tp2_r_mult: v })}
                      min={0}
                      step={0.1}
                      suffix="× R"
                    />
                    <NumberField
                      label="TP2 close"
                      value={config.risk.tp2_close_pct ?? 0.3}
                      onChange={(v) => updateSection('risk', { tp2_close_pct: v })}
                      min={0}
                      max={1}
                      step={0.05}
                      suffix="доля"
                    />
                  </div>
                  {isSmcV2 && (
                    <>
                      <ToggleField
                        label="TP3 включён"
                        value={config.risk.tp3_enabled ?? true}
                        onChange={(v) => updateSection('risk', { tp3_enabled: v })}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <NumberField
                          label="TP3 R"
                          value={config.risk.tp3_r_mult ?? 3.0}
                          onChange={(v) => updateSection('risk', { tp3_r_mult: v })}
                          min={0}
                          step={0.1}
                          suffix="× R"
                        />
                        <NumberField
                          label="TP3 close"
                          value={config.risk.tp3_close_pct ?? 0.2}
                          onChange={(v) => updateSection('risk', { tp3_close_pct: v })}
                          min={0}
                          max={1}
                          step={0.05}
                          suffix="доля"
                        />
                      </div>
                      <ToggleField
                        label="Выключить trailing"
                        value={config.risk.disable_trailing ?? true}
                        onChange={(v) => updateSection('risk', { disable_trailing: v })}
                      />
                    </>
                  )}
                </div>
              </CollapsibleSection>
            ) : isPivotMr ? (
              /* Pivot Point MR — sl_atr_mult + R-multiple TP */
              <CollapsibleSection
                title="Risk Management"
                description="SL ATR mult, multi-TP по pivot уровням"
                defaultOpen
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="ATR период"
                    value={config.risk.atr_period}
                    onChange={(v) => updateSection('risk', { atr_period: v })}
                    min={1}
                  />
                  <NumberField
                    label="SL ATR mult"
                    value={config.risk.sl_atr_mult ?? 0.5}
                    onChange={(v) => updateSection('risk', { sl_atr_mult: v })}
                    min={0}
                    step={0.1}
                  />
                  <NumberField
                    label="SL max %"
                    value={config.risk.sl_max_pct ?? 0.02}
                    onChange={(v) => updateSection('risk', { sl_max_pct: v })}
                    min={0}
                    step={0.001}
                  />
                  <NumberField
                    label="Trailing (ATR x)"
                    value={config.risk.trailing_atr_mult}
                    onChange={(v) => updateSection('risk', { trailing_atr_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                  <NumberField
                    label="TP1 close"
                    value={config.risk.tp1_close_pct ?? 0.6}
                    onChange={(v) => updateSection('risk', { tp1_close_pct: v })}
                    min={0}
                    max={1}
                    step={0.05}
                    suffix="доля"
                  />
                  <NumberField
                    label="TP2 close"
                    value={config.risk.tp2_close_pct ?? 0.4}
                    onChange={(v) => updateSection('risk', { tp2_close_pct: v })}
                    min={0}
                    max={1}
                    step={0.05}
                    suffix="доля"
                  />
                  <NumberField
                    label="Max hold bars"
                    value={config.risk.max_hold_bars ?? 60}
                    onChange={(v) => updateSection('risk', { max_hold_bars: v })}
                    min={0}
                    suffix="баров"
                  />
                </div>
              </CollapsibleSection>
            ) : (
              /* Legacy: KNN / SuperTrend / Hybrid — ATR x SL/TP */
              <CollapsibleSection title="Risk Management" description="Стоп-лосс, тейк-профит, трейлинг">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
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
            ))}

          {/* Секция 8: Multi-TP + Breakeven — только для legacy (KNN/SuperTrend/Hybrid) */}
          {showSection('risk') && !isSmc && !isPivotMr && (
            <CollapsibleSection title="Multi-TP / Breakeven" description="Частичное закрытие + безубыток">
              <ToggleField
                label="Multi-level TP (частичное закрытие)"
                value={config.risk.use_multi_tp}
                onChange={(v) => updateSection('risk', { use_multi_tp: v })}
              />
              {config.risk.use_multi_tp && (
                <div className="space-y-2 mt-3">
                  {config.risk.tp_levels.map((lvl, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          )}

          {/* Секция 9: Filters */}
          {showSection('filters') &&
            (isSmc ? (
              /* SMC v1 / v2 — RSI / Volume / ATR regime / Session / HTF bias */
              <CollapsibleSection title="Filters" description="RSI / Volume / Session / HTF bias">
                <ToggleField
                  label="Trend filter"
                  value={config.filters.trend_filter_enabled ?? false}
                  onChange={(v) => updateSection('filters', { trend_filter_enabled: v })}
                />
                <ToggleField
                  label="RSI filter"
                  value={config.filters.rsi_filter_enabled ?? true}
                  onChange={(v) => updateSection('filters', { rsi_filter_enabled: v })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="RSI период"
                    value={config.filters.rsi_period ?? 14}
                    onChange={(v) => updateSection('filters', { rsi_period: v })}
                    min={2}
                  />
                </div>
                <ToggleField
                  label="Volume filter"
                  value={config.filters.volume_filter_enabled ?? true}
                  onChange={(v) => updateSection('filters', { volume_filter_enabled: v })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="Volume SMA period"
                    value={config.filters.volume_sma_period ?? 20}
                    onChange={(v) => updateSection('filters', { volume_sma_period: v })}
                    min={1}
                  />
                  <NumberField
                    label="Volume min ratio"
                    value={config.filters.volume_min_ratio ?? 1.2}
                    onChange={(v) => updateSection('filters', { volume_min_ratio: v })}
                    min={0}
                    step={0.1}
                  />
                </div>

                {isSmcV2 && (
                  <>
                    <div className="pt-2 mt-2 border-t border-white/5">
                      <ToggleField
                        label="ATR regime filter"
                        value={config.filters.atr_regime_enabled ?? true}
                        onChange={(v) => updateSection('filters', { atr_regime_enabled: v })}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <NumberField
                          label="ATR %ile min"
                          value={config.filters.atr_percentile_min ?? 0.4}
                          onChange={(v) => updateSection('filters', { atr_percentile_min: v })}
                          min={0}
                          max={1}
                          step={0.05}
                        />
                        <NumberField
                          label="ATR %ile max"
                          value={config.filters.atr_percentile_max ?? 0.95}
                          onChange={(v) => updateSection('filters', { atr_percentile_max: v })}
                          min={0}
                          max={1}
                          step={0.05}
                        />
                        <NumberField
                          label="ATR %ile window"
                          value={config.filters.atr_percentile_window ?? 200}
                          onChange={(v) => updateSection('filters', { atr_percentile_window: v })}
                          min={1}
                        />
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t border-white/5">
                      <ToggleField
                        label="Session killzone filter"
                        value={config.filters.session_filter_enabled ?? true}
                        onChange={(v) => updateSection('filters', { session_filter_enabled: v })}
                      />
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-400">Session hours (UTC, comma-separated)</Label>
                        <Input
                          value={(config.filters.session_hours ?? []).join(',')}
                          onChange={(e) => {
                            const parts = e.target.value
                              .split(',')
                              .map((x) => parseInt(x.trim(), 10))
                              .filter((n) => !isNaN(n) && n >= 0 && n < 24);
                            updateSection('filters', { session_hours: parts });
                          }}
                          placeholder="7,8,9,13,14,15"
                          className="h-8 bg-white/5 border-white/10 text-white font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t border-white/5">
                      <ToggleField
                        label="HTF bias filter"
                        value={config.filters.htf_bias_enabled ?? true}
                        onChange={(v) => updateSection('filters', { htf_bias_enabled: v })}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <NumberField
                          label="HTF EMA period"
                          value={config.filters.htf_ema_period ?? 50}
                          onChange={(v) => updateSection('filters', { htf_ema_period: v })}
                          min={1}
                        />
                        <NumberField
                          label="HTF slope min"
                          value={config.filters.htf_slope_min ?? 0.0002}
                          onChange={(v) => updateSection('filters', { htf_slope_min: v })}
                          min={0}
                          step={0.0001}
                        />
                        <NumberField
                          label="HTF bars per HTF"
                          value={config.filters.htf_bars_per_htf ?? 12}
                          onChange={(v) => updateSection('filters', { htf_bars_per_htf: v })}
                          min={1}
                        />
                        <NumberField
                          label="HTF slope lookback"
                          value={config.filters.htf_slope_lookback ?? 6}
                          onChange={(v) => updateSection('filters', { htf_slope_lookback: v })}
                          min={1}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CollapsibleSection>
            ) : isPivotMr ? (
              <CollapsibleSection title="Filters" description="ADX / RSI / Squeeze / Volume">
                <ToggleField
                  label="ADX filter"
                  value={config.filters.adx_enabled ?? true}
                  onChange={(v) => updateSection('filters', { adx_enabled: v })}
                />
                <NumberField
                  label="ADX период"
                  value={config.filters.adx_period}
                  onChange={(v) => updateSection('filters', { adx_period: v })}
                  min={1}
                />
                <ToggleField
                  label="RSI filter"
                  value={config.filters.rsi_filter_enabled ?? true}
                  onChange={(v) => updateSection('filters', { rsi_filter_enabled: v })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <NumberField
                    label="RSI период"
                    value={config.filters.rsi_period ?? 14}
                    onChange={(v) => updateSection('filters', { rsi_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="RSI oversold"
                    value={config.filters.rsi_oversold ?? 40}
                    onChange={(v) => updateSection('filters', { rsi_oversold: v })}
                    min={0}
                    max={100}
                  />
                  <NumberField
                    label="RSI overbought"
                    value={config.filters.rsi_overbought ?? 60}
                    onChange={(v) => updateSection('filters', { rsi_overbought: v })}
                    min={0}
                    max={100}
                  />
                </div>
                <ToggleField
                  label="Squeeze filter"
                  value={config.filters.squeeze_enabled ?? true}
                  onChange={(v) => updateSection('filters', { squeeze_enabled: v })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="BB len"
                    value={config.filters.squeeze_bb_len ?? 20}
                    onChange={(v) => updateSection('filters', { squeeze_bb_len: v })}
                    min={2}
                  />
                  <NumberField
                    label="BB mult"
                    value={config.filters.squeeze_bb_mult ?? 2.0}
                    onChange={(v) => updateSection('filters', { squeeze_bb_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                  <NumberField
                    label="KC len"
                    value={config.filters.squeeze_kc_len ?? 20}
                    onChange={(v) => updateSection('filters', { squeeze_kc_len: v })}
                    min={2}
                  />
                  <NumberField
                    label="KC mult"
                    value={config.filters.squeeze_kc_mult ?? 1.5}
                    onChange={(v) => updateSection('filters', { squeeze_kc_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                </div>
                <ToggleField
                  label="Volume filter"
                  value={config.filters.volume_filter_enabled ?? false}
                  onChange={(v) => updateSection('filters', { volume_filter_enabled: v })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="Volume SMA period"
                    value={config.filters.volume_sma_period ?? 20}
                    onChange={(v) => updateSection('filters', { volume_sma_period: v })}
                    min={1}
                  />
                  <NumberField
                    label="Volume min ratio"
                    value={config.filters.volume_min_ratio ?? 1.2}
                    onChange={(v) => updateSection('filters', { volume_min_ratio: v })}
                    min={0}
                    step={0.1}
                  />
                </div>
              </CollapsibleSection>
            ) : (
              <CollapsibleSection title="Filters" description="ADX, объём и confluence фильтры">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            ))}

          {/* Секция Entry (для SMC / Pivot MR / SuperTrend family) */}
          {showSection('entry') && (isSmc || isPivotMr) && (
            <CollapsibleSection title="Entry" description="Confluence threshold / cooldown / deep levels">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="Min confluence"
                  value={config.entry.min_confluence ?? 1.5}
                  onChange={(v) => updateSection('entry', { min_confluence: v })}
                  min={0}
                  max={10}
                  step={0.25}
                />
                <NumberField
                  label="Cooldown bars"
                  value={config.entry.cooldown_bars ?? 3}
                  onChange={(v) => updateSection('entry', { cooldown_bars: v })}
                  min={0}
                />
                {isPivotMr && (
                  <>
                    <NumberField
                      label="Min distance %"
                      value={config.entry.min_distance_pct ?? 0.15}
                      onChange={(v) => updateSection('entry', { min_distance_pct: v })}
                      min={0}
                      step={0.05}
                    />
                    <NumberField
                      label="Impulse check bars"
                      value={config.entry.impulse_check_bars ?? 5}
                      onChange={(v) => updateSection('entry', { impulse_check_bars: v })}
                      min={0}
                    />
                  </>
                )}
              </div>
              {isPivotMr && (
                <ToggleField
                  label="Use deep levels (S2/R2/S3/R3)"
                  value={config.entry.use_deep_levels ?? true}
                  onChange={(v) => updateSection('entry', { use_deep_levels: v })}
                />
              )}
            </CollapsibleSection>
          )}

          {/* Секция Regime для Pivot MR */}
          {showSection('regime') && isPivotMr && (
            <CollapsibleSection title="Режим рынка" description="ADX weak/strong + pivot drift">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="ADX weak trend"
                  value={config.regime.adx_weak_trend ?? 20}
                  onChange={(v) => updateSection('regime', { adx_weak_trend: v })}
                  min={0}
                />
                <NumberField
                  label="ADX strong trend"
                  value={config.regime.adx_strong_trend ?? 30}
                  onChange={(v) => updateSection('regime', { adx_strong_trend: v })}
                  min={0}
                />
                <NumberField
                  label="Pivot drift max"
                  value={config.regime.pivot_drift_max ?? 0.3}
                  onChange={(v) => updateSection('regime', { pivot_drift_max: v })}
                  min={0}
                  step={0.05}
                />
              </div>
              <ToggleField
                label="Allow strong trend"
                value={config.regime.allow_strong_trend ?? false}
                onChange={(v) => updateSection('regime', { allow_strong_trend: v })}
              />
            </CollapsibleSection>
          )}

          {/* Секции SuperTrend Squeeze / Hybrid */}
          {(engineType === 'supertrend_squeeze' || engineType === 'hybrid_knn_supertrend') && (
            <>
              <CollapsibleSection title="SuperTrend" description="Triple SuperTrend параметры" defaultOpen>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="ST1 период"
                    value={config.supertrend.st1_period}
                    onChange={(v) => updateSection('supertrend', { st1_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="ST1 множитель"
                    value={config.supertrend.st1_mult}
                    onChange={(v) => updateSection('supertrend', { st1_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                  <NumberField
                    label="ST2 период"
                    value={config.supertrend.st2_period}
                    onChange={(v) => updateSection('supertrend', { st2_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="ST2 множитель"
                    value={config.supertrend.st2_mult}
                    onChange={(v) => updateSection('supertrend', { st2_mult: v })}
                    min={0.1}
                    step={0.25}
                  />
                  <NumberField
                    label="ST3 период"
                    value={config.supertrend.st3_period}
                    onChange={(v) => updateSection('supertrend', { st3_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="ST3 множитель"
                    value={config.supertrend.st3_mult}
                    onChange={(v) => updateSection('supertrend', { st3_mult: v })}
                    min={0.1}
                    step={0.5}
                  />
                  <NumberField
                    label="Мин. согласие"
                    value={config.supertrend.min_agree}
                    onChange={(v) => updateSection('supertrend', { min_agree: v })}
                    min={1}
                    max={3}
                  />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Squeeze Momentum" description="Bollinger/Keltner squeeze + momentum">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Включить Squeeze</span>
                    <Checkbox checked={config.squeeze.use} onChange={(v) => updateSection('squeeze', { use: v })} />
                  </div>
                  <NumberField
                    label="BB период"
                    value={config.squeeze.bb_period}
                    onChange={(v) => updateSection('squeeze', { bb_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="BB множитель"
                    value={config.squeeze.bb_mult}
                    onChange={(v) => updateSection('squeeze', { bb_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                  <NumberField
                    label="KC период"
                    value={config.squeeze.kc_period}
                    onChange={(v) => updateSection('squeeze', { kc_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="KC множитель"
                    value={config.squeeze.kc_mult}
                    onChange={(v) => updateSection('squeeze', { kc_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                  <NumberField
                    label="Мин. длительность"
                    value={config.squeeze.min_duration}
                    onChange={(v) => updateSection('squeeze', { min_duration: v })}
                    min={0}
                  />
                  <NumberField
                    label="Макс. вес"
                    value={config.squeeze.max_weight}
                    onChange={(v) => updateSection('squeeze', { max_weight: v })}
                    min={0.1}
                    step={0.1}
                  />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Entry" description="RSI фильтры и объём">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="RSI период"
                    value={config.entry.rsi_period}
                    onChange={(v) => updateSection('entry', { rsi_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="RSI long max"
                    value={config.entry.rsi_long_max}
                    onChange={(v) => updateSection('entry', { rsi_long_max: v })}
                    min={0}
                    max={100}
                  />
                  <NumberField
                    label="RSI short min"
                    value={config.entry.rsi_short_min}
                    onChange={(v) => updateSection('entry', { rsi_short_min: v })}
                    min={0}
                    max={100}
                  />
                  <NumberField
                    label="Объём множитель"
                    value={config.entry.volume_mult}
                    onChange={(v) => updateSection('entry', { volume_mult: v })}
                    min={0.1}
                    step={0.1}
                  />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Trend Filter" description="EMA + ADX тренд-фильтр">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberField
                    label="EMA период"
                    value={config.trend_filter.ema_period}
                    onChange={(v) => updateSection('trend_filter', { ema_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="ADX период"
                    value={config.trend_filter.adx_period}
                    onChange={(v) => updateSection('trend_filter', { adx_period: v })}
                    min={2}
                  />
                  <NumberField
                    label="ADX порог"
                    value={config.trend_filter.adx_threshold}
                    onChange={(v) => updateSection('trend_filter', { adx_threshold: v })}
                    min={0}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Использовать ADX</span>
                    <Checkbox
                      checked={config.trend_filter.use_adx}
                      onChange={(v) => updateSection('trend_filter', { use_adx: v })}
                    />
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Режим волатильности" description="Адаптация к рыночным условиям">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Включить</span>
                    <Checkbox checked={config.regime.use} onChange={(v) => updateSection('regime', { use: v })} />
                  </div>
                  <NumberField
                    label="ADX ranging"
                    value={config.regime.adx_ranging}
                    onChange={(v) => updateSection('regime', { adx_ranging: v })}
                    min={0}
                  />
                  <NumberField
                    label="ATR high vol %"
                    value={config.regime.atr_high_vol_pct}
                    onChange={(v) => updateSection('regime', { atr_high_vol_pct: v })}
                    min={0}
                    max={100}
                  />
                  <NumberField
                    label="Vol scale"
                    value={config.regime.vol_scale}
                    onChange={(v) => updateSection('regime', { vol_scale: v })}
                    min={1}
                    step={0.1}
                  />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Time Filter" description="Блокировка входов в шумные часы UTC">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Включить</span>
                    <Checkbox
                      checked={config.time_filter.use}
                      onChange={(v) => updateSection('time_filter', { use: v })}
                    />
                  </div>
                  <NumberField
                    label="Блок с (UTC)"
                    value={config.time_filter.block_start_utc}
                    onChange={(v) => updateSection('time_filter', { block_start_utc: v })}
                    min={0}
                    max={23}
                  />
                  <NumberField
                    label="Блок до (UTC)"
                    value={config.time_filter.block_end_utc}
                    onChange={(v) => updateSection('time_filter', { block_end_utc: v })}
                    min={0}
                    max={23}
                  />
                </div>
              </CollapsibleSection>
            </>
          )}

          {/* Секция Hybrid KNN Filter */}
          {engineType === 'hybrid_knn_supertrend' && (
            <CollapsibleSection
              title="Hybrid KNN Filter"
              description="Фильтрация сигналов через KNN confidence"
              defaultOpen
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="Мин. confidence"
                  value={config.hybrid.knn_min_confidence}
                  onChange={(v) => updateSection('hybrid', { knn_min_confidence: v })}
                  min={0}
                  max={100}
                  step={5}
                />
                <NumberField
                  label="Мин. score"
                  value={config.hybrid.knn_min_score}
                  onChange={(v) => updateSection('hybrid', { knn_min_score: v })}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <NumberField
                  label="Boost порог"
                  value={config.hybrid.knn_boost_threshold}
                  onChange={(v) => updateSection('hybrid', { knn_boost_threshold: v })}
                  min={0}
                  max={100}
                  step={5}
                />
                <NumberField
                  label="Boost множитель"
                  value={config.hybrid.knn_boost_mult}
                  onChange={(v) => updateSection('hybrid', { knn_boost_mult: v })}
                  min={1}
                  max={3}
                  step={0.1}
                />
                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Проверять направление KNN</span>
                  <Checkbox
                    checked={config.hybrid.use_knn_direction}
                    onChange={(v) => updateSection('hybrid', { use_knn_direction: v })}
                  />
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Секция 10: Общие параметры торговли */}
          <CollapsibleSection title="Торговля" description="Плечо, размеры ордеров, режим реверса">
            {/* Плечо + Реверс - компактно в одну строку */}
            <div className="flex items-end gap-3">
              <div className="w-24 shrink-0">
                <NumberField
                  label="Плечо"
                  value={config.live.leverage}
                  onChange={(v) => updateSection('live', { leverage: v })}
                  min={1}
                  max={100}
                  suffix="×"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-gray-400">При обратном сигнале</Label>
                <Select
                  options={ON_REVERSE_OPTIONS}
                  value={config.live.on_reverse}
                  onChange={(v) => updateSection('live', { on_reverse: v })}
                />
              </div>
            </div>

            {/* Бэктест / Live - бок о бок */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 mt-3 border-t border-white/5">
              <div className="space-y-2.5">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Бэктест</span>
                <NumberField
                  label="Ордер"
                  value={config.backtest.order_size}
                  onChange={(v) => updateSection('backtest', { order_size: v })}
                  min={1}
                  max={100}
                  suffix="%"
                />
                <NumberField
                  label="Комиссия"
                  value={config.backtest.commission}
                  onChange={(v) => updateSection('backtest', { commission: v })}
                  min={0}
                  step={0.01}
                  suffix="%"
                />
                <NumberField
                  label="Slippage"
                  value={config.backtest.slippage}
                  onChange={(v) => updateSection('backtest', { slippage: v })}
                  min={0}
                  step={0.01}
                  suffix="%"
                />
                {(engineType === 'supertrend_squeeze' || engineType === 'hybrid_knn_supertrend') && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-400">ST Flip Exit</span>
                    <Checkbox
                      checked={config.backtest.use_supertrend_exit}
                      onChange={(checked: boolean) =>
                        updateSection('backtest', {
                          use_supertrend_exit: checked,
                        })
                      }
                      className="h-4 w-4"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2.5">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Live / Demo</span>
                <NumberField
                  label="Ордер"
                  value={config.live.order_size}
                  onChange={(v) => updateSection('live', { order_size: v })}
                  min={1}
                  max={100}
                  suffix="%"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* JSON-утилиты */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyJson}
              className="text-gray-400 hover:text-brand-accent"
              title="Скопировать конфиг как JSON"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePasteJson}
              className="text-gray-400 hover:text-brand-accent"
              title="Вставить конфиг из JSON"
            >
              <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
              Вставить
            </Button>
          </div>

          {/* Кнопки действий */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-between gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 min-h-[44px] justify-center">
              <X className="mr-1.5 h-3.5 w-3.5" />
              Отмена
            </Button>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveAndBacktest}
                disabled={saving}
                className="text-brand-accent hover:text-brand-accent hover:bg-brand-accent/10 flex-1 sm:flex-none min-h-[44px] justify-center"
                title="Сохранить и запустить бэктест"
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Бэктест
              </Button>
              <Button
                variant="premium"
                size="sm"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 sm:flex-none min-h-[44px] justify-center"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================
   Константы пагинации
   ================================================================ */

/* ================================================================
   Карточка конфига
   ================================================================ */

interface ConfigCardProps {
  config: StrategyConfig;
  onEdit: (cfg: StrategyConfig) => void;
  onDelete: (id: string) => void;
  onDuplicate: (cfg: StrategyConfig) => void;
  onExport: (cfg: StrategyConfig) => void;
  deleting: boolean;
  duplicating: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}

function ConfigCard({
  config: cfg,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  deleting,
  duplicating,
  selected,
  onSelect,
}: ConfigCardProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        selected ? 'border-brand-accent/30 bg-brand-accent/5' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      {/* Checkbox */}
      <Checkbox checked={selected} onChange={onSelect} aria-label={`Выбрать ${cfg.name}`} className="shrink-0" />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-gray-400 shrink-0 hidden sm:block" />
          <span className="text-sm font-medium text-white truncate">{cfg.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge variant="accent">{cfg.symbol}</Badge>
          <Badge variant="default">{cfg.timeframe}m</Badge>
          <span className="text-xs text-gray-600">{new Date(cfg.created_at).toLocaleDateString('ru-RU')}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-gray-400 hover:text-white"
          onClick={() => onEdit(cfg)}
          title="Редактировать"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-gray-400 hover:text-brand-accent hidden sm:inline-flex"
          onClick={() => onDuplicate(cfg)}
          disabled={duplicating}
          title="Дублировать"
        >
          {duplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-gray-400 hover:text-brand-premium hidden sm:inline-flex"
          onClick={() => onExport(cfg)}
          title="Экспорт в JSON"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-gray-400 hover:text-brand-loss"
          onClick={() => onDelete(cfg.id)}
          disabled={deleting}
          title="Удалить"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [strategy, setStrategy] = useState<StrategyDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Редактирование версии (admin)
  const [editingVersion, setEditingVersion] = useState(false);
  const [versionDraft, setVersionDraft] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  const saveVersion = useCallback(async () => {
    if (!strategy || !versionDraft.trim()) return;
    setSavingVersion(true);
    try {
      const { data } = await api.patch(`/strategies/${strategy.id}`, {
        version: versionDraft.trim(),
      });
      setStrategy(data);
      setEditingVersion(false);
      toast('Версия обновлена', 'success');
    } catch {
      toast('Ошибка обновления версии', 'error');
    } finally {
      setSavingVersion(false);
    }
  }, [strategy, versionDraft, toast]);

  // Конфиги пользователя
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [configFilter, setConfigFilter] = useState('');

  const filteredConfigs = configs.filter((c) => {
    if (!configFilter) return true;
    const q = configFilter.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q);
  });

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredConfigs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConfigs.map((c) => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      try {
        await api.delete(`/strategies/configs/${id}`);
      } catch {
        /* skip failed */
      }
    }
    setSelectedIds(new Set());
    fetchConfigs();
    toast(`Удалено ${selectedIds.size} конфигов`, 'success');
  };

  // Диалог редактора
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<StrategyConfig | null>(null);

  // Дублирование
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Импорт (скрытый file input)
  const importInputRef = useRef<HTMLInputElement>(null);

  // Загрузка стратегии
  useEffect(() => {
    if (!slug) return;
    api
      .get(`/strategies/${slug}`)
      .then(({ data }) => setStrategy(data))
      .catch((err) => {
        setError(err.response?.status === 404 ? 'Стратегия не найдена' : 'Ошибка загрузки');
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
    navigator.clipboard.writeText(JSON.stringify(strategy.default_config, null, 2));
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

  /* Дублирование конфига */
  const handleDuplicateConfig = async (cfg: StrategyConfig) => {
    setDuplicatingId(cfg.id);
    try {
      const payload: StrategyConfigCreate = {
        strategy_id: cfg.strategy_id,
        name: `${cfg.name} (копия)`,
        symbol: cfg.symbol,
        timeframe: cfg.timeframe,
        config: cfg.config,
      };
      await api.post('/strategies/configs', payload);
      toast('Конфигурация дублирована', 'success');
      fetchConfigs();
    } catch {
      toast('Ошибка дублирования', 'error');
    } finally {
      setDuplicatingId(null);
    }
  };

  /* Экспорт конфига в .json файл */
  const handleExportConfig = (cfg: StrategyConfig) => {
    const exportData = {
      name: cfg.name,
      symbol: cfg.symbol,
      timeframe: cfg.timeframe,
      config: cfg.config,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cfg.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Конфигурация экспортирована', 'success');
  };

  /* Импорт конфига из .json файла */
  const handleImportConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !strategy) return;

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) {
        toast('Невалидный JSON: ожидается объект', 'error');
        return;
      }

      const obj = parsed as Record<string, unknown>;
      const configData =
        'config' in obj && typeof obj.config === 'object' && obj.config !== null
          ? (obj.config as Record<string, unknown>)
          : obj;

      const importName = typeof obj.name === 'string' ? `${obj.name} (импорт)` : `Импорт ${file.name}`;
      const importSymbol = typeof obj.symbol === 'string' ? obj.symbol : 'BTCUSDT';
      const importTimeframe = typeof obj.timeframe === 'string' ? obj.timeframe : '5';

      const payload: StrategyConfigCreate = {
        strategy_id: strategy.id,
        name: importName,
        symbol: importSymbol,
        timeframe: importTimeframe,
        config: configData,
      };

      await api.post('/strategies/configs', payload);
      toast('Конфигурация импортирована', 'success');
      fetchConfigs();
    } catch {
      toast('Ошибка импорта: невалидный JSON файл', 'error');
    } finally {
      // Сброс input, чтобы можно было загрузить тот же файл повторно
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
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
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-brand-premium/10 flex-shrink-0">
          <Brain className="h-6 w-6 sm:h-7 sm:w-7 text-brand-premium" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white break-words">{strategy.name}</h1>
          <div className="flex items-center gap-2 sm:gap-3 mt-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-brand-accent/10 text-brand-accent text-xs font-medium break-all">
              {strategy.engine_type}
            </span>
            <span className="text-gray-400 text-xs font-mono">v{strategy.version}</span>
            {isAdmin && (
              <button
                onClick={() => {
                  setVersionDraft(strategy.version);
                  setEditingVersion(true);
                }}
                className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                title="Изменить версию"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {strategy.is_public && (
              <span className="px-2 py-0.5 rounded-md bg-brand-profit/10 text-brand-profit text-xs font-medium">
                Public
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader>
              <CardTitle className="text-base text-white">Описание</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 leading-relaxed">{strategy.description || 'Описание не указано'}</p>
            </CardContent>
          </Card>

          {/* My Configs */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base text-white">Мои конфигурации</CardTitle>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => importInputRef.current?.click()}
                  className="text-gray-400 hover:text-brand-premium flex-1 sm:flex-none min-h-[40px]"
                  title="Импорт из JSON файла"
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Импорт
                </Button>
                <Button
                  variant="premium"
                  size="sm"
                  onClick={handleCreateConfig}
                  className="flex-1 sm:flex-none min-h-[40px]"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Создать
                </Button>
              </div>
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
                <div className="space-y-3">
                  {/* Toolbar: filter + bulk actions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <Input
                      placeholder="Поиск по имени или символу..."
                      value={configFilter}
                      onChange={(e) => setConfigFilter(e.target.value)}
                      className="h-8 text-xs bg-white/[0.03] border-white/[0.06] w-full sm:w-56"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-white/[0.06] hover:border-white/[0.1]"
                      >
                        <Checkbox
                          checked={filteredConfigs.length > 0 && selectedIds.size === filteredConfigs.length}
                          className="h-3.5 w-3.5"
                          tabIndex={-1}
                        />
                        {selectedIds.size === filteredConfigs.length && filteredConfigs.length > 0
                          ? 'Снять все'
                          : 'Выбрать все'}
                      </button>
                      {selectedIds.size > 0 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleBulkDelete}
                          className="h-7 text-xs gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          Удалить ({selectedIds.size})
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Config list */}
                  <div className="space-y-2">
                    {filteredConfigs.map((cfg) => (
                      <ConfigCard
                        key={cfg.id}
                        config={cfg}
                        onEdit={handleEditConfig}
                        onDelete={handleDeleteConfig}
                        onDuplicate={handleDuplicateConfig}
                        onExport={handleExportConfig}
                        deleting={deletingId === cfg.id}
                        duplicating={duplicatingId === cfg.id}
                        selected={selectedIds.has(cfg.id)}
                        onSelect={(checked) => toggleSelect(cfg.id, checked)}
                      />
                    ))}
                  </div>

                  {configFilter && filteredConfigs.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-4">
                      Ничего не найдено по запросу "{configFilter}"
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Скрытый input для импорта JSON */}
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportConfig}
            className="hidden"
          />

          {/* Default config */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base text-white">Конфигурация по умолчанию</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyConfig}
                className="text-gray-400 hover:text-white min-h-[40px] w-full sm:w-auto justify-center"
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
              <pre className="p-3 sm:p-4 rounded-lg bg-black/30 text-[11px] sm:text-sm font-mono text-gray-300 overflow-x-auto max-h-[50vh]">
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
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-400 flex-shrink-0">ID</span>
                <span className="text-gray-300 font-mono text-xs truncate min-w-0">{strategy.id}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-400 flex-shrink-0">Slug</span>
                <span className="text-gray-300 font-mono text-xs truncate min-w-0">{strategy.slug}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-400 flex-shrink-0">Движок</span>
                <span className="text-gray-300 truncate min-w-0 text-right">{strategy.engine_type}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Версия</span>
                {editingVersion ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      className="w-20 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-brand-premium"
                      value={versionDraft}
                      onChange={(e) => setVersionDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveVersion();
                        if (e.key === 'Escape') setEditingVersion(false);
                      }}
                      autoFocus
                    />
                    <button
                      onClick={saveVersion}
                      disabled={savingVersion}
                      className="p-0.5 rounded hover:bg-white/10 text-brand-profit transition-colors"
                    >
                      <Save className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingVersion(false)}
                      className="p-0.5 rounded hover:bg-white/10 text-gray-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-300 font-mono">{strategy.version}</span>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setVersionDraft(strategy.version);
                          setEditingVersion(true);
                        }}
                        className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
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
                  <span className="text-gray-300 text-xs">{[...new Set(configs.map((c) => c.symbol))].join(', ')}</span>
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
        engineType={strategy.engine_type}
        defaultConfig={strategy.default_config}
        editingConfig={editingConfig}
        onSaved={fetchConfigs}
      />
    </div>
  );
}
