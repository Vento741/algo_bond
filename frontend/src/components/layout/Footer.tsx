import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';

const LEGAL_LINKS = [
  { label: 'Условия использования', href: '/terms' },
  { label: 'Конфиденциальность', href: '/privacy' },
  { label: 'Обработка данных', href: '/cookies' },
  { label: 'Раскрытие рисков', href: '/risk' },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/[0.04] px-5 lg:px-10 pt-20 pb-10">
      <div className="max-w-[1200px] mx-auto">
        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-16 mb-16">
          {/* Column 1: Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img
                src="/logo.webp"
                alt=""
                className="w-7 h-7 rounded-lg"
                width={28}
                height={28}
              />
              <span className="font-heading text-xl font-bold text-white tracking-tight">
                Algo
                <span className="text-brand-premium">Bond</span>
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-[1.7] max-w-xs">
              Платформа алгоритмической торговли криптофьючерсами.
              ML-стратегии, бэктестинг, автоматическое исполнение на Bybit.
            </p>
          </div>

          {/* Column 2: Legal */}
          <div>
            <h4 className="text-xs uppercase tracking-[2px] text-gray-500 font-medium mb-5">
              Правовая информация
            </h4>
            <div className="flex flex-col gap-1">
              {LEGAL_LINKS.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-sm text-gray-600 py-1.5 hover:text-gray-400 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Column 3: Contact */}
          <div>
            <h4 className="text-xs uppercase tracking-[2px] text-gray-500 font-medium mb-5">
              Контакты
            </h4>
            <a
              href="https://t.me/algobond"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-400 transition-colors"
            >
              <Send className="h-4 w-4" />
              Telegram
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/[0.04] text-center">
          <p className="text-xs text-gray-700">
            &copy; 2026 AlgoBond. Все права защищены.
            &nbsp;&nbsp;
            <span className="font-data text-gray-700">v0.9.0</span>
          </p>
          <p className="text-[11px] text-gray-700 leading-[1.7] max-w-[640px] mx-auto mt-4">
            Торговля криптовалютными фьючерсами сопряжена с высоким риском
            потери средств. Прошлые результаты стратегий не являются гарантией
            будущей доходности. AlgoBond не является финансовым советником и не
            несёт ответственности за торговые решения пользователей.
          </p>
        </div>
      </div>
    </footer>
  );
}
