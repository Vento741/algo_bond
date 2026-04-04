import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  bot_id: string;
  level: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
  user_email: string | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const levelStyles: Record<string, { color: string; bg: string }> = {
  info: { color: 'text-gray-400', bg: 'bg-gray-400/10' },
  warn: { color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  error: { color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' },
  debug: { color: 'text-blue-400', bg: 'bg-blue-400/10' },
};

const levelOptions = ['info', 'warn', 'error', 'debug'];

export function AdminLogs() {
  const [logs, setLogs] = useState<PaginatedResponse<LogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 50;

  // Filters
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [botFilter, setBotFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  // Expanded rows
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (selectedLevels.length === 1) {
        params.set('level', selectedLevels[0]);
      }
      if (botFilter) params.set('bot_id', botFilter);
      const { data } = await api.get(`/admin/logs?${params.toString()}`);
      setLogs(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [page, selectedLevels, botFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh toggle
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  const toggleLevel = (level: string) => {
    setSelectedLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
    setPage(0);
  };

  const totalPages = logs ? Math.ceil(logs.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Системные логи</h1>
          <p className="text-sm text-gray-400 mt-1">Логи всех ботов платформы</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              autoRefresh
                ? 'bg-[#00E676]/10 text-[#00E676]'
                : 'bg-white/5 text-gray-400 hover:text-white',
            )}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {autoRefresh ? 'Авто: ON' : 'Авто: OFF'}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Обновить
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Level toggles */}
        <div className="flex gap-1">
          {levelOptions.map((level) => {
            const style = levelStyles[level];
            const isSelected = selectedLevels.includes(level);
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition-colors border',
                  isSelected
                    ? `${style.bg} ${style.color} border-current`
                    : 'bg-white/5 text-gray-500 border-transparent hover:text-gray-300',
                )}
              >
                {level}
              </button>
            );
          })}
        </div>

        {/* Bot ID filter */}
        <input
          type="text"
          placeholder="Bot ID..."
          value={botFilter}
          onChange={(e) => { setBotFilter(e.target.value); setPage(0); }}
          className="px-3 py-1.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#FFD700]/50 w-full sm:w-72 font-data"
        />

        {/* User filter */}
        <input
          type="text"
          placeholder="User email..."
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#FFD700]/50 w-full sm:w-56"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium w-10"></th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Время</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Уровень</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Bot ID</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Пользователь</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {loading && !logs ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : logs && logs.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    Нет записей в логах
                  </td>
                </tr>
              ) : (
                logs?.items
                  .filter((log) => {
                    // Client-side filter for multi-level and user email
                    if (selectedLevels.length > 1 && !selectedLevels.includes(log.level)) return false;
                    if (userFilter && !(log.user_email || '').toLowerCase().includes(userFilter.toLowerCase())) return false;
                    return true;
                  })
                  .map((log) => {
                    const style = levelStyles[log.level] || levelStyles.info;
                    const isExpanded = expandedRow === log.id;
                    return (
                      <tr
                        key={log.id}
                        className={cn(
                          'border-b border-white/5 hover:bg-white/[0.02] transition-colors',
                          isExpanded && 'bg-white/[0.02]',
                        )}
                      >
                        <td className="px-4 py-2.5 text-gray-500" colSpan={isExpanded && log.details ? undefined : 1}>
                          {log.details ? (
                            <button onClick={() => setExpandedRow(isExpanded ? null : log.id)}>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs font-data whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase',
                            style.bg, style.color,
                          )}>
                            {log.level}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs font-data">
                          {log.bot_id.slice(0, 8)}...
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">
                          {log.user_email || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 text-xs max-w-md truncate">
                          {log.message}
                          {isExpanded && log.details && (
                            <pre className="mt-2 text-xs text-gray-400 font-data bg-white/5 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logs && logs.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {logs.offset + 1}-{Math.min(logs.offset + limit, logs.total)} из {logs.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 font-data">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
