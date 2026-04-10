import { create } from 'zustand';
import api from '@/lib/api';
import type { NotificationItem, NotificationCategory } from '@/types/api';

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  filter: NotificationCategory | 'all';

  addNotification: (n: NotificationItem) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  setFilter: (f: NotificationCategory | 'all') => void;
  setOpen: (v: boolean) => void;
  fetchNotifications: (category?: string) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  filter: 'all',

  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + 1,
    })),

  markRead: (id) => {
    api.patch(`/notifications/${id}/read`).catch(() => {});
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n,
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: () => {
    api.patch('/notifications/read-all').catch(() => {});
    set((s) => ({
      notifications: s.notifications.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at || new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
  },

  deleteNotification: (id) => {
    const n = get().notifications.find((x) => x.id === id);
    api.delete(`/notifications/${id}`).catch(() => {});
    set((s) => ({
      notifications: s.notifications.filter((x) => x.id !== id),
      unreadCount: n && !n.is_read ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
    }));
  },

  setFilter: (f) => {
    set({ filter: f });
    get().fetchNotifications(f === 'all' ? undefined : f);
  },

  setOpen: (v) => set({ isOpen: v }),

  fetchNotifications: async (category) => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (category) params.set('category', category);
      const { data } = await api.get(`/notifications?${params}`);
      set({
        notifications: data.items,
        unreadCount: data.unread_count,
      });
    } catch {
      // Не критично при первой загрузке
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread/count');
      set({ unreadCount: data.count });
    } catch {
      // Не критично
    }
  },
}));
