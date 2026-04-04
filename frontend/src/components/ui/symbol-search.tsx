import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { usePairs } from '@/hooks/usePairs';

interface SymbolSearchProps {
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
  className?: string;
}

export function SymbolSearch({
  value,
  onChange,
  placeholder = 'Выберите символ...',
  className = '',
}: SymbolSearchProps) {
  const { pairs, loading } = usePairs();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Закрытие по клику вне компонента
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = pairs.filter(
    (p) =>
      p.symbol.toLowerCase().includes(search.toLowerCase()) ||
      p.base_currency.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedPair = pairs.find((p) => p.symbol === value);
  const displayValue = selectedPair
    ? `${selectedPair.base_currency}/${selectedPair.quote_currency}`
    : value || placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch('');
        }}
        className="flex items-center justify-between w-full h-10 px-3 py-2 text-sm rounded-md border border-white/10 bg-[#1a1a2e] text-white hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-[#FFD700]/50"
      >
        <span className={selectedPair ? 'text-white' : 'text-gray-400'}>{displayValue}</span>
        <ChevronDown className="h-4 w-4 text-gray-400 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-md shadow-lg max-h-[300px] overflow-hidden">
          {/* Поиск */}
          <div className="flex items-center px-3 py-2 border-b border-white/10">
            <Search className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск токена..."
              className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="ml-1">
                <X className="h-3 w-3 text-gray-400 hover:text-white" />
              </button>
            )}
          </div>

          {/* Список пар */}
          <div className="overflow-y-auto max-h-[250px]">
            {loading ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Загрузка...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Не найдено</div>
            ) : (
              filtered.map((pair) => (
                <button
                  key={pair.symbol}
                  type="button"
                  onClick={() => {
                    onChange(pair.symbol);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-white/5 transition-colors ${
                    pair.symbol === value ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'text-white'
                  }`}
                >
                  <span className="font-medium">
                    {pair.base_currency}/{pair.quote_currency}
                  </span>
                  <span className="text-xs text-gray-400">{pair.symbol}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
