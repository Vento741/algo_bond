/**
 * Настройки уведомлений Telegram для Mini App
 */

import { useEffect, useState, useCallback } from 'react';
import { Bell, MessageCircle, Save } from 'lucide-react';
import api from '@/lib/api';
import { TgHeader } from '@/components/tg/TgHeader';
import { TgCard } from '@/components/tg/TgCard';
import type { TelegramSettings } from '@/types/api';

const ROWS: { key: keyof TelegramSettings; label: string }[] = [
  { key: 'positions_telegram', label: 'Positions' },
  { key: 'bots_telegram', label: 'Bots' },
  { key: 'orders_telegram', label: 'Orders' },
  { key: 'backtest_telegram', label: 'Backtest' },
  { key: 'system_telegram', label: 'System' },
  { key: 'finance_telegram', label: 'Finance' },
  { key: 'security_telegram', label: 'Security' },
];

const DEFAULT: TelegramSettings = {
  telegram_enabled: false,
  positions_telegram: false,
  bots_telegram: false,
  orders_telegram: false,
  backtest_telegram: false,
  system_telegram: false,
  finance_telegram: false,
  security_telegram: false,
};

export default function TgSettings() {
  const [settings, setSettings] = useState<TelegramSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TelegramSettings>('/telegram/settings');
      setSettings(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/telegram/settings', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof TelegramSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <TgHeader title="Settings" />
      <div className="space-y-3 p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
          </div>
        ) : (
          <>
            <TgCard>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-[#26A5E4]" />
                  <div>
                    <p className="text-sm font-medium text-white">Telegram Notifications</p>
                    <p className="text-[11px] text-gray-400">Master switch</p>
                  </div>
                </div>
                <button
                  onClick={() => toggle('telegram_enabled')}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    settings.telegram_enabled ? 'bg-[#26A5E4]' : 'bg-white/10'
                  }`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    settings.telegram_enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </TgCard>

            <TgCard>
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-gray-400" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Categories
                </p>
              </div>
              <div className="space-y-3">
                {ROWS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{label}</span>
                    <button
                      onClick={() => toggle(key)}
                      disabled={!settings.telegram_enabled}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        settings[key] && settings.telegram_enabled
                          ? 'bg-[#26A5E4]'
                          : 'bg-white/10'
                      } disabled:opacity-40`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        settings[key] && settings.telegram_enabled
                          ? 'translate-x-4'
                          : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </TgCard>

            <button
              onClick={save}
              disabled={saving}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors ${
                saved
                  ? 'bg-[#00E676]/20 text-[#00E676]'
                  : 'bg-[#FFD700] text-black hover:bg-[#FFD700]/90'
              } disabled:opacity-50`}
            >
              {saving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
