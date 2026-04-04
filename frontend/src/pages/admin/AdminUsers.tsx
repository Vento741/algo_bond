import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  ShieldOff,
  Ban,
  CheckCircle,
  Trash2,
  Eye,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  bots_count: number;
  subscription_plan: string | null;
}

interface UserDetail {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  bots_count: number;
  exchange_accounts_count: number;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  total_pnl: number;
  total_trades: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function AdminUsers() {
  const [users, setUsers] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteEmail, setDeleteEmail] = useState('');
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setUsers(data);
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchUsers();
  };

  const viewUserDetail = async (userId: string) => {
    try {
      setDetailLoading(true);
      const { data } = await api.get(`/admin/users/${userId}`);
      setSelectedUser(data);
    } catch {
      // Error
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await api.patch(`/admin/users/${userId}`, { role: newRole });
      fetchUsers();
      if (selectedUser?.id === userId) {
        viewUserDetail(userId);
      }
    } catch {
      // Error
    }
  };

  const toggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await api.patch(`/admin/users/${userId}`, { is_active: !currentActive });
      fetchUsers();
      if (selectedUser?.id === userId) {
        viewUserDetail(userId);
      }
    } catch {
      // Error
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (deleteEmail !== email) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setDeleteConfirm(null);
      setDeleteEmail('');
      setSelectedUser(null);
      fetchUsers();
    } catch {
      // Error
    }
  };

  const totalPages = users ? Math.ceil(users.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white font-heading">Пользователи</h1>
        <p className="text-sm text-gray-400 mt-1">
          Управление аккаунтами пользователей
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Поиск по email или username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#FFD700]/50"
          />
        </form>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          className="px-3 py-2.5 rounded-lg bg-[#1a1a2e] border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50"
        >
          <option value="">Все роли</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 bg-[#1a1a2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Username</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Роль</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Боты</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Подписка</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Создан</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading && !users ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium mx-auto" />
                  </td>
                </tr>
              ) : users && users.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                users?.items.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white font-data">{u.email}</td>
                    <td className="px-4 py-3 text-gray-300">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        u.role === 'admin'
                          ? 'bg-[#FFD700]/10 text-[#FFD700]'
                          : 'bg-white/5 text-gray-400',
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 text-xs',
                        u.is_active ? 'text-[#00E676]' : 'text-[#FF1744]',
                      )}>
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          u.is_active ? 'bg-[#00E676]' : 'bg-[#FF1744]',
                        )} />
                        {u.is_active ? 'Активен' : 'Заблокирован'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-data">{u.bots_count}</td>
                    <td className="px-4 py-3 text-gray-400">{u.subscription_plan || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-data">
                      {new Date(u.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => viewUserDetail(u.id)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                          title="Подробнее"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleRole(u.id, u.role)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-[#FFD700] transition-colors"
                          title={u.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                        >
                          {u.role === 'admin' ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => toggleActive(u.id, u.is_active)}
                          className={cn(
                            'p-1.5 rounded-lg hover:bg-white/5 transition-colors',
                            u.is_active
                              ? 'text-gray-400 hover:text-[#FF1744]'
                              : 'text-gray-400 hover:text-[#00E676]',
                          )}
                          title={u.is_active ? 'Заблокировать' : 'Разблокировать'}
                        >
                          {u.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-[#FF1744] transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {users && users.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-gray-500">
              {users.offset + 1}-{Math.min(users.offset + limit, users.total)} из {users.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 font-data">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedUser(null)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-lg mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white font-heading">Профиль пользователя</h2>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500">Email</span>
                    <p className="text-white font-data">{selectedUser.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Username</span>
                    <p className="text-white">{selectedUser.username}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Роль</span>
                    <p className={selectedUser.role === 'admin' ? 'text-[#FFD700]' : 'text-gray-300'}>
                      {selectedUser.role}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Статус</span>
                    <p className={selectedUser.is_active ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                      {selectedUser.is_active ? 'Активен' : 'Заблокирован'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Боты</span>
                    <p className="text-white font-data">{selectedUser.bots_count}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Биржевые аккаунты</span>
                    <p className="text-white font-data">{selectedUser.exchange_accounts_count}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Подписка</span>
                    <p className="text-white">{selectedUser.subscription_plan || 'Нет'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Статус подписки</span>
                    <p className="text-gray-300">{selectedUser.subscription_status || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Всего сделок</span>
                    <p className="text-white font-data">{selectedUser.total_trades}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Суммарный P&L</span>
                    <p className={cn(
                      'font-data',
                      Number(selectedUser.total_pnl) >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]',
                    )}>
                      ${Number(selectedUser.total_pnl).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/5 text-xs text-gray-500 font-data">
                  Создан: {new Date(selectedUser.created_at).toLocaleString('ru-RU')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setDeleteConfirm(null); setDeleteEmail(''); }}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#FF1744]">Удаление пользователя</h2>
            <p className="text-sm text-gray-400">
              Это действие необратимо. Будут удалены все данные пользователя: боты, ордера, позиции, настройки.
            </p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Введите email пользователя для подтверждения:
              </label>
              <input
                type="text"
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FF1744]/50"
                placeholder="email@example.com"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteEmail(''); }}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  const user = users?.items.find((u) => u.id === deleteConfirm);
                  if (user) deleteUser(deleteConfirm, user.email);
                }}
                disabled={!users?.items.find((u) => u.id === deleteConfirm && u.email === deleteEmail)}
                className="px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm hover:bg-[#FF1744]/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
