import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FlaskConical,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Percent,
  AlertCircle,
  Settings2,
  History,
  Trash2,
  Download,
  StickyNote,
  Clock,
  CheckCircle2,
  XCircle,
  CircleDot,
  CalendarRange,
  DollarSign,
  CandlestickChart,
  Layers,
  Crosshair,
  Activity,
  ArrowDownRight,
  Flame,
  Snowflake,
  Timer,
  RefreshCw,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Copy,
  Save,
  Check,
  ClipboardPaste,
} from 'lucide-react';
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  createSeriesMarkers,
} from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SymbolSearch } from '@/components/ui/symbol-search';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import api from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select as SelectUI } from '@/components/ui/select';
import {
  type FullStrategyConfig,
  DEFAULT_CONFIG,
  RIBBON_TYPES,
  ON_REVERSE_OPTIONS,
  mergeConfig,
  detectEngineType,
  getCleanConfig,
  NumberField,
  ToggleField,
  MasArrayField,
  CollapsibleSection,
} from '@/components/strategy-config';
import type {
  StrategyConfig,
  StrategyConfigUpdate,
  BacktestRunResponse,
  BacktestResultResponse,
  BacktestResultTradeEntry,
  BacktestStatus,
} from '@/types/api';

/* ---- Types ---- */

interface BacktestResult {
  metrics: {
    total_trades: number;
    win_rate: number;
    profit_factor: number;
    total_pnl: number;
    max_drawdown: number;
    sharpe_ratio: number;
    avg_trade_pnl: number;
    best_trade: number;
    worst_trade: number;
  };
  equity_curve: { time: number; equity: number }[];
  trades: {
    id: number;
    side: 'long' | 'short';
    entry_time: string;
    exit_time: string;
    entry_price: number;
    exit_price: number;
    pnl: number;
    pnl_pct: number;
    exit_reason: string;
    entry_bar: number;
    exit_bar: number;
    entry_time_ms: number;
    exit_time_ms: number;
  }[];
  backtestSymbol?: string;
  backtestTimeframe?: string;
}

/* ---- Timeframe mapping ---- */

const TIMEFRAME_OPTIONS = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
] as const;

const CHART_TIMEFRAME_OPTIONS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
] as const;

const TIMEFRAME_TO_BACKEND: Record<string, string> = {
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
};

const BACKEND_TO_LABEL: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
};

/* ---- Backend response mapping ---- */

function mapBackendResultToUI(res: BacktestResultResponse): BacktestResult {
  const trades = res.trades_log.map((t: BacktestResultTradeEntry, idx: number) => {
    const entryMs = t.entry_time || 0;
    const exitMs = t.exit_time || 0;
    const entryDate = entryMs ? new Date(entryMs).toISOString().slice(0, 16).replace('T', ' ') : `bar ${t.entry_bar}`;
    const exitDate = exitMs ? new Date(exitMs).toISOString().slice(0, 16).replace('T', ' ') : `bar ${t.exit_bar}`;
    return {
      id: idx + 1,
      side: (t.direction === 'long' ? 'long' : 'short') as 'long' | 'short',
      entry_time: entryDate,
      exit_time: `${exitDate} (${t.exit_reason})`,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      pnl: t.pnl,
      pnl_pct: t.pnl_pct,
      exit_reason: t.exit_reason,
      entry_bar: t.entry_bar,
      exit_bar: t.exit_bar,
      entry_time_ms: entryMs,
      exit_time_ms: exitMs,
    };
  });

  const pnls = trades.map((t) => t.pnl);
  const avgTradePnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

  const equityCurve = res.equity_curve.map((pt) => ({
    time: pt.timestamp > 1e12 ? Math.floor(pt.timestamp / 1000) : pt.timestamp,
    equity: pt.equity,
  }));

  return {
    metrics: {
      total_trades: res.total_trades,
      win_rate: Number(res.win_rate) * 100,
      profit_factor: Number(res.profit_factor),
      total_pnl: Number(res.total_pnl),
      max_drawdown: Number(res.max_drawdown),
      sharpe_ratio: Number(res.sharpe_ratio),
      avg_trade_pnl: +avgTradePnl.toFixed(2),
      best_trade: +bestTrade.toFixed(2),
      worst_trade: +worstTrade.toFixed(2),
    },
    equity_curve: equityCurve,
    trades,
  };
}

/* ---- Component ---- */

export function Backtest() {
  const [searchParams] = useSearchParams();
  const urlConfigId = searchParams.get('config_id');

  // Strategy configs
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [selectedConfigId, setSelectedConfigId] = useState('');

  // Form state - загружаем из localStorage если есть
  const savedParams = useRef(() => {
    try {
      const raw = localStorage.getItem('algobond:backtest-params');
      return raw ? (JSON.parse(raw) as Record<string, string>) : null;
    } catch {
      return null;
    }
  });
  const saved = savedParams.current();
  const today = new Date().toISOString().slice(0, 10);
  const [symbol, setSymbol] = useState(saved?.symbol || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState(saved?.timeframe || '15m');
  const [startDate, setStartDate] = useState(saved?.startDate || '2026-01-01');
  const [endDate, setEndDate] = useState(saved?.endDate || today);
  const [initialCapital, setInitialCapital] = useState(saved?.initialCapital || '100');

  // Result state
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [runStatus, setRunStatus] = useState<BacktestStatus | null>(null);
  const [runProgress, setRunProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline config editor
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [editConfig, setEditConfig] = useState<FullStrategyConfig>(DEFAULT_CONFIG);
  const [engineType, setEngineType] = useState('supertrend_squeeze');
  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const { toast } = useToast();

  const updateSection = <K extends keyof FullStrategyConfig>(section: K, patch: Partial<FullStrategyConfig[K]>) => {
    setEditConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
    setConfigDirty(true);
  };

  // Polling ref for cleanup
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch user's strategy configs on mount
  useEffect(() => {
    api
      .get<StrategyConfig[]>('/strategies/configs/my')
      .then(({ data }) => {
        setConfigs(data);

        // Если есть config_id в URL - выбрать его и подтянуть symbol/timeframe
        if (urlConfigId) {
          const matched = data.find((c) => c.id === urlConfigId);
          if (matched) {
            setSelectedConfigId(matched.id);
            setSymbol(matched.symbol);
            // Конвертируем timeframe из бэкенд-формата (5) в UI-формат (5m)
            const tfLabel = BACKEND_TO_LABEL[matched.timeframe];
            if (tfLabel) setTimeframe(tfLabel);
            return;
          }
        }

        if (data.length > 0) {
          setSelectedConfigId(data[0].id);
        }
      })
      .catch(() => {
        setConfigs([]);
      })
      .finally(() => setConfigsLoading(false));
  }, [urlConfigId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const pollRunStatus = useCallback((runId: string): Promise<BacktestRunResponse> => {
    return new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        try {
          const { data: run } = await api.get<BacktestRunResponse>(`/backtest/runs/${runId}`);
          setRunStatus(run.status);
          setRunProgress(run.progress);

          if (run.status === 'completed') {
            clearInterval(poll);
            pollingRef.current = null;
            resolve(run);
          } else if (run.status === 'failed') {
            clearInterval(poll);
            pollingRef.current = null;
            reject(new Error(run.error_message ?? 'Бэктест завершился с ошибкой'));
          }
        } catch (err) {
          clearInterval(poll);
          pollingRef.current = null;
          reject(err);
        }
      }, 2000);
      pollingRef.current = poll;
    });
  }, []);

  // При выборе конфига - подставить символ, ТФ и загрузить конфиг для инлайн-редактора
  const handleConfigChange = useCallback(
    (configId: string) => {
      setSelectedConfigId(configId);
      const cfg = configs.find((c) => c.id === configId);
      if (cfg) {
        setSymbol(cfg.symbol);
        const tfMap: Record<string, string> = {
          '1': '1m',
          '5': '5m',
          '15': '15m',
          '30': '30m',
          '60': '1h',
          '240': '4h',
          D: '1D',
        };
        setTimeframe(tfMap[cfg.timeframe] || `${cfg.timeframe}m`);
        // Загрузить конфиг для инлайн-редактора
        const et = detectEngineType(cfg.config);
        setEngineType(et);
        setEditConfig(mergeConfig(DEFAULT_CONFIG, cfg.config));
        setConfigDirty(false);
      }
    },
    [configs],
  );

  // Инициализация конфига при первой загрузке
  useEffect(() => {
    if (configs.length > 0 && selectedConfigId) {
      const cfg = configs.find((c) => c.id === selectedConfigId);
      if (cfg) {
        const et = detectEngineType(cfg.config);
        setEngineType(et);
        setEditConfig(mergeConfig(DEFAULT_CONFIG, cfg.config));
        setConfigDirty(false);
      }
    }
  }, [configs, selectedConfigId]);

  // Сохранить конфиг в БД
  const handleSaveConfig = async () => {
    if (!selectedConfigId) return;
    setConfigSaving(true);
    try {
      const cleanConfig = getCleanConfig(editConfig, engineType);
      const payload: StrategyConfigUpdate = { config: cleanConfig };
      await api.patch(`/strategies/configs/${selectedConfigId}`, payload);
      // Обновить конфиг в локальном массиве
      const idx = configs.findIndex((c) => c.id === selectedConfigId);
      if (idx >= 0) {
        const updated = [...configs];
        updated[idx] = { ...updated[idx], config: cleanConfig };
        setConfigs(updated);
      }
      setConfigDirty(false);
      toast('Конфигурация сохранена', 'success');
    } catch {
      toast('Ошибка сохранения', 'error');
    } finally {
      setConfigSaving(false);
    }
  };

  // Копировать конфиг в буфер обмена
  const handleCopyConfig = async () => {
    try {
      const cfg = configs.find((c) => c.id === selectedConfigId);
      const cleanConfig = getCleanConfig(editConfig, engineType);
      const obj = {
        name: cfg?.name ?? '',
        symbol,
        timeframe: TIMEFRAME_TO_BACKEND[timeframe] ?? timeframe,
        config: cleanConfig,
      };
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      toast('Не удалось скопировать', 'error');
    }
  };

  // Вставить конфиг из буфера
  const handlePasteConfig = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) {
        toast('Невалидный JSON', 'error');
        return;
      }
      const obj = parsed as Record<string, unknown>;
      const configData =
        'config' in obj && typeof obj.config === 'object' && obj.config !== null
          ? (obj.config as Record<string, unknown>)
          : obj;
      setEditConfig(mergeConfig(DEFAULT_CONFIG, configData));
      setConfigDirty(true);
      toast('JSON вставлен', 'success');
    } catch {
      toast('Не удалось прочитать JSON', 'error');
    }
  };

  const runBacktest = async () => {
    if (!selectedConfigId) return;

    // Сохранить параметры в localStorage
    try {
      localStorage.setItem(
        'algobond:backtest-params',
        JSON.stringify({
          symbol,
          timeframe,
          startDate,
          endDate,
          initialCapital,
        }),
      );
    } catch {}

    setLoading(true);
    setResult(null);
    setErrorMessage(null);
    setRunStatus('pending');
    setRunProgress(0);

    try {
      // Step 1: Create run
      const { data: run } = await api.post<BacktestRunResponse>('/backtest/runs', {
        strategy_config_id: selectedConfigId,
        symbol,
        timeframe: TIMEFRAME_TO_BACKEND[timeframe] ?? timeframe,
        start_date: `${startDate}T00:00:00Z`,
        end_date: `${endDate}T23:59:59Z`,
        initial_capital: Number(initialCapital),
      });

      setRunStatus(run.status);

      // Step 2: Poll for completion
      if (run.status === 'completed') {
        // Already done (sync backtest)
      } else if (run.status === 'failed') {
        throw new Error(run.error_message ?? 'Бэктест завершился с ошибкой');
      } else {
        await pollRunStatus(run.id);
      }

      // Step 3: Fetch results
      const { data: resultData } = await api.get<BacktestResultResponse>(`/backtest/runs/${run.id}/result`);

      const mapped = mapBackendResultToUI(resultData);
      mapped.backtestSymbol = symbol;
      mapped.backtestTimeframe = TIMEFRAME_TO_BACKEND[timeframe] ?? timeframe;
      setResult(mapped);
      setRunStatus('completed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setErrorMessage(message);

      // Demo fallback
      setResult(generateDemoResult(Number(initialCapital)));
      setRunStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // History state
  const [historyRuns, setHistoryRuns] = useState<BacktestRunResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [topTab, setTopTab] = useState('new');

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get<BacktestRunResponse[]>('/backtest/runs');
      setHistoryRuns(data);
    } catch {
      setHistoryRuns([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Fetch history when switching to history tab
  useEffect(() => {
    if (topTab === 'history') {
      fetchHistory();
    }
  }, [topTab, fetchHistory]);

  const handleLoadResult = (loaded: BacktestResult) => {
    setResult(loaded);
    setTopTab('new');
  };

  const configOptions = configs.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.symbol} / ${c.timeframe})`,
  }));

  const hasNoConfigs = !configsLoading && configs.length === 0;

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* ---- Page Header ---- */}
      <div className="relative">
        <div className="absolute -inset-x-4 -top-4 h-32 bg-gradient-to-b from-brand-accent/[0.03] to-transparent rounded-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-accent/20 to-brand-premium/10 border border-brand-accent/20 shadow-lg shadow-brand-accent/5">
                <FlaskConical className="h-6 w-6 text-brand-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight font-[Tektur]">Бэктест</h1>
                <p className="text-sm text-gray-500 mt-0.5">Проверьте стратегию на исторических данных</p>
              </div>
            </div>
          </div>
          <div className="mt-5 h-px bg-gradient-to-r from-brand-accent/30 via-brand-premium/10 to-transparent" />
        </div>
      </div>

      {/* ---- Top-level tabs: Новый бэктест / История ---- */}
      <Tabs defaultValue="new" value={topTab} onValueChange={setTopTab}>
        <TabsList className="bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="new" className="rounded-lg px-4 py-2 text-xs gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            Новый бэктест
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-4 py-2 text-xs gap-1.5">
            <History className="h-3.5 w-3.5" />
            История
            {historyRuns.length > 0 && (
              <span className="ml-1 text-[10px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded-full font-mono leading-none">
                {historyRuns.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-6">
          {/* No configs warning */}
          {hasNoConfigs && (
            <Card className="border-brand-premium/20 bg-brand-premium/[0.04] mb-6">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10 border border-brand-premium/20 shrink-0">
                  <AlertCircle className="h-4.5 w-4.5 text-brand-premium" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Нет конфигураций стратегий</p>
                  <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                    Для запуска бэктеста нужна конфигурация стратегии. Создайте её на странице{' '}
                    <a href="/strategies" className="text-brand-premium hover:underline font-medium">
                      Стратегии
                    </a>
                    .
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---- Config Form ---- */}
          <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
            <CardContent className="p-3 sm:p-6">
              {/* Section: Strategy Configuration */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 className="h-4 w-4 text-brand-accent" />
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Конфигурация стратегии
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <Layers className="h-3 w-3" />
                      Стратегия
                    </label>
                    {configsLoading ? (
                      <div className="flex h-9 items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                        <span className="ml-2 text-sm text-gray-500">Загрузка...</span>
                      </div>
                    ) : configs.length > 0 ? (
                      <Select
                        value={selectedConfigId}
                        onChange={handleConfigChange}
                        options={configOptions}
                        className="w-full"
                      />
                    ) : (
                      <div className="flex h-9 items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3">
                        <span className="text-sm text-gray-500">Нет конфигураций</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <CandlestickChart className="h-3 w-3" />
                      Символ
                    </label>
                    <SymbolSearch value={symbol} onChange={setSymbol} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <Timer className="h-3 w-3" />
                      Таймфрейм
                    </label>
                    <Select
                      value={timeframe}
                      onChange={setTimeframe}
                      options={[...TIMEFRAME_OPTIONS]}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.04] mb-6" />

              {/* Section: Market Parameters */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarRange className="h-4 w-4 text-brand-premium" />
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Параметры теста</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <CalendarRange className="h-3 w-3" />
                      Начало
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-white/[0.03] border-white/[0.06] text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <CalendarRange className="h-3 w-3" />
                      Конец
                    </label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-white/[0.03] border-white/[0.06] text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <DollarSign className="h-3 w-3" />
                      Начальный капитал
                    </label>
                    <Input
                      type="number"
                      value={initialCapital}
                      onChange={(e) => setInitialCapital(e.target.value)}
                      className="bg-white/[0.03] border-white/[0.06] text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.04] mb-6" />

              {/* Section: Config Editor (collapsible) */}
              {selectedConfigId && (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setShowConfigEditor((v) => !v)}
                    className="flex items-center gap-2 mb-4 group w-full"
                  >
                    <Settings2 className="h-4 w-4 text-brand-accent" />
                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Параметры конфига
                    </span>
                    {configDirty && (
                      <span className="text-[10px] bg-brand-premium/20 text-brand-premium px-1.5 py-0.5 rounded-full font-mono">
                        изменено
                      </span>
                    )}
                    <span className="ml-auto">
                      {showConfigEditor ? (
                        <ChevronUp className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      )}
                    </span>
                  </button>

                  {showConfigEditor && (
                    <div className="space-y-3">
                      {/* KNN секция (для lorentzian_knn и hybrid) */}
                      {(engineType === 'lorentzian_knn' || engineType === 'hybrid_knn_supertrend') && (
                        <CollapsibleSection title="KNN" description="Параметры Lorentzian KNN классификатора">
                          <div className="grid grid-cols-2 gap-3">
                            <NumberField
                              label="Соседи"
                              value={editConfig.knn.neighbors}
                              onChange={(v) => updateSection('knn', { neighbors: v })}
                              min={1}
                              max={50}
                            />
                            <NumberField
                              label="Глубина"
                              value={editConfig.knn.lookback}
                              onChange={(v) => updateSection('knn', { lookback: v })}
                              min={10}
                              max={200}
                            />
                            <NumberField
                              label="Вес"
                              value={editConfig.knn.weight}
                              onChange={(v) => updateSection('knn', { weight: v })}
                              min={0}
                              max={1}
                              step={0.1}
                            />
                            <NumberField
                              label="RSI период"
                              value={editConfig.knn.rsi_period}
                              onChange={(v) => updateSection('knn', { rsi_period: v })}
                              min={1}
                            />
                            <NumberField
                              label="WT Channel"
                              value={editConfig.knn.wt_ch_len}
                              onChange={(v) => updateSection('knn', { wt_ch_len: v })}
                              min={1}
                            />
                            <NumberField
                              label="WT Average"
                              value={editConfig.knn.wt_avg_len}
                              onChange={(v) => updateSection('knn', { wt_avg_len: v })}
                              min={1}
                            />
                            <NumberField
                              label="CCI период"
                              value={editConfig.knn.cci_period}
                              onChange={(v) => updateSection('knn', { cci_period: v })}
                              min={1}
                            />
                            <NumberField
                              label="ADX период"
                              value={editConfig.knn.adx_period}
                              onChange={(v) => updateSection('knn', { adx_period: v })}
                              min={1}
                            />
                          </div>
                        </CollapsibleSection>
                      )}

                      {/* Trend (lorentzian_knn) */}
                      {engineType === 'lorentzian_knn' && (
                        <>
                          <CollapsibleSection title="Trend" description="EMA фильтры тренда">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <NumberField
                                label="EMA Fast"
                                value={editConfig.trend.ema_fast}
                                onChange={(v) => updateSection('trend', { ema_fast: v })}
                                min={1}
                              />
                              <NumberField
                                label="EMA Slow"
                                value={editConfig.trend.ema_slow}
                                onChange={(v) => updateSection('trend', { ema_slow: v })}
                                min={1}
                              />
                              <NumberField
                                label="EMA Filter"
                                value={editConfig.trend.ema_filter}
                                onChange={(v) => updateSection('trend', { ema_filter: v })}
                                min={1}
                              />
                            </div>
                          </CollapsibleSection>
                          <CollapsibleSection title="MA Ribbon" description="Лента скользящих средних">
                            <ToggleField
                              label="Использовать"
                              value={editConfig.ribbon.use}
                              onChange={(v) => updateSection('ribbon', { use: v })}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs text-gray-400">Тип MA</Label>
                                <SelectUI
                                  options={RIBBON_TYPES}
                                  value={editConfig.ribbon.type}
                                  onChange={(v) => updateSection('ribbon', { type: v })}
                                />
                              </div>
                              <NumberField
                                label="Порог"
                                value={editConfig.ribbon.threshold}
                                onChange={(v) => updateSection('ribbon', { threshold: v })}
                                min={1}
                              />
                            </div>
                            <MasArrayField
                              value={editConfig.ribbon.mas}
                              onChange={(v) => updateSection('ribbon', { mas: v })}
                            />
                          </CollapsibleSection>
                          <CollapsibleSection title="Order Flow" description="Анализ потока ордеров">
                            <ToggleField
                              label="Использовать"
                              value={editConfig.order_flow.use}
                              onChange={(v) => updateSection('order_flow', { use: v })}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <NumberField
                                label="CVD период"
                                value={editConfig.order_flow.cvd_period}
                                onChange={(v) => updateSection('order_flow', { cvd_period: v })}
                                min={1}
                              />
                              <NumberField
                                label="CVD порог"
                                value={editConfig.order_flow.cvd_threshold}
                                onChange={(v) =>
                                  updateSection('order_flow', {
                                    cvd_threshold: v,
                                  })
                                }
                                min={0}
                                max={1}
                                step={0.1}
                              />
                            </div>
                          </CollapsibleSection>
                          <CollapsibleSection title="SMC" description="Smart Money Concepts">
                            <ToggleField
                              label="Использовать"
                              value={editConfig.smc.use}
                              onChange={(v) => updateSection('smc', { use: v })}
                            />
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <NumberField
                                label="FVG мин. размер"
                                value={editConfig.smc.fvg_min_size}
                                onChange={(v) => updateSection('smc', { fvg_min_size: v })}
                                min={0}
                                step={0.1}
                              />
                              <NumberField
                                label="Ликвидность lookback"
                                value={editConfig.smc.liquidity_lookback}
                                onChange={(v) =>
                                  updateSection('smc', {
                                    liquidity_lookback: v,
                                  })
                                }
                                min={1}
                              />
                              <NumberField
                                label="BOS pivot"
                                value={editConfig.smc.bos_pivot}
                                onChange={(v) => updateSection('smc', { bos_pivot: v })}
                                min={1}
                              />
                            </div>
                          </CollapsibleSection>
                          <CollapsibleSection title="Filters" description="ADX, объём и confluence фильтры">
                            <div className="grid grid-cols-2 gap-3">
                              <NumberField
                                label="ADX период"
                                value={editConfig.filters.adx_period}
                                onChange={(v) => updateSection('filters', { adx_period: v })}
                                min={1}
                              />
                              <NumberField
                                label="ADX порог"
                                value={editConfig.filters.adx_threshold}
                                onChange={(v) => updateSection('filters', { adx_threshold: v })}
                                min={0}
                              />
                              <NumberField
                                label="Объём множитель"
                                value={editConfig.filters.volume_mult}
                                onChange={(v) => updateSection('filters', { volume_mult: v })}
                                min={0}
                                step={0.1}
                              />
                              <NumberField
                                label="Min confluence"
                                value={editConfig.filters.min_confluence}
                                onChange={(v) =>
                                  updateSection('filters', {
                                    min_confluence: v,
                                  })
                                }
                                min={0}
                                max={5.5}
                                step={0.5}
                              />
                            </div>
                          </CollapsibleSection>
                        </>
                      )}

                      {/* SuperTrend (supertrend_squeeze и hybrid) */}
                      {(engineType === 'supertrend_squeeze' || engineType === 'hybrid_knn_supertrend') && (
                        <>
                          <CollapsibleSection title="SuperTrend" description="Triple SuperTrend параметры" defaultOpen>
                            <div className="grid grid-cols-2 gap-3">
                              <NumberField
                                label="ST1 период"
                                value={editConfig.supertrend.st1_period}
                                onChange={(v) => updateSection('supertrend', { st1_period: v })}
                                min={2}
                              />
                              <NumberField
                                label="ST1 множитель"
                                value={editConfig.supertrend.st1_mult}
                                onChange={(v) => updateSection('supertrend', { st1_mult: v })}
                                min={0.1}
                                step={0.1}
                              />
                              <NumberField
                                label="ST2 период"
                                value={editConfig.supertrend.st2_period}
                                onChange={(v) => updateSection('supertrend', { st2_period: v })}
                                min={2}
                              />
                              <NumberField
                                label="ST2 множитель"
                                value={editConfig.supertrend.st2_mult}
                                onChange={(v) => updateSection('supertrend', { st2_mult: v })}
                                min={0.1}
                                step={0.25}
                              />
                              <NumberField
                                label="ST3 период"
                                value={editConfig.supertrend.st3_period}
                                onChange={(v) => updateSection('supertrend', { st3_period: v })}
                                min={2}
                              />
                              <NumberField
                                label="ST3 множитель"
                                value={editConfig.supertrend.st3_mult}
                                onChange={(v) => updateSection('supertrend', { st3_mult: v })}
                                min={0.1}
                                step={0.5}
                              />
                              <NumberField
                                label="Мин. согласие"
                                value={editConfig.supertrend.min_agree}
                                onChange={(v) => updateSection('supertrend', { min_agree: v })}
                                min={1}
                                max={3}
                              />
                            </div>
                          </CollapsibleSection>

                          <CollapsibleSection
                            title="Squeeze Momentum"
                            description="Bollinger/Keltner squeeze + momentum"
                          >
                            <div className="grid grid-cols-2 gap-3">
                              <div className="col-span-2 flex items-center justify-between">
                                <span className="text-xs text-gray-400">Включить Squeeze</span>
                                <Checkbox
                                  checked={editConfig.squeeze.use}
                                  onChange={(v) => updateSection('squeeze', { use: v })}
                                />
                              </div>
                              <NumberField
                                label="BB период"
                                value={editConfig.squeeze.bb_period}
                                onChange={(v) => updateSection('squeeze', { bb_period: v })}
                                min={2}
                              />
                              <NumberField
                                label="BB множитель"
                                value={editConfig.squeeze.bb_mult}
                                onChange={(v) => updateSection('squeeze', { bb_mult: v })}
                                min={0.1}
                                step={0.1}
                              />
                              <NumberField
                                label="KC период"
                                value={editConfig.squeeze.kc_period}
                                onChange={(v) => updateSection('squeeze', { kc_period: v })}
                                min={2}
                              />
                              <NumberField
                                label="KC множитель"
                                value={editConfig.squeeze.kc_mult}
                                onChange={(v) => updateSection('squeeze', { kc_mult: v })}
                                min={0.1}
                                step={0.1}
                              />
                              <NumberField
                                label="Мин. длительность"
                                value={editConfig.squeeze.min_duration}
                                onChange={(v) => updateSection('squeeze', { min_duration: v })}
                                min={0}
                              />
                              <NumberField
                                label="Макс. вес"
                                value={editConfig.squeeze.max_weight}
                                onChange={(v) => updateSection('squeeze', { max_weight: v })}
                                min={0.1}
                                step={0.1}
                              />
                            </div>
                          </CollapsibleSection>

                          <CollapsibleSection title="Entry" description="RSI фильтры и объём">
                            <div className="grid grid-cols-2 gap-3">
                              <NumberField
                                label="RSI период"
                                value={editConfig.entry.rsi_period}
                                onChange={(v) => updateSection('entry', { rsi_period: v })}
                                min={2}
                              />
                              <NumberField
                                label="RSI long max"
                                value={editConfig.entry.rsi_long_max}
                                onChange={(v) => updateSection('entry', { rsi_long_max: v })}
                                min={0}
                                max={100}
                              />
                              <NumberField
                                label="RSI short min"
                                value={editConfig.entry.rsi_short_min}
                                onChange={(v) => updateSection('entry', { rsi_short_min: v })}
                                min={0}
                                max={100}
                              />
                              <NumberField
                                label="Объём множитель"
                                value={editConfig.entry.volume_mult}
                                onChange={(v) => updateSection('entry', { volume_mult: v })}
                                min={0.1}
                                step={0.1}
                              />
                            </div>
                          </CollapsibleSection>

                          <CollapsibleSection title="Trend Filter" description="EMA + ADX тренд-фильтр">
                            <div className="grid grid-cols-2 gap-3">
                              <NumberField
                                label="EMA период"
                                value={editConfig.trend_filter.ema_period}
                                onChange={(v) =>
                                  updateSection('trend_filter', {
                                    ema_period: v,
                                  })
                                }
                                min={2}
                              />
                              <NumberField
                                label="ADX период"
                                value={editConfig.trend_filter.adx_period}
                                onChange={(v) =>
                                  updateSection('trend_filter', {
                                    adx_period: v,
                                  })
                                }
                                min={2}
                              />
                              <NumberField
                                label="ADX порог"
                                value={editConfig.trend_filter.adx_threshold}
                                onChange={(v) =>
                                  updateSection('trend_filter', {
                                    adx_threshold: v,
                                  })
                                }
                                min={0}
                              />
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">Использовать ADX</span>
                                <Checkbox
                                  checked={editConfig.trend_filter.use_adx}
                                  onChange={(v) =>
                                    updateSection('trend_filter', {
                                      use_adx: v,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </CollapsibleSection>

                          <CollapsibleSection title="Режим волатильности" description="Адаптация к рыночным условиям">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="col-span-2 flex items-center justify-between">
                                <span className="text-xs text-gray-400">Включить</span>
                                <Checkbox
                                  checked={editConfig.regime.use}
                                  onChange={(v) => updateSection('regime', { use: v })}
                                />
                              </div>
                              <NumberField
                                label="ADX ranging"
                                value={editConfig.regime.adx_ranging}
                                onChange={(v) => updateSection('regime', { adx_ranging: v })}
                                min={0}
                              />
                              <NumberField
                                label="ATR high vol %"
                                value={editConfig.regime.atr_high_vol_pct}
                                onChange={(v) =>
                                  updateSection('regime', {
                                    atr_high_vol_pct: v,
                                  })
                                }
                                min={0}
                                max={100}
                              />
                              <NumberField
                                label="Vol scale"
                                value={editConfig.regime.vol_scale}
                                onChange={(v) => updateSection('regime', { vol_scale: v })}
                                min={1}
                                step={0.1}
                              />
                            </div>
                          </CollapsibleSection>

                          <CollapsibleSection title="Time Filter" description="Блокировка входов в шумные часы UTC">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="col-span-2 flex items-center justify-between">
                                <span className="text-xs text-gray-400">Включить</span>
                                <Checkbox
                                  checked={editConfig.time_filter.use}
                                  onChange={(v) => updateSection('time_filter', { use: v })}
                                />
                              </div>
                              <NumberField
                                label="Блок с (UTC)"
                                value={editConfig.time_filter.block_start_utc}
                                onChange={(v) =>
                                  updateSection('time_filter', {
                                    block_start_utc: v,
                                  })
                                }
                                min={0}
                                max={23}
                              />
                              <NumberField
                                label="Блок до (UTC)"
                                value={editConfig.time_filter.block_end_utc}
                                onChange={(v) =>
                                  updateSection('time_filter', {
                                    block_end_utc: v,
                                  })
                                }
                                min={0}
                                max={23}
                              />
                            </div>
                          </CollapsibleSection>
                        </>
                      )}

                      {/* Hybrid KNN Filter */}
                      {engineType === 'hybrid_knn_supertrend' && (
                        <CollapsibleSection
                          title="Hybrid KNN Filter"
                          description="Фильтрация через KNN confidence"
                          defaultOpen
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <NumberField
                              label="Мин. confidence"
                              value={editConfig.hybrid.knn_min_confidence}
                              onChange={(v) =>
                                updateSection('hybrid', {
                                  knn_min_confidence: v,
                                })
                              }
                              min={0}
                              max={100}
                              step={5}
                            />
                            <NumberField
                              label="Мин. score"
                              value={editConfig.hybrid.knn_min_score}
                              onChange={(v) => updateSection('hybrid', { knn_min_score: v })}
                              min={0}
                              max={1}
                              step={0.05}
                            />
                            <NumberField
                              label="Boost порог"
                              value={editConfig.hybrid.knn_boost_threshold}
                              onChange={(v) =>
                                updateSection('hybrid', {
                                  knn_boost_threshold: v,
                                })
                              }
                              min={0}
                              max={100}
                              step={5}
                            />
                            <NumberField
                              label="Boost множитель"
                              value={editConfig.hybrid.knn_boost_mult}
                              onChange={(v) => updateSection('hybrid', { knn_boost_mult: v })}
                              min={1}
                              max={3}
                              step={0.1}
                            />
                            <div className="col-span-2 flex items-center justify-between">
                              <span className="text-xs text-gray-400">Проверять направление KNN</span>
                              <Checkbox
                                checked={editConfig.hybrid.use_knn_direction}
                                onChange={(v) =>
                                  updateSection('hybrid', {
                                    use_knn_direction: v,
                                  })
                                }
                              />
                            </div>
                          </div>
                        </CollapsibleSection>
                      )}

                      {/* Risk Management */}
                      <CollapsibleSection title="Risk Management" description="Стоп-лосс, тейк-профит, трейлинг">
                        <div className="grid grid-cols-2 gap-3">
                          <NumberField
                            label="ATR период"
                            value={editConfig.risk.atr_period}
                            onChange={(v) => updateSection('risk', { atr_period: v })}
                            min={1}
                          />
                          <NumberField
                            label="Stop (ATR x)"
                            value={editConfig.risk.stop_atr_mult}
                            onChange={(v) => updateSection('risk', { stop_atr_mult: v })}
                            min={0.5}
                            step={0.5}
                          />
                          <NumberField
                            label="Take Profit (ATR x)"
                            value={editConfig.risk.tp_atr_mult}
                            onChange={(v) => updateSection('risk', { tp_atr_mult: v })}
                            min={1}
                            step={1}
                          />
                          <NumberField
                            label="Trailing (ATR x)"
                            value={editConfig.risk.trailing_atr_mult}
                            onChange={(v) => updateSection('risk', { trailing_atr_mult: v })}
                            min={1}
                            step={1}
                          />
                        </div>
                        <ToggleField
                          label="Трейлинг-стоп"
                          value={editConfig.risk.use_trailing}
                          onChange={(v) => updateSection('risk', { use_trailing: v })}
                        />
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <NumberField
                            label="Min баров до trailing"
                            value={editConfig.risk.min_bars_trailing}
                            onChange={(v) => updateSection('risk', { min_bars_trailing: v })}
                            min={0}
                            max={50}
                          />
                          <NumberField
                            label="Cooldown после стопа"
                            value={editConfig.risk.cooldown_bars}
                            onChange={(v) => updateSection('risk', { cooldown_bars: v })}
                            min={0}
                            max={50}
                            suffix="баров"
                          />
                        </div>
                      </CollapsibleSection>

                      {/* Multi-TP / Breakeven */}
                      <CollapsibleSection title="Multi-TP / Breakeven" description="Частичное закрытие + безубыток">
                        <ToggleField
                          label="Multi-level TP"
                          value={editConfig.risk.use_multi_tp}
                          onChange={(v) => updateSection('risk', { use_multi_tp: v })}
                        />
                        {editConfig.risk.use_multi_tp && (
                          <div className="space-y-2 mt-3">
                            {editConfig.risk.tp_levels.map((lvl, idx) => (
                              <div key={idx} className="grid grid-cols-2 gap-3">
                                <NumberField
                                  label={`TP${idx + 1} расстояние`}
                                  value={lvl.atr_mult}
                                  onChange={(v) => {
                                    const levels = [...editConfig.risk.tp_levels];
                                    levels[idx] = {
                                      ...levels[idx],
                                      atr_mult: v,
                                    };
                                    updateSection('risk', {
                                      tp_levels: levels,
                                    });
                                  }}
                                  min={1}
                                  suffix="x ATR"
                                />
                                <NumberField
                                  label={`TP${idx + 1} объём`}
                                  value={lvl.close_pct}
                                  onChange={(v) => {
                                    const levels = [...editConfig.risk.tp_levels];
                                    levels[idx] = {
                                      ...levels[idx],
                                      close_pct: v,
                                    };
                                    updateSection('risk', {
                                      tp_levels: levels,
                                    });
                                  }}
                                  min={1}
                                  max={100}
                                  suffix="%"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-3">
                          <ToggleField
                            label="Безубыток при TP1"
                            value={editConfig.risk.use_breakeven}
                            onChange={(v) => updateSection('risk', { use_breakeven: v })}
                          />
                        </div>
                      </CollapsibleSection>

                      {/* Торговля */}
                      <CollapsibleSection title="Торговля" description="Плечо, размеры ордеров, комиссия">
                        <div className="flex items-end gap-3">
                          <div className="w-24 shrink-0">
                            <NumberField
                              label="Плечо"
                              value={editConfig.live.leverage}
                              onChange={(v) => updateSection('live', { leverage: v })}
                              min={1}
                              max={100}
                              suffix="x"
                            />
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <Label className="text-xs text-gray-400">При обратном сигнале</Label>
                            <SelectUI
                              options={ON_REVERSE_OPTIONS}
                              value={editConfig.live.on_reverse}
                              onChange={(v) => updateSection('live', { on_reverse: v })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-3 mt-3 border-t border-white/5">
                          <div className="space-y-2.5">
                            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                              Бэктест
                            </span>
                            <NumberField
                              label="Ордер"
                              value={editConfig.backtest.order_size}
                              onChange={(v) => updateSection('backtest', { order_size: v })}
                              min={1}
                              max={100}
                              suffix="%"
                            />
                            <NumberField
                              label="Комиссия"
                              value={editConfig.backtest.commission}
                              onChange={(v) => updateSection('backtest', { commission: v })}
                              min={0}
                              step={0.01}
                              suffix="%"
                            />
                            <NumberField
                              label="Slippage"
                              value={editConfig.backtest.slippage}
                              onChange={(v) => updateSection('backtest', { slippage: v })}
                              min={0}
                              step={0.01}
                              suffix="%"
                            />
                            <div className="flex items-center justify-between py-1">
                              <span className="text-xs text-gray-400">ST Flip Exit</span>
                              <Checkbox
                                checked={editConfig.backtest.use_supertrend_exit}
                                onChange={(checked: boolean) =>
                                  updateSection('backtest', {
                                    use_supertrend_exit: checked,
                                  })
                                }
                                className="h-4 w-4"
                              />
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                              Live / Demo
                            </span>
                            <NumberField
                              label="Ордер"
                              value={editConfig.live.order_size}
                              onChange={(v) => updateSection('live', { order_size: v })}
                              min={1}
                              max={100}
                              suffix="%"
                            />
                          </div>
                        </div>
                      </CollapsibleSection>

                      {/* Кнопки: Copy / Paste / Save */}
                      <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyConfig}
                          className="text-gray-400 hover:text-brand-accent"
                        >
                          {copySuccess ? (
                            <Check className="mr-1.5 h-3.5 w-3.5 text-brand-profit" />
                          ) : (
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {copySuccess ? 'Скопировано' : 'Копировать JSON'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handlePasteConfig}
                          className="text-gray-400 hover:text-brand-accent"
                        >
                          <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
                          Вставить
                        </Button>
                        <div className="ml-auto">
                          <Button
                            size="sm"
                            onClick={handleSaveConfig}
                            disabled={configSaving || !configDirty}
                            className="bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 border border-brand-accent/20"
                          >
                            {configSaving ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Сохранить конфиг
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-white/[0.04] mb-6" />

              {/* Run button + progress */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Button
                  onClick={runBacktest}
                  disabled={loading || !selectedConfigId}
                  className="bg-gradient-to-r from-brand-premium to-amber-500 text-brand-bg hover:opacity-90 font-semibold shadow-lg shadow-brand-premium/20 w-full sm:w-auto sm:min-w-[160px] h-11 sm:h-10 text-sm transition-opacity"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Запустить тест
                    </>
                  )}
                </Button>

                {/* Progress indicator */}
                {loading && runStatus && (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-premium" />
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">
                        {runStatus === 'pending' && 'Запуск бэктеста...'}
                        {runStatus === 'running' && `Вычисление... ${runProgress}%`}
                        {runStatus === 'completed' && 'Загрузка результатов...'}
                      </span>
                      {runStatus === 'running' && (
                        <div className="w-40 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-premium to-amber-500 rounded-full transition-all duration-300"
                            style={{ width: `${runProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Error message */}
              {errorMessage && (
                <div className="mt-4 flex items-center gap-2.5 text-sm text-brand-loss bg-brand-loss/[0.06] border border-brand-loss/10 rounded-lg px-4 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage} (показаны демо-данные)</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Results ---- */}
          {result && (
            <div className="space-y-6 mt-6">
              {/* Metrics summary bar */}
              <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                <CardContent className="p-0">
                  {/* Metrics header */}
                  <div className="px-3 sm:px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                    <Activity className="h-4 w-4 text-brand-accent" />
                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Результаты</span>
                    <span className="text-xs text-gray-600 font-mono ml-auto">
                      {result.metrics.total_trades} сделок
                    </span>
                  </div>
                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 divide-x divide-white/[0.04]">
                    <MetricCell
                      label="Сделок"
                      value={String(result.metrics.total_trades)}
                      icon={BarChart3}
                      color="text-brand-accent"
                    />
                    <MetricCell
                      label="Win Rate"
                      value={`${result.metrics.win_rate.toFixed(1)}%`}
                      icon={Target}
                      color={result.metrics.win_rate >= 50 ? 'text-brand-profit' : 'text-brand-loss'}
                    />
                    <MetricCell
                      label="Profit Factor"
                      value={result.metrics.profit_factor >= 999 ? 'Inf' : result.metrics.profit_factor.toFixed(2)}
                      icon={TrendingUp}
                      color={result.metrics.profit_factor >= 1 ? 'text-brand-profit' : 'text-brand-loss'}
                    />
                    <MetricCell
                      label="Итого P&L"
                      value={`$${result.metrics.total_pnl.toFixed(0)}`}
                      icon={result.metrics.total_pnl >= 0 ? TrendingUp : TrendingDown}
                      color={result.metrics.total_pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'}
                      highlight
                    />
                    <MetricCell
                      label="Max DD"
                      value={`${result.metrics.max_drawdown.toFixed(1)}%`}
                      icon={ArrowDownRight}
                      color="text-brand-loss"
                    />
                    <MetricCell
                      label="Sharpe"
                      value={result.metrics.sharpe_ratio.toFixed(2)}
                      icon={Percent}
                      color={result.metrics.sharpe_ratio >= 1 ? 'text-brand-premium' : 'text-gray-400'}
                    />
                    <MetricCell
                      label="Avg Trade"
                      value={`$${result.metrics.avg_trade_pnl.toFixed(2)}`}
                      icon={Crosshair}
                      color={result.metrics.avg_trade_pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'}
                    />
                    <MetricCell
                      label="Best"
                      value={`$${result.metrics.best_trade.toFixed(2)}`}
                      icon={Flame}
                      color="text-brand-profit"
                    />
                    <MetricCell
                      label="Worst"
                      value={`$${result.metrics.worst_trade.toFixed(2)}`}
                      icon={Snowflake}
                      color="text-brand-loss"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Charts & Trades tabs */}
              <Tabs defaultValue="chart">
                <TabsList className="bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                  <TabsTrigger value="chart" className="rounded-lg px-4 py-2 text-xs gap-1.5">
                    <CandlestickChart className="h-3.5 w-3.5" />
                    График сделок
                  </TabsTrigger>
                  <TabsTrigger value="equity" className="rounded-lg px-4 py-2 text-xs gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Equity Curve
                  </TabsTrigger>
                  <TabsTrigger value="trades" className="rounded-lg px-4 py-2 text-xs gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Сделки
                    <span className="ml-1 text-[10px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded-full font-mono leading-none">
                      {result.trades.length}
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="chart" className="mt-4">
                  <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                    <CardContent className="p-0">
                      <TradesChart
                        symbol={result.backtestSymbol || symbol}
                        timeframe={(result.backtestTimeframe || TIMEFRAME_TO_BACKEND[timeframe]) ?? timeframe}
                        startDate={startDate}
                        endDate={endDate}
                        trades={result.trades}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="equity" className="mt-4">
                  <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                    <CardContent className="p-0">
                      <div className="px-3 sm:px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-brand-premium" />
                        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Equity Curve
                        </span>
                        <span className="text-xs text-gray-600 font-mono ml-auto">
                          $
                          {result.equity_curve.length > 0
                            ? result.equity_curve[result.equity_curve.length - 1].equity.toFixed(0)
                            : '0'}
                        </span>
                      </div>
                      <EquityChart data={result.equity_curve} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="trades" className="mt-4">
                  <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">
                    <CardContent className="p-0">
                      <div className="px-3 sm:px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-brand-accent" />
                        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Журнал сделок
                        </span>
                        <span className="text-xs text-gray-600 font-mono ml-auto">{result.trades.length} записей</span>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/[0.04] hover:bg-transparent">
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">
                                #
                              </TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">
                                Сторона
                              </TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">
                                Вход
                              </TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">
                                Выход
                              </TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">
                                Цена входа
                              </TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">
                                Цена выхода
                              </TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold text-right">
                                P&L
                              </TableHead>
                              <TableHead className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold text-right">
                                P&L %
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.trades.map((trade, idx) => (
                              <TableRow
                                key={trade.id}
                                className={`border-white/[0.03] transition-colors hover:bg-white/[0.02] ${
                                  idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]'
                                }`}
                              >
                                <TableCell className="font-mono text-xs text-gray-500">{trade.id}</TableCell>
                                <TableCell>
                                  <Badge variant={trade.side === 'long' ? 'profit' : 'loss'}>
                                    {trade.side.toUpperCase()}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs font-mono text-gray-400">{trade.entry_time}</TableCell>
                                <TableCell className="text-xs font-mono text-gray-400">{trade.exit_time}</TableCell>
                                <TableCell className="font-mono text-xs text-gray-300">
                                  ${trade.entry_price.toFixed(2)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-gray-300">
                                  ${trade.exit_price.toFixed(2)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-mono text-xs font-bold ${
                                    trade.pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                                  }`}
                                >
                                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-mono text-xs ${
                                    trade.pnl_pct >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                                  }`}
                                >
                                  {trade.pnl_pct >= 0 ? '+' : ''}
                                  {trade.pnl_pct.toFixed(2)}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && (
            <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] mt-6">
              <CardContent className="flex flex-col items-center justify-center py-24">
                <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-accent/10 to-brand-premium/5 border border-brand-accent/10 mb-6">
                  <FlaskConical className="h-9 w-9 text-gray-600" />
                </div>
                <p className="text-gray-300 text-lg font-semibold font-[Tektur] tracking-tight">Запустите бэктест</p>
                <p className="text-gray-500 text-sm mt-2 max-w-xs text-center leading-relaxed">
                  Выберите конфигурацию стратегии, настройте параметры и нажмите "Запустить тест"
                </p>
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {loading && !result && (
            <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] mt-6">
              <CardContent className="flex flex-col items-center justify-center py-24">
                <div className="relative">
                  <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-premium/10 to-brand-accent/5 border border-brand-premium/10">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
                  </div>
                </div>
                <p className="text-gray-300 text-lg font-semibold font-[Tektur] tracking-tight mt-6">
                  Выполняется бэктест
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  {runStatus === 'pending' && 'Инициализация...'}
                  {runStatus === 'running' && `Обработка данных... ${runProgress}%`}
                  {runStatus === 'completed' && 'Подготовка результатов...'}
                  {!runStatus && 'Запуск...'}
                </p>
                {runStatus === 'running' && (
                  <div className="w-48 h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-4">
                    <div
                      className="h-full bg-gradient-to-r from-brand-premium to-amber-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${runProgress}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <BacktestHistory
            runs={historyRuns}
            loading={historyLoading}
            onLoadResult={handleLoadResult}
            onRefresh={fetchHistory}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---- Metric Cell (for results bar) ---- */

function MetricCell({
  label,
  value,
  icon: Icon,
  color,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`px-3 sm:px-4 py-3 sm:py-4 ${highlight ? 'bg-white/[0.02]' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`h-3 w-3 ${color} opacity-60`} />
        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider leading-none truncate">
          {label}
        </p>
      </div>
      <p className={`text-base sm:text-lg font-bold font-mono ${color} leading-none truncate`}>{value}</p>
    </div>
  );
}

/* ---- Equity Curve Chart ---- */

function EquityChart({ data }: { data: { time: number; equity: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current || data.length === 0) return;

    // Cleanup previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d0d1a' },
        textColor: '#8a8a9a',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      rightPriceScale: { borderColor: '#2a2a3e' },
      timeScale: { borderColor: '#2a2a3e', timeVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;

    const lineSeries = chart.addSeries(AreaSeries, {
      lineColor: '#FFD700',
      topColor: 'rgba(255,215,0,0.15)',
      bottomColor: 'rgba(255,215,0,0.0)',
      lineWidth: 2,
    });

    // Фильтруем null/NaN значения и сортируем
    const mapped = data
      .filter((d) => d.time != null && d.equity != null && !isNaN(d.equity))
      .map((d) => ({ time: d.time as Time, value: d.equity }));

    if (mapped.length > 0) {
      lineSeries.setData(mapped);
    }
    chart.timeScale().fitContent();

    // Resize observer - проверяем chartRef чтобы избежать disposed ошибки
    const ro = new ResizeObserver((entries) => {
      if (!chartRef.current) return;
      for (const entry of entries) {
        try {
          chartRef.current.applyOptions({ width: entry.contentRect.width });
        } catch {}
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      chart.remove();
    };
  }, [data]);

  useEffect(() => {
    const cleanup = initChart();
    return () => cleanup?.();
  }, [initChart]);

  return <div ref={containerRef} className="w-full h-[280px] sm:h-[350px]" />;
}

/* ---- Trades Chart (Candlestick + Entry/Exit Markers) ---- */

function TradesChart({
  symbol,
  timeframe: defaultTimeframe,
  startDate: _startDate,
  endDate: _endDate,
  trades,
}: {
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  trades: BacktestResult['trades'];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTimeframe, setActiveTimeframe] = useState(defaultTimeframe);

  // Reset to backtest's TF when props change
  useEffect(() => {
    setActiveTimeframe(defaultTimeframe);
  }, [defaultTimeframe]);

  const initChart = useCallback(async () => {
    if (!containerRef.current) return;
    // Ensure container has dimensions (lightweight-charts requires non-zero size)
    if (containerRef.current.clientWidth === 0) {
      await new Promise((r) => setTimeout(r, 100));
      if (!containerRef.current) return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch candle data for the chart
      const startMs = new Date(_startDate).getTime();
      const endMs = new Date(_endDate).getTime();
      const { data: klines } = await api.get(`/market/klines/${symbol}`, {
        params: { interval: activeTimeframe, start: startMs, end: endMs },
      });

      const candles = (klines as Record<string, unknown>[]).map((d) => {
        const rawTs = Number(d.timestamp ?? d.time);
        return {
          time: (rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs) as Time,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
          volume: Number(d.volume ?? 0),
        };
      });

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#666',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1a1a2e' },
          horzLines: { color: '#1a1a2e' },
        },
        rightPriceScale: {
          borderColor: '#2a2a3e',
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: { borderColor: '#2a2a3e', timeVisible: true },
        autoSize: true,
      });
      chartRef.current = chart;

      // Candlestick series
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00E676',
        downColor: '#FF1744',
        borderUpColor: '#00E676',
        borderDownColor: '#FF1744',
        wickUpColor: '#00E676',
        wickDownColor: '#FF1744',
      });
      candleSeries.setData(candles);

      // Volume
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeries.setData(
        candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(0,230,118,0.2)' : 'rgba(255,23,68,0.2)',
        })),
      );

      // Trade markers
      type MarkerItem = {
        time: Time;
        position: 'belowBar' | 'aboveBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown' | 'circle';
        text: string;
      };
      const markers: MarkerItem[] = [];

      const reasonLabels: Record<string, string> = {
        stop_loss: 'SL',
        take_profit: 'TP',
        take_profit_1: 'TP1',
        take_profit_2: 'TP2',
        trailing_stop: 'TRAIL',
        breakeven: 'BE',
        signal: 'REVERSE',
        end_of_data: 'END',
      };

      // Поиск свечи по timestamp (ближайшая свеча <= target time)
      const findCandleByTime = (timeMs: number) => {
        if (!timeMs) return undefined;
        const timeSec = Math.floor(timeMs / 1000);
        // Бинарный поиск ближайшей свечи
        let lo = 0,
          hi = candles.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if ((candles[mid].time as number) <= timeSec) lo = mid + 1;
          else hi = mid - 1;
        }
        return hi >= 0 ? candles[hi] : undefined;
      };

      for (const trade of trades) {
        // Используем timestamp для поиска свечи (работает при любом TF на графике)
        const entryCandle = trade.entry_time_ms ? findCandleByTime(trade.entry_time_ms) : candles[trade.entry_bar];
        const exitCandle = trade.exit_time_ms ? findCandleByTime(trade.exit_time_ms) : candles[trade.exit_bar];

        if (entryCandle) {
          markers.push({
            time: entryCandle.time,
            position: trade.side === 'long' ? 'belowBar' : 'aboveBar',
            color: trade.side === 'long' ? '#00E676' : '#FF1744',
            shape: trade.side === 'long' ? 'arrowUp' : 'arrowDown',
            text: `${trade.side === 'long' ? 'LONG' : 'SHORT'} $${trade.entry_price.toFixed(4)}`,
          });
        }

        if (exitCandle && exitCandle.time !== entryCandle?.time) {
          const reasonLabel = reasonLabels[trade.exit_reason] || trade.exit_reason?.toUpperCase() || 'EXIT';
          const pnlStr = `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`;

          markers.push({
            time: exitCandle.time,
            position: trade.side === 'long' ? 'aboveBar' : 'belowBar',
            color: trade.pnl >= 0 ? '#FFD700' : '#FF6D00',
            shape: 'circle',
            text: `${reasonLabel} ${pnlStr}`,
          });
        }
      }

      markers.sort((a, b) => (a.time as number) - (b.time as number));
      if (markers.length > 0) {
        createSeriesMarkers(candleSeries, markers);
      }

      chart.timeScale().fitContent();

      // Resize observer
      const ro = new ResizeObserver((entries) => {
        if (!chartRef.current) return;
        for (const entry of entries) {
          try {
            chartRef.current.applyOptions({ width: entry.contentRect.width });
          } catch {}
        }
      });
      ro.observe(containerRef.current);

      setLoading(false);
      return () => {
        ro.disconnect();
        chartRef.current = null;
        chart.remove();
      };
    } catch (err) {
      console.error('TradesChart error:', err);
      setError(`Ошибка графика: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }, [symbol, activeTimeframe, trades]);

  useEffect(() => {
    let cancelled = false;
    initChart().then((fn) => {
      if (cancelled && fn) fn();
    });
    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  return (
    <div className="relative">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-bg/90 z-20 text-gray-400 text-sm">
          {error}
        </div>
      )}
      {/* Timeframe selector */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-white/[0.04] overflow-x-auto">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-xs text-gray-500 font-medium shrink-0">Таймфрейм:</span>
          <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5 shrink-0">
            {CHART_TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setActiveTimeframe(tf.value)}
                className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTimeframe === tf.value
                    ? 'bg-brand-premium/10 text-brand-premium shadow-sm'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {activeTimeframe !== defaultTimeframe && (
            <span className="text-[10px] text-gray-600 font-mono shrink-0">
              (бэктест: {BACKEND_TO_LABEL[defaultTimeframe] ?? defaultTimeframe})
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 top-10 flex items-center justify-center bg-brand-bg/80 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-[360px] sm:h-[450px]" />
      {!loading && trades.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 sm:px-5 py-2.5 border-t border-white/[0.04] text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-transparent border-b-brand-profit" />{' '}
            LONG
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-brand-loss" />{' '}
            SHORT
          </span>
          <span className="text-gray-700">|</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-brand-premium rounded-full" /> SL - стоп-лосс
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-brand-premium rounded-full" /> TP - тейк-профит
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full" /> TRAIL - трейлинг
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full" /> REVERSE - обратный сигнал
          </span>
        </div>
      )}
    </div>
  );
}

/* ---- Backtest History ---- */

const LS_NOTES_KEY = 'algobond_backtest_notes';
const LS_HIDDEN_KEY = 'algobond_backtest_hidden';

function getStoredNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_NOTES_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function setStoredNote(runId: string, note: string): void {
  const notes = getStoredNotes();
  notes[runId] = note;
  localStorage.setItem(LS_NOTES_KEY, JSON.stringify(notes));
}

function getHiddenIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_HIDDEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function hideRun(runId: string): void {
  const hidden = getHiddenIds();
  if (!hidden.includes(runId)) {
    hidden.push(runId);
    localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify(hidden));
  }
}

function statusBadge(status: BacktestStatus, errorMsg: string | null) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-profit bg-brand-profit/10 border border-brand-profit/15 px-2.5 py-1 rounded-lg font-medium">
          <CheckCircle2 className="h-3 w-3" /> Завершён
        </span>
      );
    case 'failed':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-brand-loss bg-brand-loss/10 border border-brand-loss/15 px-2.5 py-1 rounded-lg font-medium"
          title={errorMsg ?? undefined}
        >
          <XCircle className="h-3 w-3" /> Ошибка
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-accent bg-brand-accent/10 border border-brand-accent/15 px-2.5 py-1 rounded-lg font-medium">
          <Loader2 className="h-3 w-3 animate-spin" /> Выполняется
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-premium bg-brand-premium/10 border border-brand-premium/15 px-2.5 py-1 rounded-lg font-medium">
          <Clock className="h-3 w-3" /> В очереди
        </span>
      );
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface HistoryRunCardProps {
  run: BacktestRunResponse;
  onLoad: (result: BacktestResult) => void;
  onHide: (id: string) => void;
}

function HistoryRunCard({ run, onLoad, onHide }: HistoryRunCardProps) {
  const [resultData, setResultData] = useState<BacktestResultResponse | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [note, setNote] = useState(() => getStoredNotes()[run.id] ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto-fetch result for completed runs
  useEffect(() => {
    if (run.status === 'completed' && !resultData && !resultLoading) {
      setResultLoading(true);
      api
        .get<BacktestResultResponse>(`/backtest/runs/${run.id}/result`)
        .then(({ data }) => setResultData(data))
        .catch(() => {
          /* result not available */
        })
        .finally(() => setResultLoading(false));
    }
  }, [run.id, run.status, resultData, resultLoading]);

  const handleNoteChange = (value: string) => {
    setNote(value);
    setStoredNote(run.id, value);
  };

  const handleLoadResult = () => {
    if (resultData) {
      const mapped = mapBackendResultToUI(resultData);
      mapped.backtestSymbol = run.symbol;
      mapped.backtestTimeframe = run.timeframe;
      onLoad(mapped);
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onHide(run.id);
  };

  const tfLabel = BACKEND_TO_LABEL[run.timeframe] ?? run.timeframe;

  return (
    <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden hover:border-white/[0.1] transition-colors">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0">
              <CandlestickChart className="h-4 w-4 text-brand-accent" />
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-wrap">
              <span className="text-white font-semibold text-sm truncate">{run.symbol}</span>
              <span className="text-xs text-gray-600">/</span>
              <span className="text-xs text-gray-400 font-mono">{tfLabel}</span>
              <span className="hidden sm:inline text-xs text-gray-600 font-mono">
                {run.start_date.slice(0, 10)} - {run.end_date.slice(0, 10)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">{statusBadge(run.status, run.error_message)}</div>
        </div>

        {/* Info row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-3 sm:px-5 py-2.5 border-b border-white/[0.04] text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            Капитал: <span className="font-mono text-white ml-0.5">${run.initial_capital}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Создан: <span className="font-mono text-gray-300 ml-0.5">{formatDate(run.created_at)}</span>
          </span>
        </div>

        {/* Metrics row (if result loaded) */}
        {resultData && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-3 sm:px-5 py-2.5 border-b border-white/[0.04] text-xs">
            <span className="text-gray-500">
              Сделок: <span className="font-mono text-white">{resultData.total_trades}</span>
            </span>
            <span className="text-gray-500">
              Win:{' '}
              <span
                className={`font-mono font-medium ${
                  Number(resultData.win_rate) * 100 >= 50 ? 'text-brand-profit' : 'text-brand-loss'
                }`}
              >
                {(Number(resultData.win_rate) * 100).toFixed(1)}%
              </span>
            </span>
            <span className="text-gray-500">
              PnL:{' '}
              <span
                className={`font-mono font-bold ${
                  Number(resultData.total_pnl) >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                }`}
              >
                {Number(resultData.total_pnl) >= 0 ? '+' : ''}${Number(resultData.total_pnl).toFixed(2)}
              </span>
            </span>
            <span className="text-gray-500">
              DD:{' '}
              <span className="font-mono text-brand-loss font-medium">
                {Number(resultData.max_drawdown).toFixed(1)}%
              </span>
            </span>
            <span className="text-gray-500">
              Sharpe:{' '}
              <span
                className={`font-mono font-medium ${
                  Number(resultData.sharpe_ratio) >= 1 ? 'text-brand-premium' : 'text-gray-400'
                }`}
              >
                {Number(resultData.sharpe_ratio).toFixed(2)}
              </span>
            </span>
          </div>
        )}

        {resultLoading && (
          <div className="flex items-center gap-2 px-3 sm:px-5 py-2.5 border-b border-white/[0.04] text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка результатов...
          </div>
        )}

        {/* Error message */}
        {run.status === 'failed' && run.error_message && (
          <div className="flex items-center gap-2 px-3 sm:px-5 py-2.5 border-b border-white/[0.04] text-xs text-brand-loss">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{run.error_message}</span>
          </div>
        )}

        {/* Running progress */}
        {run.status === 'running' && (
          <div className="px-3 sm:px-5 py-2.5 border-b border-white/[0.04]">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Выполняется...</span>
              <span className="font-mono">{run.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-accent to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${run.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Notes + Actions */}
        <div className="px-3 sm:px-5 py-3.5 flex flex-col sm:flex-row items-stretch sm:items-start gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <StickyNote className="h-3 w-3 text-gray-600" />
              <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Заметка</span>
            </div>
            <Input
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="Добавьте заметку к этому запуску..."
              className="bg-white/[0.03] border-white/[0.04] text-white text-xs h-8 placeholder:text-gray-600"
            />
          </div>
          <div className="flex items-center gap-2 sm:pt-5 shrink-0">
            {run.status === 'completed' && resultData && (
              <Button
                size="sm"
                onClick={handleLoadResult}
                className="bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20 text-xs h-8 border border-brand-accent/15"
              >
                <Download className="h-3 w-3 mr-1.5" />
                Загрузить
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              onBlur={() => setConfirmDelete(false)}
              className={`text-xs h-8 ${
                confirmDelete
                  ? 'text-brand-loss bg-brand-loss/10 hover:bg-brand-loss/20 border border-brand-loss/15'
                  : 'text-gray-500 hover:text-brand-loss hover:bg-brand-loss/10'
              }`}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {confirmDelete ? 'Точно?' : 'Скрыть'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BacktestHistory({
  runs,
  loading,
  onLoadResult,
  onRefresh,
}: {
  runs: BacktestRunResponse[];
  loading: boolean;
  onLoadResult: (result: BacktestResult) => void;
  onRefresh: () => void;
}) {
  const [hiddenIds, setHiddenIds] = useState<string[]>(getHiddenIds);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(0);

  const visibleRuns = runs
    .filter((r) => !hiddenIds.includes(r.id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleHide = (id: string) => {
    hideRun(id);
    setHiddenIds((prev) => [...prev, id]);
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    setSelected(allSelected ? new Set() : new Set(pagedRuns.map((r) => r.id)));
  };

  const hideSelected = () => {
    for (const id of selected) hideRun(id);
    setHiddenIds((prev) => [...prev, ...selected]);
    setSelected(new Set());
  };

  const deleteAllHidden = async () => {
    for (const id of hiddenIds) {
      try {
        await api.delete(`/backtest/runs/${id}`);
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem(LS_HIDDEN_KEY);
    setHiddenIds([]);
    onRefresh();
  };

  if (loading) {
    return (
      <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
        <CardContent className="flex flex-col items-center justify-center py-24">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-premium/10 to-brand-accent/5 border border-brand-premium/10 mb-4">
            <Loader2 className="h-7 w-7 animate-spin text-brand-premium" />
          </div>
          <span className="text-gray-400 text-sm mt-2">Загрузка истории...</span>
        </CardContent>
      </Card>
    );
  }

  if (visibleRuns.length === 0) {
    return (
      <Card className="border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
        <CardContent className="flex flex-col items-center justify-center py-24">
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-accent/10 to-brand-premium/5 border border-brand-accent/10 mb-6">
            <History className="h-9 w-9 text-gray-600" />
          </div>
          <p className="text-gray-300 text-lg font-semibold font-[Tektur] tracking-tight">Нет запусков</p>
          <p className="text-gray-500 text-sm mt-2 max-w-xs text-center leading-relaxed">
            Запустите бэктест, и он появится здесь
          </p>
          {hiddenIds.length > 0 && (
            <div className="flex items-center gap-2 mt-6">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-500 hover:text-white"
                onClick={() => {
                  localStorage.removeItem(LS_HIDDEN_KEY);
                  setHiddenIds([]);
                  onRefresh();
                }}
              >
                <CircleDot className="h-3 w-3 mr-1.5" />
                Показать скрытые ({hiddenIds.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-brand-loss hover:bg-brand-loss/10"
                onClick={deleteAllHidden}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Удалить все скрытые
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
  const totalPages = Math.ceil(visibleRuns.length / perPage);
  const pagedRuns = visibleRuns.slice(page * perPage, (page + 1) * perPage);

  const allSelected = selected.size === pagedRuns.length && pagedRuns.length > 0;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={selectAll}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-500 hover:text-white transition-colors"
          >
            <div
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                allSelected
                  ? 'border-brand-premium bg-brand-premium'
                  : someSelected
                    ? 'border-brand-premium bg-brand-premium/30'
                    : 'border-gray-600'
              }`}
            >
              {allSelected && <span className="text-[8px] text-black font-bold">&#10003;</span>}
              {someSelected && !allSelected && <span className="text-[8px] text-black font-bold">-</span>}
            </div>
            {someSelected ? `${selected.size} выбрано` : 'Выбрать все'}
          </button>
          {someSelected && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-brand-loss h-7 hover:bg-brand-loss/10"
              onClick={hideSelected}
            >
              <EyeOff className="h-3 w-3 mr-1" />
              Скрыть ({selected.size})
            </Button>
          )}
          <div className="h-4 w-px bg-white/10" />
          <span className="text-[10px] text-gray-600 font-mono">{visibleRuns.length} всего</span>
          <div className="flex items-center rounded-md bg-white/[0.03] border border-white/[0.06] p-0.5">
            {PER_PAGE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setPerPage(n);
                  setPage(0);
                }}
                className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all ${
                  perPage === n ? 'bg-brand-premium/15 text-brand-premium' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" className="text-xs text-gray-500 h-7 hover:text-white" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Обновить
          </Button>
          {hiddenIds.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-500 h-7 hover:text-white"
                onClick={() => {
                  localStorage.removeItem(LS_HIDDEN_KEY);
                  setHiddenIds([]);
                  onRefresh();
                }}
              >
                <CircleDot className="h-3 w-3 mr-1.5" />
                Показать скрытые ({hiddenIds.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-brand-loss h-7 hover:bg-brand-loss/10"
                onClick={deleteAllHidden}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Удалить скрытые
              </Button>
            </>
          )}
        </div>
      </div>
      {/* List with checkboxes */}
      {pagedRuns.map((run) => (
        <div key={run.id} className="flex items-start gap-2">
          <button type="button" onClick={() => toggleSelect(run.id)} className="mt-4 flex-shrink-0">
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                selected.has(run.id) ? 'border-brand-premium bg-brand-premium' : 'border-gray-600 hover:border-gray-400'
              }`}
            >
              {selected.has(run.id) && <span className="text-[9px] text-black font-bold">&#10003;</span>}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <HistoryRunCard run={run} onLoad={onLoadResult} onHide={handleHide} />
          </div>
        </div>
      ))}
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-3">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="px-2.5 py-1 text-[11px] font-mono rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white hover:bg-white/5"
          >
            &larr;
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              className={`w-7 h-7 text-[11px] font-mono rounded-md transition-all ${
                page === i
                  ? 'bg-brand-premium/15 text-brand-premium border border-brand-premium/20'
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            className="px-2.5 py-1 text-[11px] font-mono rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white hover:bg-white/5"
          >
            &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- Demo Data ---- */

function generateDemoResult(capital: number): BacktestResult {
  const trades: BacktestResult['trades'] = [];
  const equityCurve: BacktestResult['equity_curve'] = [];

  let equity = capital;
  const baseTime = new Date('2025-01-15').getTime() / 1000;
  const step = 86400; // ~1 day

  let wins = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let maxDrawdown = 0;
  let peak = equity;

  for (let i = 0; i < 87; i++) {
    const isWin = Math.random() < 0.58;
    const pnlPct = isWin ? Math.random() * 4 + 0.5 : -(Math.random() * 3 + 0.3);
    const pnl = equity * (pnlPct / 100);
    equity += pnl;

    if (isWin) {
      wins++;
      totalProfit += pnl;
    } else {
      totalLoss += Math.abs(pnl);
    }

    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const entryPrice = 65000 + Math.random() * 5000;
    const exitPrice = entryPrice * (1 + pnlPct / 100);

    const entryDate = new Date((baseTime + i * step) * 1000);
    const exitDate = new Date((baseTime + i * step + 14400) * 1000);

    trades.push({
      id: i + 1,
      side: Math.random() > 0.4 ? 'long' : 'short',
      entry_time: entryDate.toISOString().slice(0, 16).replace('T', ' '),
      exit_time: exitDate.toISOString().slice(0, 16).replace('T', ' '),
      entry_price: +entryPrice.toFixed(2),
      exit_price: +exitPrice.toFixed(2),
      pnl: +pnl.toFixed(2),
      pnl_pct: +pnlPct.toFixed(2),
      exit_reason: ['stop_loss', 'take_profit', 'trailing_stop', 'signal'][Math.floor(Math.random() * 4)],
      entry_bar: i * 10,
      exit_bar: i * 10 + 5 + Math.floor(Math.random() * 10),
      entry_time_ms: (baseTime + i * step) * 1000,
      exit_time_ms: (baseTime + i * step + 14400) * 1000,
    });

    equityCurve.push({
      time: baseTime + i * step,
      equity: +equity.toFixed(2),
    });
  }

  const totalPnl = equity - capital;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99 : 0;

  return {
    metrics: {
      total_trades: trades.length,
      win_rate: (wins / trades.length) * 100,
      profit_factor: +profitFactor.toFixed(2),
      total_pnl: +totalPnl.toFixed(2),
      max_drawdown: +maxDrawdown.toFixed(2),
      sharpe_ratio: +(1.2 + Math.random() * 0.8).toFixed(2),
      avg_trade_pnl: +(totalPnl / trades.length).toFixed(2),
      best_trade: Math.max(...trades.map((t) => t.pnl)),
      worst_trade: Math.min(...trades.map((t) => t.pnl)),
    },
    equity_curve: equityCurve,
    trades,
  };
}
