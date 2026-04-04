import { useEffect, useState } from 'react';
import {
  Users,
  Bot,
  MessageCircle,
  Activity,
  TrendingUp,
  Key,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';

interface AdminStats {
  users_count: number;
  active_bots: number;
  pending_requests: number;
  total_trades: number;
  total_pnl: number;
  active_invites: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function StatCard({ title, value, icon: Icon, color, bgColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold font-data text-white">{value}</p>
        </div>
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${bgColor}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/admin/stats');
      setStats(data);
    } catch {
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Админ-панель</h1>
          <p className="text-sm text-gray-400 mt-1">Обзор состояния платформы</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Всего пользователей"
            value={stats.users_count}
            icon={Users}
            color="text-blue-400"
            bgColor="bg-blue-400/10"
          />
          <StatCard
            title="Активные боты"
            value={stats.active_bots}
            icon={Bot}
            color="text-emerald-400"
            bgColor="bg-emerald-400/10"
          />
          <StatCard
            title="Заявки на рассмотрении"
            value={stats.pending_requests}
            icon={MessageCircle}
            color="text-yellow-400"
            bgColor="bg-yellow-400/10"
          />
          <StatCard
            title="Всего сделок"
            value={stats.total_trades.toLocaleString()}
            icon={Activity}
            color="text-purple-400"
            bgColor="bg-purple-400/10"
          />
          <StatCard
            title="Суммарный P&L"
            value={`$${Number(stats.total_pnl).toFixed(2)}`}
            icon={TrendingUp}
            color={Number(stats.total_pnl) >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}
            bgColor={Number(stats.total_pnl) >= 0 ? 'bg-[#00E676]/10' : 'bg-[#FF1744]/10'}
          />
          <StatCard
            title="Активные инвайт-коды"
            value={stats.active_invites}
            icon={Key}
            color="text-[#FFD700]"
            bgColor="bg-[#FFD700]/10"
          />
        </div>
      )}
    </div>
  );
}
