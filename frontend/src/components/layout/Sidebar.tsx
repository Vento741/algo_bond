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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'График', href: '/chart/BTCUSDT', icon: CandlestickChart, matchPrefix: '/chart' },
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
        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-brand-premium/10 text-brand-premium'
          : 'text-gray-400 hover:text-white hover:bg-white/5',
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-brand-premium" />
      )}
      <item.icon className="h-5 w-5 flex-shrink-0" />
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
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
        <img src="/logo.webp" alt="AlgoBond" className="w-9 h-9 rounded-lg" />
        <span className="text-xl font-bold text-white tracking-tight font-heading">
          AlgoBond
        </span>
        {/* Mobile close */}
        <button
          className="ml-auto md:hidden text-gray-400 hover:text-white"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
            <div className="my-3 border-t border-white/10" />
            <span className="block text-xs text-gray-400 px-3 pb-1 uppercase tracking-wider font-medium">
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

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-border">
        <div className="text-xs text-gray-400/60 font-data tracking-wide">v0.9.0</div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-brand-card border border-white/10"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-gray-300" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 border-r border-border bg-brand-bg flex flex-col transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-brand-bg flex-col">
        {navContent}
      </aside>
    </>
  );
}
