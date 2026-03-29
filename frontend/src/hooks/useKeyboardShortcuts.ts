import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Глобальные клавиатурные сокращения.
 * Ctrl+D → Dashboard, Ctrl+B → Backtest, Ctrl+T → Chart, Space → toggle bot
 */
export function useKeyboardShortcuts(onToggleBot?: () => void): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Игнорируем если фокус в input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'd':
            e.preventDefault();
            navigate('/dashboard');
            break;
          case 'b':
            e.preventDefault();
            navigate('/backtest');
            break;
          case 't':
            e.preventDefault();
            navigate('/chart/BTCUSDT');
            break;
        }
      }

      // Space toggles bot on /bots page
      if (e.code === 'Space' && location.pathname === '/bots') {
        e.preventDefault();
        onToggleBot?.();
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, location.pathname, onToggleBot]);
}
