import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

const legalLinks = [
  { to: '/terms', label: 'Условия использования' },
  { to: '/privacy', label: 'Конфиденциальность' },
  { to: '/cookies', label: 'Cookies' },
  { to: '/risk', label: 'Раскрытие рисков' },
];

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-brand-bg text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-5 lg:px-16 py-4 bg-brand-bg/80 backdrop-blur-lg border-b border-white/5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="AlgoBond - Главная">
          <img
            src="/logo.webp"
            alt=""
            className="w-9 h-9 rounded-lg"
            width={36}
            height={36}
          />
          <span className="font-heading text-xl font-bold tracking-tight">AlgoBond</span>
        </Link>

        <Link to="/">
          <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" />
            На главную
          </Button>
        </Link>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-5 py-12 lg:py-16">
        <header className="mb-10">
          <h1 className="font-heading text-3xl sm:text-4xl font-bold mb-3">{title}</h1>
          <p className="text-sm text-gray-400">Последнее обновление: {lastUpdated}</p>
        </header>

        <article className="prose-legal space-y-8 text-gray-300 leading-relaxed text-sm sm:text-base">
          {children}
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 px-5 lg:px-16 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-6">
            {legalLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm text-gray-400 hover:text-brand-premium transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 text-gray-600 text-xs">
            <img
              src="/logo.webp"
              alt=""
              className="w-4 h-4 rounded-sm"
              width={16}
              height={16}
            />
            <span>AlgoBond {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
