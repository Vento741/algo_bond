import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Copy,
  CheckCheck,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface InviteCode {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  created_by_email: string | null;
  used_by_email: string | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

function getInviteStatus(invite: InviteCode): { label: string; color: string; bg: string } {
  if (invite.used_at) return { label: 'Использован', color: 'text-gray-400', bg: 'bg-white/5' };
  if (!invite.is_active) return { label: 'Деактивирован', color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { label: 'Истек', color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' };
  }
  return { label: 'Активен', color: 'text-[#00E676]', bg: 'bg-[#00E676]/10' };
}

export function AdminInvites() {
  const [invites, setInvites] = useState<PaginatedResponse<InviteCode> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genCount, setGenCount] = useState(1);
  const [genExpiry, setGenExpiry] = useState<string>('30');
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<InviteCode[]>([]);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const { data } = await api.get(`/admin/invites?${params.toString()}`);
      setInvites(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const expiresInDays = genExpiry === 'none' ? null : Number(genExpiry);
      const { data } = await api.post('/admin/invites/generate', {
        count: genCount,
        expires_in_days: expiresInDays,
      });
      setGeneratedCodes(data);
      fetchInvites();
    } catch {
      // Error
    } finally {
      setGenerating(false);
    }
  };

  const handleDeactivate = async (inviteId: string) => {
    try {
      await api.patch(`/admin/invites/${inviteId}`);
      fetchInvites();
    } catch {
      // Error
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAllCodes = async () => {
    const codes = generatedCodes.map((c) => c.code).join('\n');
    await navigator.clipboard.writeText(codes);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = invites ? Math.ceil(invites.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Инвайт-коды</h1>
          <p className="text-sm text-gray-400 mt-1">Генерация и управление кодами приглашения</p>
        </div>
        <button
          onClick={() => { setShowGenerate(true); setGeneratedCodes([]); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Сгенерировать
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Код</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создал</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Использовал</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создан</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Истекает</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading && !invites ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : invites && invites.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    Нет инвайт-кодов. Сгенерируйте первый!
                  </td>
                </tr>
              ) : (
                invites?.items.map((inv) => {
                  const status = getInviteStatus(inv);
                  return (
                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <code className="font-mono tracking-widest text-[#FFD700]">{inv.code}</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          status.bg, status.color,
                        )}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{inv.created_by_email || '-'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{inv.used_by_email || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {new Date(inv.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('ru-RU') : 'Бессрочно'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyToClipboard(inv.code, inv.id)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                            title="Копировать"
                          >
                            {copiedId === inv.id ? (
                              <CheckCheck className="h-4 w-4 text-[#00E676]" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          {inv.is_active && !inv.used_at && (
                            <button
                              onClick={() => handleDeactivate(inv.id)}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-[#FF1744] transition-colors"
                              title="Деактивировать"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {invites && invites.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {invites.offset + 1}-{Math.min(invites.offset + limit, invites.total)} из {invites.total}
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

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowGenerate(false)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white font-heading">Сгенерировать инвайт-коды</h2>

            {generatedCodes.length === 0 ? (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Количество (1-20)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={genCount}
                    onChange={(e) => setGenCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50 font-data"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Срок действия</label>
                  <select
                    value={genExpiry}
                    onChange={(e) => setGenExpiry(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50"
                  >
                    <option value="7">7 дней</option>
                    <option value="30">30 дней</option>
                    <option value="90">90 дней</option>
                    <option value="none">Бессрочно</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors disabled:opacity-50"
                  >
                    {generating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Сгенерировать
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  Сгенерировано {generatedCodes.length} кодов:
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {generatedCodes.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                      <code className="flex-1 font-mono tracking-widest text-[#FFD700]">{c.code}</code>
                      <button
                        onClick={() => copyToClipboard(c.code, c.id)}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      >
                        {copiedId === c.id ? (
                          <CheckCheck className="h-3.5 w-3.5 text-[#00E676]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2">
                  <button
                    onClick={copyAllCodes}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-sm hover:text-white transition-colors"
                  >
                    {copiedId === 'all' ? (
                      <CheckCheck className="h-4 w-4 text-[#00E676]" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    Копировать все
                  </button>
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="px-4 py-2 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors"
                  >
                    Готово
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
