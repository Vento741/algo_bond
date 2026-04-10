/**
 * Вспомогательные функции для Telegram WebApp SDK
 */

/** Интерфейс для типизации window.Telegram.WebApp */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat_instance?: string;
    chat_type?: string;
    auth_date?: number;
    hash?: string;
  };
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  colorScheme: 'light' | 'dark';
  isExpanded: boolean;
  expand(): void;
  ready(): void;
  close(): void;
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show(): void;
    hide(): void;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  version: string;
  platform: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/** Проверяет, запущено ли приложение внутри Telegram */
export function isTelegramWebApp(): boolean {
  return !!(
    window.Telegram?.WebApp &&
    window.Telegram.WebApp.initData &&
    window.Telegram.WebApp.initData.length > 0
  );
}

/** Возвращает сырую строку initData из Telegram WebApp */
export function getTelegramInitData(): string | null {
  if (!isTelegramWebApp()) return null;
  return window.Telegram!.WebApp.initData;
}

/** Возвращает объект Telegram WebApp или null */
export function getTelegramWebApp(): TelegramWebApp | null {
  if (!isTelegramWebApp()) return null;
  return window.Telegram!.WebApp;
}

/** Применяет CSS-переменные из themeParams Telegram */
export function applyTelegramTheme(): void {
  const twa = getTelegramWebApp();
  if (!twa) return;

  const params = twa.themeParams;
  const root = document.documentElement;

  if (params.bg_color) root.style.setProperty('--tg-bg', params.bg_color);
  if (params.text_color) root.style.setProperty('--tg-text', params.text_color);
  if (params.hint_color) root.style.setProperty('--tg-hint', params.hint_color);
  if (params.link_color) root.style.setProperty('--tg-link', params.link_color);
  if (params.button_color) root.style.setProperty('--tg-btn-bg', params.button_color);
  if (params.button_text_color) root.style.setProperty('--tg-btn-text', params.button_text_color);
  if (params.secondary_bg_color) root.style.setProperty('--tg-secondary-bg', params.secondary_bg_color);
}
