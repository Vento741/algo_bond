import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const CONSENT_KEY = 'cookie_consent';
const CONSENT_VALUE = 'accepted';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay so banner slides in after page renders
    const timer = setTimeout(() => {
      if (localStorage.getItem(CONSENT_KEY) !== CONSENT_VALUE) {
        setVisible(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, CONSENT_VALUE);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[100] animate-slide-up"
    >
      <div className="bg-brand-card/95 backdrop-blur-sm border-t border-white/10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-300 text-center sm:text-left">
            Мы используем cookies и localStorage для работы сервиса.{' '}
            <Link
              to="/cookies"
              className="text-brand-premium hover:underline whitespace-nowrap"
            >
              Подробнее
            </Link>
          </p>
          <Button
            variant="premium"
            size="sm"
            onClick={handleAccept}
            className="flex-shrink-0"
          >
            Принять
          </Button>
        </div>
      </div>
    </div>
  );
}
