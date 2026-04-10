/**
 * Zustand-стор для Telegram WebApp аутентификации
 */

import { create } from 'zustand';
import api from '@/lib/api';

interface TelegramState {
  isTelegram: boolean;
  isAuthenticated: boolean;
  initData: string | null;
  setIsTelegram: (value: boolean) => void;
  setInitData: (data: string) => void;
  authenticate: () => Promise<void>;
}

export const useTelegramStore = create<TelegramState>((set, get) => ({
  isTelegram: false,
  isAuthenticated: false,
  initData: null,

  setIsTelegram: (value) => set({ isTelegram: value }),

  setInitData: (data) => set({ initData: data }),

  authenticate: async () => {
    const { initData } = get();
    if (!initData) return;

    try {
      const { data } = await api.post('/telegram/webapp/auth', { init_data: initData });
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      set({ isAuthenticated: true });
    } catch {
      set({ isAuthenticated: false });
    }
  },
}));
