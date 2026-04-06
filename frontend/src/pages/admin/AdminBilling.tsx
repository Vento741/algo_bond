import { useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Bot,
  Brain,
  FlaskConical,
} from 'lucide-react';
import api from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  max_bots: number;
  max_strategies: number;
  max_backtests_per_day: number;
  features: Record<string, unknown>;
}

export function AdminBilling() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    price_monthly: 0,
    max_bots: 1,
    max_strategies: 1,
    max_backtests_per_day: 5,
    features: {},
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/billing/plans');
      setPlans(data);
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateForm = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      slug: '',
      price_monthly: 0,
      max_bots: 1,
      max_strategies: 1,
      max_backtests_per_day: 5,
      features: {},
    });
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      price_monthly: plan.price_monthly,
      max_bots: plan.max_bots,
      max_strategies: plan.max_strategies,
      max_backtests_per_day: plan.max_backtests_per_day,
      features: plan.features,
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormLoading(true);
      setFormError(null);

      if (editingPlan) {
        // PATCH - only changed fields (excluding slug)
        await api.patch(`/billing/plans/${editingPlan.id}`, {
          name: formData.name,
          price_monthly: formData.price_monthly,
          max_bots: formData.max_bots,
          max_strategies: formData.max_strategies,
          max_backtests_per_day: formData.max_backtests_per_day,
        });
      } else {
        // POST - create new
        await api.post('/billing/plans', formData);
      }

      setShowForm(false);
      fetchPlans();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        'Ошибка сохранения';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await api.delete(`/billing/plans/${deleteId}`);
      setDeleteId(null);
      fetchPlans();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        'Ошибка удаления';
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-premium" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Тарифные планы</h1>
          <p className="text-sm text-gray-400 mt-1">Управление подписками и лимитами</p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Создать план
        </button>
      </div>

      {/* Plan Cards */}
      {plans.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-[#1a1a2e] p-12 text-center">
          <p className="text-gray-500">Нет тарифных планов. Создайте первый!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl border border-white/5 bg-[#1a1a2e] p-5 space-y-4 relative group"
            >
              {/* Actions overlay */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEditForm(plan)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { setDeleteId(plan.id); setDeleteError(null); }}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-[#FF1744]/10 text-gray-400 hover:text-[#FF1744] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Plan info */}
              <div>
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="text-xs text-gray-500 font-data">{plan.slug}</p>
              </div>

              <div className="text-3xl font-bold text-[#FFD700] font-data">
                ${Number(plan.price_monthly).toFixed(2)}
                <span className="text-sm text-gray-500 font-normal">/мес</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Bot className="h-4 w-4 text-gray-500" />
                  <span>Ботов: <strong className="text-white font-data">{plan.max_bots}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Brain className="h-4 w-4 text-gray-500" />
                  <span>Стратегий: <strong className="text-white font-data">{plan.max_strategies}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <FlaskConical className="h-4 w-4 text-gray-500" />
                  <span>Бэктестов/день: <strong className="text-white font-data">{plan.max_backtests_per_day}</strong></span>
                </div>
              </div>

              {/* Features JSON (read-only) */}
              {Object.keys(plan.features).length > 0 && (
                <div className="pt-2 border-t border-white/5">
                  <p className="text-xs text-gray-500 mb-1">Features:</p>
                  <pre className="text-xs text-gray-400 font-data bg-white/5 rounded p-2 overflow-auto max-h-20">
                    {JSON.stringify(plan.features, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowForm(false)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white font-heading">
                {editingPlan ? 'Редактировать план' : 'Новый план'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Название</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  maxLength={50}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FFD700]/50"
                />
              </div>

              {!editingPlan && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Slug (уникальный идентификатор)</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                    required
                    maxLength={50}
                    pattern="^[a-z0-9_-]+$"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-1">Цена ($/мес)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price_monthly}
                  onChange={(e) => setFormData({ ...formData, price_monthly: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Боты</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.max_bots}
                    onChange={(e) => setFormData({ ...formData, max_bots: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Стратегии</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.max_strategies}
                    onChange={(e) => setFormData({ ...formData, max_strategies: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Бэктесты</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.max_backtests_per_day}
                    onChange={(e) => setFormData({ ...formData, max_backtests_per_day: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-data focus:outline-none focus:border-[#FFD700]/50"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-sm text-[#FF1744]">{formError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD700] text-[#0d0d1a] text-sm font-medium hover:bg-[#FFD700]/90 transition-colors disabled:opacity-50"
                >
                  {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingPlan ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeleteId(null)}>
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#FF1744]">Удалить план</h2>
            <p className="text-sm text-gray-400">
              Вы уверены? План не может быть удален, если у него есть активные подписки.
            </p>
            {deleteError && (
              <p className="text-sm text-[#FF1744]">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm hover:bg-[#FF1744]/80 transition-colors disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
