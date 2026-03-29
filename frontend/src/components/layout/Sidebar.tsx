import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Brain,
  Bot,
  FlaskConical,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Стратегии', href: '/strategies', icon: Brain },
  { name: 'Боты', href: '/bots', icon: Bot },
  { name: 'Бэктест', href: '/backtest', icon: FlaskConical },
  { name: 'Настройки', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-brand-bg flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10">
          <TrendingUp className="h-5 w-5 text-brand-premium" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">
          AlgoBond
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            location.pathname === item.href ||
            (item.href !== '/dashboard' &&
              location.pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-premium/10 text-brand-premium'
                  : 'text-gray-400 hover:text-white hover:bg-white/5',
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-border">
        <div className="text-xs text-gray-500 font-mono">v0.1.0</div>
      </div>
    </aside>
  );
}
