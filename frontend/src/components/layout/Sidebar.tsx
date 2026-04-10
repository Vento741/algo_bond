import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Brain,
  Bot,
  FlaskConical,
  Settings,
  CandlestickChart,
  Menu,
  X,
  Users,
  MessageCircle,
  KeyRound,
  CreditCard,
  Terminal,
  BarChart3,
  Monitor,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'График', href: '/chart', icon: CandlestickChart, matchPrefix: '/chart' },
  { name: 'Стратегии', href: '/strategies', icon: Brain },
  { name: 'Боты', href: '/bots', icon: Bot },
  { name: 'Бэктест', href: '/backtest', icon: FlaskConical },
  { name: 'Настройки', href: '/settings', icon: Settings },
];

const adminNavigation = [
  { name: 'Аналитика', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Обзор', href: '/admin', icon: LayoutDashboard },
  { name: 'Пользователи', href: '/admin/users', icon: Users },
  { name: 'Заявки', href: '/admin/requests', icon: MessageCircle },
  { name: 'Инвайт-коды', href: '/admin/invites', icon: KeyRound },
  { name: 'Тарифы', href: '/admin/billing', icon: CreditCard },
  { name: 'Логи', href: '/admin/logs', icon: Terminal },
  { name: 'Система', href: '/admin/system', icon: Monitor },
];

function NavItem({
  item,
  location,
  onClick,
}: {
  item: { name: string; href: string; icon: React.ElementType; matchPrefix?: string };
  location: { pathname: string };
  onClick?: () => void;
}) {
  const prefix = item.matchPrefix ?? item.href;
  const isActive =
    location.pathname === item.href ||
    (prefix !== '/dashboard' && prefix !== '/admin' && location.pathname.startsWith(prefix));

  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
        'transition-all duration-200 ease-out',
        isActive
          ? 'bg-brand-accent/10 text-white'
          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] hover:pl-4',
      )}
    >
      {/* Active indicator - gradient left border */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{
            background: 'linear-gradient(180deg, #4488ff 0%, #6aa3ff 100%)',
            boxShadow: '0 0 8px rgba(68, 136, 255, 0.4)',
          }}
        />
      )}
      <item.icon
        className={cn(
          'h-5 w-5 flex-shrink-0 transition-colors duration-200',
          isActive ? 'text-brand-accent' : 'text-gray-500 group-hover:text-gray-400',
        )}
      />
      {item.name}
    </Link>
  );
}

export function Sidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuthStore();

  const isAdmin = user?.role === 'admin';

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div
          className="relative flex items-center justify-center w-9 h-9 rounded-lg overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(68, 136, 255, 0.15) 0%, rgba(68, 136, 255, 0.05) 100%)',
            boxShadow: '0 0 12px rgba(68, 136, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <img src="/logo.webp" alt="AlgoBond" className="w-9 h-9 rounded-lg" />
        </div>
        <span className="text-xl font-bold text-white font-heading tracking-wide">
          AlgoBond
        </span>
        {/* Mobile close */}
        <button
          className="ml-auto md:hidden text-gray-400 hover:text-white transition-colors"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {/* Separator below logo */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            location={location}
            onClick={() => setMobileOpen(false)}
          />
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <span className="block text-[10px] text-gray-500 px-3 pb-1.5 uppercase tracking-[0.15em] font-medium">
              Админ
            </span>
            {adminNavigation.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                location={location}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4">
        <div className="h-px mb-3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="flex items-center gap-2">
          <Circle className="h-1.5 w-1.5 fill-brand-profit text-brand-profit" />
          <span className="font-mono text-[10px] text-gray-500 tracking-wide">v0.9.0</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-brand-card border border-white/10 transition-colors hover:border-white/20"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-gray-300" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 border-r border-white/[0.06] bg-brand-bg flex flex-col md:hidden',
          'transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/[0.06] bg-brand-bg flex-col">
        {navContent}
      </aside>
    </>
  );
}
