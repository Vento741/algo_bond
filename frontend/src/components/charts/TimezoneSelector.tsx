import { Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

  const currentTz = TIMEZONES.find((t) => t.value === timezone);
  const displayLabel = currentTz?.short ?? timezone.split('/').pop() ?? 'TZ';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono text-gray-400 hover:text-white rounded-md bg-white/5 border border-white/10 hover:border-white/20 transition-all cursor-pointer"
        >
          <Clock className="h-3 w-3" />
          <span>{displayLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0 bg-[#1a1a2e] border-white/10" align="end">
        <div className="px-3 py-2 border-b border-white/10">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            Часовой пояс
          </span>
        </div>
        {TIMEZONES.map((tz) => (
          <button
            key={tz.value}
            type="button"
            onClick={() => setTimezone(tz.value)}
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
      </PopoverContent>
    </Popover>
  );
}
