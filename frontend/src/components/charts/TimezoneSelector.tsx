import { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { useChartStore } from '@/stores/chart';

const TIMEZONES = [
  { value: 'Europe/Moscow', label: 'МСК (UTC+3)', short: 'МСК' },
  { value: 'Europe/London', label: 'Лондон (UTC+0)', short: 'LON' },
  { value: 'America/New_York', label: 'Нью-Йорк (UTC-5)', short: 'NYC' },
  { value: 'Asia/Tokyo', label: 'Токио (UTC+9)', short: 'TYO' },
  { value: 'Asia/Shanghai', label: 'Шанхай (UTC+8)', short: 'SHA' },
  { value: 'Asia/Dubai', label: 'Дубай (UTC+4)', short: 'DXB' },
  { value: 'UTC', label: 'UTC (UTC+0)', short: 'UTC' },
] as const;

/** Компактный селектор часового пояса */
export function TimezoneSelector() {
  const timezone = useChartStore((s) => s.timezone);
  const setTimezone = useChartStore((s) => s.setTimezone);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentTz = TIMEZONES.find((t) => t.value === timezone);
  const displayLabel = currentTz?.short ?? timezone.split('/').pop() ?? 'TZ';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono text-gray-400 hover:text-white rounded-md bg-white/5 border border-white/10 hover:border-white/20 transition-all cursor-pointer"
      >
        <Clock className="h-3 w-3" />
        <span>{displayLabel}</span>
        <ChevronDown className="h-2.5 w-2.5" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 right-0 w-52 bg-[#1a1a2e] border border-white/10 rounded-md shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">
              Часовой пояс
            </span>
          </div>
          {TIMEZONES.map((tz) => (
            <button
              key={tz.value}
              type="button"
              onClick={() => {
                setTimezone(tz.value);
                setIsOpen(false);
              }}
              className={`flex items-center justify-between w-full px-3 py-2 text-sm transition-colors ${
                timezone === tz.value
                  ? 'bg-brand-premium/10 text-brand-premium'
                  : 'text-white hover:bg-white/5'
              }`}
            >
              <span>{tz.label}</span>
              {timezone === tz.value && (
                <div className="h-1.5 w-1.5 rounded-full bg-brand-premium" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
