import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, ChevronDown, X, Star } from 'lucide-react';
import { usePairs } from '@/hooks/usePairs';

const FAVORITES_KEY = 'algobond:favorite-pairs';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

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
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
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

  const toggleFavorite = useCallback(
    (symbol: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(symbol)) {
          next.delete(symbol);
        } else {
          next.add(symbol);
        }
        saveFavorites(next);
        return next;
      });
    },
    [],
  );

  const filtered = pairs.filter(
    (p) =>
      p.symbol.toLowerCase().includes(search.toLowerCase()) ||
      p.base_currency.toLowerCase().includes(search.toLowerCase()),
  );

  // Разделяем на избранные и остальные
  const favPairs = filtered.filter((p) => favorites.has(p.symbol));
  const otherPairs = filtered.filter((p) => !favorites.has(p.symbol));

  const selectedPair = pairs.find((p) => p.symbol === value);
  const displayValue = selectedPair
    ? `${selectedPair.base_currency}/${selectedPair.quote_currency}`
    : value || placeholder;

  const renderPair = (pair: typeof pairs[0]) => {
    const isFav = favorites.has(pair.symbol);
    return (
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => toggleFavorite(pair.symbol, e)}
            className="p-0.5 -ml-0.5 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-3 w-3 ${
                isFav ? 'fill-brand-premium text-brand-premium' : 'text-gray-600 hover:text-gray-400'
              }`}
            />
          </button>
          <span className="font-medium">
            {pair.base_currency}/{pair.quote_currency}
          </span>
        </div>
        <span className="text-xs text-gray-400">{pair.symbol}</span>
      </button>
    );
  };

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
        <div className="absolute z-50 w-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-md shadow-lg max-h-[350px] overflow-hidden">
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
          <div className="overflow-y-auto max-h-[300px]">
            {loading ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Загрузка...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Не найдено</div>
            ) : (
              <>
                {/* Избранные */}
                {favPairs.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500">
                        Избранные
                      </span>
                    </div>
                    {favPairs.map(renderPair)}
                    {otherPairs.length > 0 && (
                      <div className="border-t border-white/5 mx-2 my-1" />
                    )}
                  </>
                )}
                {/* Остальные */}
                {otherPairs.map(renderPair)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
