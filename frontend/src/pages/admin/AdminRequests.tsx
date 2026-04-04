import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  X,
  Copy,
  CheckCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface AccessRequest {
  id: string;
  telegram: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ожидает', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  approved: { label: 'Одобрена', color: 'text-[#00E676]', bg: 'bg-[#00E676]/10' },
  rejected: { label: 'Отклонена', color: 'text-[#FF1744]', bg: 'bg-[#FF1744]/10' },
};

export function AdminRequests() {
  const [requests, setRequests] = useState<PaginatedResponse<AccessRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Approve modal
  const [approveCode, setApproveCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reject modal
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/admin/requests?${params.toString()}`);
      setRequests(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    try {
      setActionLoading(requestId);
      const { data } = await api.post(`/admin/requests/${requestId}/approve`);
      setApproveCode(data.invite_code);
      fetchRequests();
    } catch {
      // Error
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    try {
      setActionLoading(rejectId);
      await api.post(`/admin/requests/${rejectId}/reject`, { reason: rejectReason || null });
      setRejectId(null);
      setRejectReason('');
      fetchRequests();
    } catch {
      // Error
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalPages = requests ? Math.ceil(requests.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white font-heading">Заявки на доступ</h1>
        <p className="text-sm text-gray-400 mt-1">Обработка заявок на регистрацию</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        {['pending', 'approved', 'rejected', ''].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(0); }}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-[#FFD700]/10 text-[#FFD700]'
                : 'text-gray-400 hover:text-white',
            )}
          >
            {s === '' ? 'Все' : statusLabels[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Telegram</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создана</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Рассмотрена</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading && !requests ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : requests && requests.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    {statusFilter === 'pending'
                      ? 'Нет заявок на рассмотрении'
                      : 'Заявки не найдены'}
                  </td>
                </tr>
              ) : (
                requests?.items.map((req) => {
                  const badge = statusLabels[req.status] || statusLabels.pending;
                  return (
                    <tr key={req.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-data">{req.telegram}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          badge.bg, badge.color,
                        )}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {new Date(req.created_at).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-data">
                        {req.reviewed_at
                          ? new Date(req.reviewed_at).toLocaleString('ru-RU')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {req.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(req.id)}
                                disabled={actionLoading === req.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00E676]/10 text-[#00E676] text-xs font-medium hover:bg-[#00E676]/20 transition-colors disabled:opacity-50"
                              >
                                {actionLoading === req.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Одобрить
                              </button>
                              <button
                                onClick={() => setRejectId(req.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FF1744]/10 text-[#FF1744] text-xs font-medium hover:bg-[#FF1744]/20 transition-colors"
                              >
                                <X className="h-3 w-3" />
                                Отклонить
                              </button>
                            </>
                          )}
                          {req.status === 'rejected' && req.reject_reason && (
                            <span className="text-xs text-gray-500 italic" title={req.reject_reason}>
                              {req.reject_reason.length > 30
                                ? req.reject_reason.slice(0, 30) + '...'
                                : req.reject_reason}
                            </span>
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
        {requests && requests.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {requests.offset + 1}-{Math.min(requests.offset + limit, requests.total)} из {requests.total}
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

      {/* Approve Success Modal */}
      {approveCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setApproveCode(null)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#00E676]">Заявка одобрена</h2>
            <p className="text-sm text-gray-400">Инвайт-код сгенерирован. Отправьте его пользователю в Telegram.</p>
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-3">
              <code className="flex-1 text-lg font-mono tracking-widest text-[#FFD700]">
                {approveCode}
              </code>
              <button
                onClick={() => copyToClipboard(approveCode)}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                {copied ? <CheckCheck className="h-4 w-4 text-[#00E676]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => setApproveCode(null)}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 text-gray-300 hover:text-white text-sm transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setRejectId(null); setRejectReason(''); }}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#FF1744]">Отклонить заявку</h2>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Причина (необязательно):</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none focus:outline-none focus:border-[#FF1744]/50"
                placeholder="Укажите причину отказа..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectId}
                className="px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm hover:bg-[#FF1744]/80 transition-colors disabled:opacity-50"
              >
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
