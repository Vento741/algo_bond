import axios from 'axios';
import { create } from 'zustand';

interface AppState {
  appVersion: string;
  fetchVersion: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  appVersion: '',

  fetchVersion: async () => {
    try {
      const { data } = await axios.get<{ status: string; app: string; version: string }>('/health');
      set({ appVersion: data.version });
    } catch {
      // silent
    }
  },
}));
