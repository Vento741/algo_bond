import { useEffect, useState, useCallback, useRef } from 'react';
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
  Bell as BellIcon,
  TrendingUp,
  Bot,
  ClipboardList,
  BarChart3,
  Cog,
  CreditCard,
  AlertTriangle,
  Lock,
  Clock,
  Palette,
  LineChart,
  Link2,
  ShieldCheck,
  MessageCircle,
  CheckCircle2,
  Unlink,
  DollarSign,
  ShieldAlert,
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
import type {
  ExchangeAccount,
  ExchangeAccountCreate,
  UserSettings,
  TelegramLinkStatus,
  TelegramSettings,
} from '@/types/api';

/* ---- Константы ---- */

const TIMEFRAME_OPTIONS = [
  { value: '1m', label: '1 минута' },
  { value: '5m', label: '5 минут' },
  { value: '15m', label: '15 минут' },
  { value: '1h', label: '1 час' },
  { value: '4h', label: '4 часа' },
];

const THEME_OPTIONS = [
  { value: 'dark', label: 'Темная' },
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

function getUserInitials(username: string | undefined, email: string | undefined): string {
  if (username && username.trim()) {
    return username.trim().slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'AB';
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

  /* Настройки уведомлений */
  const [notifPrefs, setNotifPrefs] = useState({
    positions_enabled: true,
    bots_enabled: true,
    orders_enabled: true,
    backtest_enabled: true,
    system_enabled: true,
    billing_enabled: true,
  });
  const [loadingNotifPrefs, setLoadingNotifPrefs] = useState(true);
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false);
  const [notifPrefsOriginal, setNotifPrefsOriginal] = useState(notifPrefs);

  /* Telegram */
  const [tgLink, setTgLink] = useState<TelegramLinkStatus | null>(null);
  const [loadingTg, setLoadingTg] = useState(true);
  const [linkingTg, setLinkingTg] = useState(false);
  const [unlinkingTg, setUnlinkingTg] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const tgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Telegram настройки уведомлений */
  const [tgSettings, setTgSettings] = useState<TelegramSettings>({
    telegram_enabled: false,
    positions_telegram: true,
    bots_telegram: true,
    orders_telegram: false,
    backtest_telegram: true,
    system_telegram: true,
    finance_telegram: true,
    security_telegram: true,
  });
  const [loadingTgSettings, setLoadingTgSettings] = useState(true);
  const [savingTgSettings, setSavingTgSettings] = useState(false);
  const [tgSettingsOriginal, setTgSettingsOriginal] = useState(tgSettings);

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
        /* нет аккаунтов - не критично */
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
        /* настройки не загружены - используем дефолты */
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  const loadNotifPrefs = useCallback(() => {
    setLoadingNotifPrefs(true);
    api
      .get('/notifications/preferences')
      .then(({ data }) => {
        setNotifPrefs(data);
        setNotifPrefsOriginal(data);
      })
      .catch(() => {})
      .finally(() => setLoadingNotifPrefs(false));
  }, []);

  const loadTgLink = useCallback(() => {
    setLoadingTg(true);
    api
      .get('/telegram/link')
      .then(({ data }) => setTgLink(data as TelegramLinkStatus))
      .catch(() => setTgLink({ is_linked: false, telegram_username: null, linked_at: null, telegram_enabled: false }))
      .finally(() => setLoadingTg(false));
  }, []);

  const loadTgSettings = useCallback(() => {
    setLoadingTgSettings(true);
    api
      .get('/telegram/settings')
      .then(({ data }) => {
        setTgSettings(data as TelegramSettings);
        setTgSettingsOriginal(data as TelegramSettings);
      })
      .catch(() => {})
      .finally(() => setLoadingTgSettings(false));
  }, []);

  useEffect(() => {
    loadAccounts();
    loadSettings();
    loadNotifPrefs();
    loadTgLink();
    loadTgSettings();
  }, [loadAccounts, loadSettings, loadNotifPrefs, loadTgLink, loadTgSettings]);

  /* Очистка polling при размонтировании */
  useEffect(() => {
    return () => {
      if (tgPollRef.current) clearInterval(tgPollRef.current);
    };
  }, []);

  /* Сохранение профиля */
  function handleSaveProfile() {
    if (!username.trim()) return;
    setSavingProfile(true);
    api
      .patch('/auth/me', { username: username.trim() })
      .then(() => {
        toast('Профиль обновлен', 'success');
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
        toast('Аккаунт удален', 'success');
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

  /* Сохранение настроек уведомлений */
  function handleSaveNotifPrefs() {
    setSavingNotifPrefs(true);
    api
      .put('/notifications/preferences', notifPrefs)
      .then(({ data }) => {
        setNotifPrefs(data);
        setNotifPrefsOriginal(data);
        toast('Настройки уведомлений сохранены', 'success');
      })
      .catch(() => toast('Ошибка сохранения настроек', 'error'))
      .finally(() => setSavingNotifPrefs(false));
  }

  /* Привязка Telegram: получить deep link, открыть в новой вкладке, polling */
  function handleLinkTelegram() {
    setLinkingTg(true);
    api
      .post('/telegram/link')
      .then(({ data }) => {
        window.open(data.deep_link_url, '_blank', 'noopener,noreferrer');
        // Polling каждые 3 сек, макс 2 минуты
        let elapsed = 0;
        tgPollRef.current = setInterval(() => {
          elapsed += 3000;
          api
            .get('/telegram/link')
            .then(({ data: linkData }) => {
              if (linkData.is_linked) {
                clearInterval(tgPollRef.current!);
                tgPollRef.current = null;
                setTgLink(linkData as TelegramLinkStatus);
                setLinkingTg(false);
                toast('Telegram успешно привязан', 'success');
                loadTgSettings();
              }
            })
            .catch(() => {});
          if (elapsed >= 120000) {
            clearInterval(tgPollRef.current!);
            tgPollRef.current = null;
            setLinkingTg(false);
          }
        }, 3000);
      })
      .catch(() => {
        toast('Ошибка создания ссылки', 'error');
        setLinkingTg(false);
      });
  }

  /* Отвязка Telegram */
  function handleUnlinkTelegram() {
    setUnlinkingTg(true);
    api
      .delete('/telegram/link')
      .then(() => {
        setTgLink({ is_linked: false, telegram_username: null, linked_at: null, telegram_enabled: false });
        setShowUnlinkConfirm(false);
        toast('Telegram отвязан', 'success');
      })
      .catch(() => toast('Ошибка отвязки', 'error'))
      .finally(() => setUnlinkingTg(false));
  }

  /* Сохранение TG-настроек уведомлений */
  function handleSaveTgSettings() {
    setSavingTgSettings(true);
    api
      .patch('/telegram/settings', tgSettings)
      .then(({ data }) => {
        setTgSettings(data as TelegramSettings);
        setTgSettingsOriginal(data as TelegramSettings);
        toast('Telegram-настройки сохранены', 'success');
      })
      .catch(() => toast('Ошибка сохранения', 'error'))
      .finally(() => setSavingTgSettings(false));
  }

  const notifPrefsChanged = JSON.stringify(notifPrefs) !== JSON.stringify(notifPrefsOriginal);
  const tgSettingsChanged = JSON.stringify(tgSettings) !== JSON.stringify(tgSettingsOriginal);

  /* Проверка, изменились ли настройки */
  const settingsChanged =
    settings !== null &&
    (defaultSymbol !== (settings.default_symbol || 'BTCUSDT') ||
      defaultTimeframe !== (settings.default_timeframe || '5m') ||
      theme !== (settings.ui_preferences?.theme || 'dark'));

  const profileChanged = username.trim() !== (user?.username ?? '');

  return (
    <div className="space-y-8">
      {/* --- Заголовок страницы --- */}
      <div className="relative">
        {/* Декоративный градиент за заголовком */}
        <div className="absolute -inset-x-4 -top-4 h-32 bg-gradient-to-b from-brand-premium/[0.03] to-transparent rounded-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-premium/20 to-brand-accent/10 border border-brand-premium/20 shadow-lg shadow-brand-premium/5">
              <SettingsIcon className="h-6 w-6 text-brand-premium" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight font-[Tektur]">
                Настройки
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Управление профилем, биржевыми аккаунтами и предпочтениями
              </p>
            </div>
          </div>
          {/* Декоративная линия-акцент */}
          <div className="mt-5 h-px bg-gradient-to-r from-brand-premium/30 via-brand-accent/10 to-transparent" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Левая колонка: Профиль + Предпочтения */}
        <div className="space-y-6">
          {/* ---- Профиль ---- */}
          <Card className="border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300 group">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <User className="h-4 w-4 text-brand-accent" />
                Профиль
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Аватар + роль */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-accent/30 to-brand-premium/20 border-2 border-brand-accent/20 flex items-center justify-center shadow-lg shadow-brand-accent/5">
                    <span className="text-lg font-bold text-white font-[Tektur] select-none">
                      {getUserInitials(user?.username, user?.email)}
                    </span>
                  </div>
                  {/* Статус-индикатор (online) */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-profit border-2 border-brand-bg" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user?.username || user?.email || '...'}
                  </p>
                  <Badge variant="premium" className="mt-1.5">
                    {roleLabel(user?.role ?? 'user')}
                  </Badge>
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* Email (readonly) */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">
                  Email
                </label>
                <div className="flex items-center gap-2.5 h-10 px-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <Lock className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                  <span className="text-sm text-gray-400 font-mono truncate">
                    {user?.email ?? '...'}
                  </span>
                  <Shield className="h-3.5 w-3.5 text-brand-profit/50 ml-auto flex-shrink-0" />
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
                  className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-brand-accent/40 transition-colors"
                />
              </div>

              {/* Дата регистрации */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.015]">
                <Clock className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                <span className="text-xs text-gray-500">Участник с</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">
                  {user?.created_at ? formatDate(user.created_at) : '...'}
                </span>
              </div>

              <Button
                onClick={handleSaveProfile}
                disabled={!profileChanged || savingProfile}
                className={`w-full min-h-[44px] transition-all duration-300 ${
                  profileChanged
                    ? 'bg-brand-premium text-brand-bg hover:bg-brand-premium/90 shadow-md shadow-brand-premium/20'
                    : 'bg-white/[0.04] text-gray-500 border border-white/[0.06]'
                } disabled:opacity-40`}
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
          <Card className="border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Globe className="h-4 w-4 text-brand-accent" />
                Предпочтения
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingSettings ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Торговая пара по умолчанию */}
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                      <LineChart className="h-3 w-3" />
                      Символ по умолчанию
                    </label>
                    <SymbolSearch
                      value={defaultSymbol}
                      onChange={setDefaultSymbol}
                      className="w-full"
                    />
                  </div>

                  <Separator className="bg-white/5" />

                  {/* Таймфрейм по умолчанию */}
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                      <Clock className="h-3 w-3" />
                      Таймфрейм по умолчанию
                    </label>
                    <Select
                      value={defaultTimeframe}
                      onChange={setDefaultTimeframe}
                      options={TIMEFRAME_OPTIONS}
                      className="w-full"
                    />
                  </div>

                  <Separator className="bg-white/5" />

                  {/* Тема */}
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                      <Palette className="h-3 w-3" />
                      Тема оформления
                    </label>
                    <Select
                      value={theme}
                      onChange={setTheme}
                      options={THEME_OPTIONS}
                      className="w-full"
                    />
                  </div>

                  <Button
                    onClick={handleSaveSettings}
                    disabled={!settingsChanged || savingSettings}
                    className={`w-full min-h-[44px] transition-all duration-300 ${
                      settingsChanged
                        ? 'bg-brand-premium text-brand-bg hover:bg-brand-premium/90 shadow-md shadow-brand-premium/20'
                        : 'bg-white/[0.04] text-gray-500 border border-white/[0.06]'
                    } disabled:opacity-40`}
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

        {/* Правая колонка: Биржевые аккаунты + Уведомления */}
        <div className="space-y-6">
          <Card className="border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Key className="h-4 w-4 text-brand-premium" />
                Биржевые аккаунты
                {accounts.length > 0 && (
                  <span className="text-xs text-gray-500 font-mono font-normal ml-1">
                    ({accounts.length})
                  </span>
                )}
              </CardTitle>
              <Button
                onClick={() => setShowAddAccount(true)}
                size="sm"
                className="bg-brand-premium text-brand-bg hover:bg-brand-premium/90 min-h-[36px] shadow-md shadow-brand-premium/10 transition-all duration-200 hover:shadow-lg hover:shadow-brand-premium/20"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAccounts ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-premium" />
                    <span className="text-xs text-gray-500">Загрузка аккаунтов...</span>
                  </div>
                </div>
              ) : accounts.length === 0 ? (
                /* --- Пустое состояние --- */
                <div className="flex flex-col items-center justify-center py-16">
                  {/* Визуальная композиция из иконок */}
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-premium/10 to-brand-accent/5 border border-brand-premium/10 flex items-center justify-center">
                      <Key className="h-8 w-8 text-brand-premium/40" />
                    </div>
                    {/* Декоративные элементы вокруг */}
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-lg bg-brand-accent/5 border border-brand-accent/10 flex items-center justify-center">
                      <Link2 className="h-3.5 w-3.5 text-brand-accent/30" />
                    </div>
                    <div className="absolute -bottom-1.5 -left-2 w-7 h-7 rounded-lg bg-brand-profit/5 border border-brand-profit/10 flex items-center justify-center">
                      <ShieldCheck className="h-3 w-3 text-brand-profit/30" />
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm font-medium">
                    Нет подключенных аккаунтов
                  </p>
                  <p className="text-gray-500 text-xs mt-1.5 text-center max-w-[260px]">
                    Добавьте API-ключи биржи для начала автоматической торговли
                  </p>
                  <Button
                    onClick={() => setShowAddAccount(true)}
                    variant="outline"
                    size="sm"
                    className="mt-5 min-h-[44px] border-brand-premium/20 text-brand-premium hover:bg-brand-premium/10 hover:border-brand-premium/30 transition-all duration-200"
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
                      className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03] transition-all duration-200 group/item"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Иконка биржи с индикатором статуса */}
                        <div className="relative flex-shrink-0">
                          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-brand-premium/15 to-brand-premium/5 border border-brand-premium/10">
                            <span className="text-xs font-bold text-brand-premium font-[Tektur] select-none">
                              BY
                            </span>
                          </div>
                          {/* Статус-точка */}
                          {account.is_active && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand-profit border-2 border-brand-bg">
                              <div className="absolute inset-0 rounded-full bg-brand-profit animate-ping opacity-30" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-white truncate">
                              {account.label}
                            </p>
                            {account.is_testnet && (
                              <Badge variant="accent" className="text-[10px] px-1.5 py-0">
                                DEMO
                              </Badge>
                            )}
                            {account.is_active && (
                              <Badge variant="profit" className="text-[10px] px-1.5 py-0">
                                Активен
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 mt-1">
                            <span className="text-xs text-gray-500 uppercase font-medium">
                              {account.exchange}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-gray-700" />
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
                        className="text-gray-600 hover:text-brand-loss hover:bg-brand-loss/10 flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-all duration-200 min-w-[44px] min-h-[44px]"
                        aria-label={`Удалить аккаунт ${account.label}`}
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
                <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-brand-premium/[0.04] to-transparent border border-brand-premium/10">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-premium/10 flex-shrink-0 mt-0.5">
                      <Shield className="h-4 w-4 text-brand-premium" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-300 mb-1">Безопасность ключей</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        API-ключи шифруются при хранении. Рекомендуем использовать отдельные ключи
                        с ограниченными правами (только торговля, без вывода).
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Telegram ---- */}
          <Card className="border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[#26A5E4]" />
                Telegram
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTg ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : tgLink?.is_linked ? (
                /* --- Привязан --- */
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#26A5E4]/[0.06] border border-[#26A5E4]/20">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#26A5E4]/10 flex-shrink-0">
                      <MessageCircle className="h-5 w-5 text-[#26A5E4]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">
                          {tgLink.telegram_username ? `@${tgLink.telegram_username}` : 'Привязан'}
                        </p>
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-profit flex-shrink-0" />
                      </div>
                      {tgLink.linked_at && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Привязан {formatDate(tgLink.linked_at)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tgSettings.telegram_enabled}
                      aria-label="Telegram уведомления"
                      onClick={() => {
                        const next = { ...tgSettings, telegram_enabled: !tgSettings.telegram_enabled };
                        setTgSettings(next);
                        api.patch('/telegram/settings', { telegram_enabled: next.telegram_enabled })
                          .then(({ data }) => {
                            setTgSettings(data as TelegramSettings);
                            setTgSettingsOriginal(data as TelegramSettings);
                          })
                          .catch(() => toast('Ошибка', 'error'));
                      }}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none ${tgSettings.telegram_enabled ? 'bg-[#26A5E4]' : 'bg-gray-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${tgSettings.telegram_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {showUnlinkConfirm ? (
                    <div className="p-3.5 rounded-xl bg-brand-loss/5 border border-brand-loss/20 space-y-3">
                      <p className="text-xs text-gray-300">Отвязать Telegram аккаунт? Уведомления перестанут приходить.</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleUnlinkTelegram}
                          disabled={unlinkingTg}
                          className="flex-1 bg-brand-loss/20 text-brand-loss hover:bg-brand-loss/30 border border-brand-loss/30 min-h-[36px]"
                        >
                          {unlinkingTg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Отвязать'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowUnlinkConfirm(false)}
                          className="flex-1 text-gray-400 hover:text-white min-h-[36px]"
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowUnlinkConfirm(true)}
                      className="w-full text-gray-500 hover:text-brand-loss hover:bg-brand-loss/5 min-h-[36px] border border-white/[0.04] hover:border-brand-loss/20 transition-all"
                    >
                      <Unlink className="mr-1.5 h-3.5 w-3.5" />
                      Отвязать Telegram
                    </Button>
                  )}
                </div>
              ) : (
                /* --- Не привязан --- */
                <div className="space-y-4">
                  <div className="flex flex-col items-center py-6 text-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-[#26A5E4]/10 border border-[#26A5E4]/20 flex items-center justify-center">
                      <MessageCircle className="h-7 w-7 text-[#26A5E4]/60" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Telegram не привязан</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-[220px]">
                        Получайте уведомления о сделках и статусе ботов прямо в Telegram
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleLinkTelegram}
                    disabled={linkingTg}
                    className="w-full min-h-[44px] bg-[#26A5E4]/15 text-[#26A5E4] hover:bg-[#26A5E4]/25 border border-[#26A5E4]/30 hover:border-[#26A5E4]/50 transition-all shadow-sm shadow-[#26A5E4]/5"
                  >
                    {linkingTg ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Ожидание привязки...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Привязать Telegram
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Уведомления ---- */}
          <Card className="border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-all duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <BellIcon className="h-4 w-4 text-brand-accent" />
                Уведомления
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingNotifPrefs || loadingTgSettings ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Заголовок колонок */}
                  <div className="flex items-center gap-3 px-3 pb-1">
                    <div className="flex-1 min-w-0" />
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="flex items-center gap-1 w-10 justify-center">
                        <Monitor className="h-3 w-3 text-gray-500" />
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Web</span>
                      </div>
                      <div className={`flex items-center gap-1 w-10 justify-center ${!tgLink?.is_linked ? 'opacity-40' : ''}`}>
                        <MessageCircle className="h-3 w-3 text-[#26A5E4]" />
                        <span className="text-[10px] text-[#26A5E4] uppercase tracking-wider">TG</span>
                      </div>
                    </div>
                  </div>

                  {([
                    { webKey: 'positions_enabled', tgKey: 'positions_telegram', label: 'Позиции', desc: 'Открытие, закрытие, TP/SL', icon: TrendingUp },
                    { webKey: 'bots_enabled', tgKey: 'bots_telegram', label: 'Боты', desc: 'Старт, стоп, ошибки', icon: Bot, critical: true },
                    { webKey: 'orders_enabled', tgKey: 'orders_telegram', label: 'Ордера', desc: 'Исполнение, отмена', icon: ClipboardList },
                    { webKey: 'backtest_enabled', tgKey: 'backtest_telegram', label: 'Бэктесты', desc: 'Завершение, ошибки', icon: BarChart3 },
                    { webKey: 'system_enabled', tgKey: 'system_telegram', label: 'Системные', desc: 'Соединение, ошибки сервисов', icon: Cog, critical: true, adminOnly: true },
                    { webKey: 'billing_enabled', tgKey: null, label: 'Биллинг', desc: 'Подписки, платежи', icon: CreditCard },
                    { webKey: null, tgKey: 'finance_telegram', label: 'Финансы', desc: 'P&L отчёты, баланс, маржа', icon: DollarSign },
                    { webKey: null, tgKey: 'security_telegram', label: 'Безопасность', desc: 'Вход, изменение ключей', icon: ShieldAlert },
                  ] as const).map((cat) => {
                    const Icon = cat.icon;
                    const webEnabled = cat.webKey ? notifPrefs[cat.webKey as keyof typeof notifPrefs] : null;
                    const tgEnabled = cat.tgKey ? tgSettings[cat.tgKey as keyof TelegramSettings] : null;
                    const tgDisabled = !tgLink?.is_linked || !tgSettings.telegram_enabled;
                    return (
                      <div
                        key={cat.label}
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.03] transition-colors"
                      >
                        <Icon className={`h-4 w-4 flex-shrink-0 ${(webEnabled ?? tgEnabled) ? 'text-brand-accent' : 'text-gray-600'} transition-colors`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-white truncate">{cat.label}</p>
                            {'adminOnly' in cat && cat.adminOnly && (
                              <span className="text-[10px] text-gray-600 flex-shrink-0">* адм.</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{cat.desc}</p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          {/* Web toggle */}
                          <div className="w-10 flex justify-center">
                            {webEnabled !== null ? (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={webEnabled as boolean}
                                aria-label={`${cat.label} Web`}
                                onClick={() => setNotifPrefs((prev) => ({ ...prev, [cat.webKey as string]: !prev[cat.webKey as keyof typeof prev] }))}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none ${webEnabled ? 'bg-brand-profit' : 'bg-gray-600'}`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${webEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                              </button>
                            ) : <div className="w-9" />}
                          </div>
                          {/* TG toggle */}
                          <div className="w-10 flex justify-center">
                            {tgEnabled !== null ? (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={tgEnabled as boolean}
                                aria-label={`${cat.label} TG`}
                                disabled={tgDisabled}
                                onClick={() => setTgSettings((prev) => ({ ...prev, [cat.tgKey as string]: !prev[cat.tgKey as keyof TelegramSettings] }))}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-30 disabled:cursor-not-allowed ${tgEnabled && !tgDisabled ? 'bg-[#26A5E4]' : 'bg-gray-600'}`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${tgEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                              </button>
                            ) : <div className="w-9" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {!tgLink?.is_linked && (
                    <p className="text-xs text-gray-600 px-1">
                      * TG-уведомления требуют привязки Telegram аккаунта выше.
                    </p>
                  )}

                  <div className="p-3 rounded-lg bg-brand-loss/5 border border-brand-loss/10">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-brand-loss mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-400">
                        <span className="text-brand-loss font-medium">Внимание:</span>{' '}
                        отключение критических уведомлений (боты, системные) может привести к пропуску важных событий.
                      </p>
                    </div>
                  </div>

                  <Separator className="bg-white/5" />

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveNotifPrefs}
                      disabled={!notifPrefsChanged || savingNotifPrefs}
                      className={`flex-1 min-h-[44px] transition-all duration-300 ${
                        notifPrefsChanged
                          ? 'bg-brand-premium text-brand-bg hover:bg-brand-premium/90 shadow-md shadow-brand-premium/20'
                          : 'bg-white/[0.04] text-gray-500 border border-white/[0.06]'
                      } disabled:opacity-40`}
                    >
                      {savingNotifPrefs ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Web
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleSaveTgSettings}
                      disabled={!tgSettingsChanged || savingTgSettings || !tgLink?.is_linked}
                      className={`flex-1 min-h-[44px] transition-all duration-300 ${
                        tgSettingsChanged && tgLink?.is_linked
                          ? 'bg-[#26A5E4]/15 text-[#26A5E4] hover:bg-[#26A5E4]/25 border border-[#26A5E4]/30'
                          : 'bg-white/[0.04] text-gray-500 border border-white/[0.06]'
                      } disabled:opacity-40`}
                    >
                      {savingTgSettings ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          TG
                        </>
                      )}
                    </Button>
                  </div>
                </>
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
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Биржа</label>
            <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <span className="text-sm text-gray-400">Bybit</span>
              <Badge variant="default" className="ml-auto">
                V5 API
              </Badge>
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Название</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: My Bybit Demo"
              required
              className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-brand-accent/40 min-h-[44px]"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">API Key</label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Вставьте API ключ"
              required
              className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 font-mono text-xs focus:border-brand-accent/40 min-h-[44px]"
            />
          </div>

          {/* API Secret */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">API Secret</label>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Вставьте API секрет"
                required
                className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-gray-600 font-mono text-xs pr-10 focus:border-brand-accent/40 min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors p-1"
                aria-label={showSecret ? 'Скрыть секрет' : 'Показать секрет'}
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
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div>
              <p className="text-sm text-white">Demo-режим</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Реальные цены, симулированные ордера (без риска)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isTestnet}
              aria-label={`Demo-режим: ${isTestnet ? 'включен' : 'выключен'}`}
              onClick={() => setIsTestnet(!isTestnet)}
              className={`
                relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg
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
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-brand-premium/[0.04] to-transparent border border-brand-premium/10">
            <div className="flex items-start gap-2.5">
              <Shield className="h-4 w-4 text-brand-premium mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-400 leading-relaxed">
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
              className="flex-1 text-gray-400 min-h-[44px]"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={!label.trim() || !apiKey.trim() || !apiSecret.trim() || submitting}
              className="flex-1 bg-brand-premium text-brand-bg hover:bg-brand-premium/90 min-h-[44px] shadow-md shadow-brand-premium/10 disabled:shadow-none"
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
              className="flex-1 text-gray-400 min-h-[44px]"
            >
              Отмена
            </Button>
            <Button
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 bg-brand-loss/20 text-brand-loss hover:bg-brand-loss/30 border border-brand-loss/20 min-h-[44px]"
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
