import { useState, useEffect, useRef } from 'react';
import { Settings2, ChevronDown, Bot, Unlink } from 'lucide-react';
import api from '@/lib/api';
import type { StrategyConfig } from '@/types/api';

interface ConfigSelectorProps {
  onSelect: (config: StrategyConfig) => void;
  onUnlink?: () => void;
  /** ID привязанного конфига (null если отвязан) */
  linkedConfigId: string | null;
}

/** Выбор конфига стратегии - переключает символ + таймфрейм */
export function ConfigSelector({
  onSelect,
  onUnlink,
  linkedConfigId,
}: ConfigSelectorProps) {
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const linkedConfig = linkedConfigId ? configs.find((c) => c.id === linkedConfigId) : null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Загружаем конфиги при первом открытии
  useEffect(() => {
    if (!isOpen || configs.length > 0) return;
    setLoading(true);
    api
      .get<StrategyConfig[]>('/strategies/configs/my')
      .then((res) => setConfigs(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, configs.length]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer border ${
          linkedConfig
            ? 'border-brand-premium/30 bg-brand-premium/10 text-brand-premium'
            : 'border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/20'
        }`}
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>{linkedConfig?.name ?? 'Конфиг'}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {/* Кнопка отвязки */}
      {linkedConfig && onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          title="Отвязать конфиг"
          className="p-1 text-gray-500 hover:text-brand-loss transition-colors rounded"
        >
          <Unlink className="h-3.5 w-3.5" />
        </button>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 top-full left-0 w-64 bg-[#1a1a2e] border border-white/10 rounded-md shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">
              Мои конфиги
            </span>
          </div>

          <div className="overflow-y-auto max-h-[280px]">
            {loading ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Загрузка...</div>
            ) : configs.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                Нет конфигов
              </div>
            ) : (
              configs.map((cfg) => {
                const isLinked = cfg.id === linkedConfigId;
                return (
                  <button
                    key={cfg.id}
                    type="button"
                    onClick={() => {
                      onSelect(cfg);
                      setIsOpen(false);
                    }}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors ${
                      isLinked
                        ? 'bg-brand-premium/10 text-brand-premium'
                        : 'text-white hover:bg-white/5'
                    }`}
                  >
                    <Bot className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{cfg.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                        <span>{cfg.symbol}</span>
                        <span>-</span>
                        <span>{cfg.timeframe}m</span>
                      </div>
                    </div>
                    {isLinked && (
                      <div className="h-1.5 w-1.5 rounded-full bg-brand-premium flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
