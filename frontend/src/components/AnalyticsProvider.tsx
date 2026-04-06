import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initTracker, trackPageview, destroyTracker } from '@/lib/tracker';

/**
 * Обертка для автоматического трекинга аналитики.
 * Подключается в BrowserRouter, отслеживает смену маршрутов.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    initTracker();
    return () => {
      destroyTracker();
    };
  }, []);

  useEffect(() => {
    trackPageview(location.pathname, document.title);
  }, [location.pathname]);

  return <>{children}</>;
}
