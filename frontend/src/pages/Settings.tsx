import { useEffect, useState, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  User,
  Key,
  Globe,
  Plus,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Calendar,
  Monitor,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SymbolSearch } from '@/components/ui/symbol-search';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/api';
import type { ExchangeAccount, ExchangeAccountCreate, UserSettings } from '@/types/api';

/* ---- Константы ---- */

const TIMEFRAME_OPTIONS = [
  { value: '1m', label: '1 минута' },
  { value: '5m', label: '5 минут' },
  { value: '15m', label: '15 минут' },
  { value: '1h', label: '1 час' },
  { value: '4h', label: '4 часа' },
];

const THEME_OPTIONS = [
  { value: 'dark', label: 'Тёмная' },
  { value: 'light', label: 'Светлая' },
];

/* ---- Хелперы ---- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: 'Администратор',
    user: 'Пользователь',
    premium: 'Premium',
  };
  return map[role] ?? role;
}

/* ---- Главный компонент ---- */

export function Settings() {
  const { user, fetchUser } = useAuthStore();
  const { toast } = useToast();

  /* Профиль */
  const [username, setUsername] = useState(user?.username ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  /* Биржевые аккаунты */
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  /* Настройки */
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  /* Локальные настройки (для редактирования до сохранения) */
  const [defaultSymbol, setDefaultSymbol] = useState('BTCUSDT');
  const [defaultTimeframe, setDefaultTimeframe] = useState('5m');
  const [theme, setTheme] = useState('dark');

  /* Синхронизация имени пользователя из стора */
  useEffect(() => {
    if (user?.username) setUsername(user.username);
  }, [user?.username]);

  /* Загрузка данных */
  const loadAccounts = useCallback(() => {
    setLoadingAccounts(true);
    api
      .get('/auth/exchange-accounts')
      .then(({ data }) => setAccounts(data as ExchangeAccount[]))
      .catch(() => {
        /* нет аккаунтов — не критично */
      })
      .finally(() => setLoadingAccounts(false));
  }, []);

  const loadSettings = useCallback(() => {
    setLoadingSettings(true);
    api
      .get('/auth/settings')
      .then(({ data }) => {
        const s = data as UserSettings;
        setSettings(s);
        setDefaultSymbol(s.default_symbol || 'BTCUSDT');
        setDefaultTimeframe(s.default_timeframe || '5m');
        setTheme(s.ui_preferences?.theme || 'dark');
      })
      .catch(() => {
        /* настройки не загружены — используем дефолты */
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  useEffect(() => {
    loadAccounts();
    loadSettings();
  }, [loadAccounts, loadSettings]);

  /* Сохранение профиля */
  function handleSaveProfile() {
    if (!username.trim()) return;
    setSavingProfile(true);
    api
      .patch('/auth/me', { username: username.trim() })
      .then(() => {
        toast('Профиль обновлён', 'success');
        fetchUser();
      })
      .catch(() => {
        toast('Ошибка обновления профиля', 'error');
      })
      .finally(() => setSavingProfile(false));
  }

  /* Удаление биржевого аккаунта */
  function handleDeleteAccount(id: string) {
    setDeletingId(id);
    api
      .delete(`/auth/exchange-accounts/${id}`)
      .then(() => {
        toast('Аккаунт удалён', 'success');
        loadAccounts();
      })
      .catch(() => {
        toast('Ошибка удаления аккаунта', 'error');
      })
      .finally(() => {
        setDeletingId(null);
        setShowDeleteConfirm(null);
      });
  }

  /* Сохранение настроек */
  function handleSaveSettings() {
    setSavingSettings(true);
    api
      .patch('/auth/settings', {
        default_symbol: defaultSymbol,
        default_timeframe: defaultTimeframe,
        ui_preferences: { theme, chart_style: settings?.ui_preferences?.chart_style || 'candles' },
      })
      .then(({ data }) => {
        setSettings(data as UserSettings);
        toast('Настройки сохранены', 'success');
      })
      .catch(() => {
        toast('Ошибка сохранения настроек', 'error');
      })
      .finally(() => setSavingSettings(false));
  }

  /* Проверка, изменились ли настройки */
  const settingsChanged =
    settings !== null &&
    (defaultSymbol !== (settings.default_symbol || 'BTCUSDT') ||
      defaultTimeframe !== (settings.default_timeframe || '5m') ||
      theme !== (settings.ui_preferences?.theme || 'dark'));

  const profileChanged = username.trim() !== (user?.username ?? '');

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-brand-premium" />
          Настройки
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Управление профилем, биржевыми аккаунтами и предпочтениями
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая колонка: Профиль + Предпочтения */}
        <div className="lg:col-span-1 space-y-6">
          {/* ---- Профиль ---- */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <User className="h-4 w-4 text-brand-accent" />
                Профиль
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Email (readonly) */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">
                  Email
                </label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-white/5 bg-white/[0.01]">
                  <span className="text-sm text-gray-400 font-mono truncate">
                    {user?.email ?? '...'}
                  </span>
                  <Shield className="h-3.5 w-3.5 text-gray-600 ml-auto flex-shrink-0" />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">
                  Имя пользователя
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите имя"
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
                />
              </div>

              {/* Роль */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Роль</span>
                <Badge variant="premium">{roleLabel(user?.role ?? 'user')}</Badge>
              </div>

              {/* Дата регистрации */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  Участник с
                </span>
                <span className="text-xs text-gray-400 font-mono flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {user?.created_at ? formatDate(user.created_at) : '...'}
                </span>
              </div>

              <Separator className="bg-white/5" />

              <Button
                onClick={handleSaveProfile}
                disabled={!profileChanged || savingProfile}
                className="w-full bg-brand-premium text-brand-bg hover:bg-brand-premium/90 disabled:opacity-40"
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Сохранить профиль
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* ---- Предпочтения ---- */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Globe className="h-4 w-4 text-brand-accent" />
                Предпочтения
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingSettings ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Торговая пара по умолчанию */}
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">
                      Символ по умолчанию
                    </label>
                    <SymbolSearch
                      value={defaultSymbol}
                      onChange={setDefaultSymbol}
                      className="w-full"
                    />
                  </div>

                  {/* Таймфрейм по умолчанию */}
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">
                      Таймфрейм по умолчанию
                    </label>
                    <Select
                      value={defaultTimeframe}
                      onChange={setDefaultTimeframe}
                      options={TIMEFRAME_OPTIONS}
                      className="w-full"
                    />
                  </div>

                  {/* Тема */}
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">
                      <Monitor className="h-3 w-3 inline mr-1" />
                      Тема оформления
                    </label>
                    <Select
                      value={theme}
                      onChange={setTheme}
                      options={THEME_OPTIONS}
                      className="w-full"
                    />
                  </div>

                  <Separator className="bg-white/5" />

                  <Button
                    onClick={handleSaveSettings}
                    disabled={!settingsChanged || savingSettings}
                    className="w-full bg-brand-premium text-brand-bg hover:bg-brand-premium/90 disabled:opacity-40"
                  >
                    {savingSettings ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Сохранить настройки
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Правая колонка: Биржевые аккаунты */}
        <div className="lg:col-span-2">
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Key className="h-4 w-4 text-brand-premium" />
                Биржевые аккаунты
              </CardTitle>
              <Button
                onClick={() => setShowAddAccount(true)}
                size="sm"
                className="bg-brand-premium text-brand-bg hover:bg-brand-premium/90"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAccounts ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Key className="h-10 w-10 text-gray-600 mb-3" />
                  <p className="text-gray-400 text-sm font-medium">
                    Нет подключённых аккаунтов
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Добавьте API-ключи биржи для начала торговли
                  </p>
                  <Button
                    onClick={() => setShowAddAccount(true)}
                    variant="outline"
                    size="sm"
                    className="mt-4 border-brand-premium/30 text-brand-premium hover:bg-brand-premium/10"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Добавить аккаунт
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-premium/10 flex-shrink-0">
                          <Key className="h-4 w-4 text-brand-premium" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">
                              {account.label}
                            </p>
                            {account.is_testnet && (
                              <Badge variant="accent">Demo</Badge>
                            )}
                            {account.is_active && (
                              <Badge variant="profit">Активен</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-400 uppercase">
                              {account.exchange}
                            </span>
                            <span className="text-xs text-gray-600 font-mono">
                              {formatDate(account.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowDeleteConfirm(account.id)}
                        disabled={deletingId === account.id}
                        className="text-gray-400 hover:text-brand-loss hover:bg-brand-loss/10 flex-shrink-0"
                      >
                        {deletingId === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Предупреждение о безопасности */}
              {accounts.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-brand-premium/5 border border-brand-premium/10">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-brand-premium mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-400">
                      API-ключи шифруются при хранении. Рекомендуем использовать отдельные ключи
                      с ограниченными правами (только торговля, без вывода).
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---- Диалог добавления аккаунта ---- */}
      <AddAccountDialog
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onCreated={() => {
          setShowAddAccount(false);
          loadAccounts();
          toast('Аккаунт добавлен', 'success');
        }}
      />

      {/* ---- Диалог подтверждения удаления ---- */}
      <DeleteConfirmDialog
        open={showDeleteConfirm !== null}
        accountLabel={accounts.find((a) => a.id === showDeleteConfirm)?.label ?? ''}
        onClose={() => setShowDeleteConfirm(null)}
        onConfirm={() => {
          if (showDeleteConfirm) handleDeleteAccount(showDeleteConfirm);
        }}
        deleting={deletingId !== null}
      />
    </div>
  );
}

/* ---- Диалог добавления биржевого аккаунта ---- */

function AddAccountDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isTestnet, setIsTestnet] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setLabel('');
    setApiKey('');
    setApiSecret('');
    setIsTestnet(true);
    setShowSecret(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !apiKey.trim() || !apiSecret.trim()) return;

    setSubmitting(true);
    const payload: ExchangeAccountCreate = {
      exchange: 'bybit',
      label: label.trim(),
      api_key: apiKey.trim(),
      api_secret: apiSecret.trim(),
      is_testnet: isTestnet,
    };

    api
      .post('/auth/exchange-accounts', payload)
      .then(() => {
        resetForm();
        onCreated();
      })
      .catch(() => {
        toast('Ошибка добавления аккаунта', 'error');
      })
      .finally(() => setSubmitting(false));
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent>
        <DialogHeader onClose={handleClose}>
          <DialogTitle>Добавить биржевой аккаунт</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Exchange (hardcoded) */}
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Биржа</label>
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-white/5 bg-white/[0.01]">
              <span className="text-sm text-gray-400">Bybit</span>
              <Badge variant="default" className="ml-auto">
                V5 API
              </Badge>
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Название</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: My Bybit Demo"
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">API Key</label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Вставьте API ключ"
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 font-mono text-xs"
            />
          </div>

          {/* API Secret */}
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">API Secret</label>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Вставьте API секрет"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Demo mode toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <div>
              <p className="text-sm text-white">Demo-режим</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Реальные цены, симулированные ордера (без риска)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isTestnet}
              onClick={() => setIsTestnet(!isTestnet)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${isTestnet ? 'bg-brand-profit' : 'bg-gray-600'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 rounded-full bg-white transition-transform
                  ${isTestnet ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* Предупреждение */}
          <div className="p-3 rounded-lg bg-brand-premium/5 border border-brand-premium/10">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-brand-premium mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-400">
                API-ключи будут зашифрованы. Рекомендуем создать ключи с правами только на торговлю,
                без возможности вывода средств.
              </p>
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              className="flex-1 text-gray-400"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={!label.trim() || !apiKey.trim() || !apiSecret.trim() || submitting}
              className="flex-1 bg-brand-premium text-brand-bg hover:bg-brand-premium/90"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Добавить
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Диалог подтверждения удаления ---- */

function DeleteConfirmDialog({
  open,
  accountLabel,
  onClose,
  onConfirm,
  deleting,
}: {
  open: boolean;
  accountLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader onClose={onClose}>
          <DialogTitle>Удалить аккаунт?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Вы действительно хотите удалить биржевой аккаунт{' '}
            <span className="text-white font-medium">{accountLabel}</span>?
            Все связанные боты будут остановлены.
          </p>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={deleting}
              className="flex-1 text-gray-400"
            >
              Отмена
            </Button>
            <Button
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 bg-brand-loss/20 text-brand-loss hover:bg-brand-loss/30 border border-brand-loss/20"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Удалить
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
