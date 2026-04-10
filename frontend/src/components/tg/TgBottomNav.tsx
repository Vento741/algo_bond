/**
 * Нижняя навигация для Telegram Mini App
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, TrendingUp, FlaskConical, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tab {
  path: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const TABS: Tab[] = [
  { path: '/tg', label: 'Home', icon: LayoutDashboard, exact: true },
  { path: '/tg/bots', label: 'Bots', icon: Bot },
  { path: '/tg/chart', label: 'Chart', icon: TrendingUp },
  { path: '/tg/backtest', label: 'Test', icon: FlaskConical },
  { path: '/tg/settings', label: 'Set', icon: Settings },
];

export function TgBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (tab: Tab) =>
    tab.exact ? pathname === tab.path : pathname.startsWith(tab.path);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/10 bg-[#0d0d1a]/95 backdrop-blur-sm">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors min-h-[56px]',
              active ? 'text-[#FFD700]' : 'text-gray-500 hover:text-gray-300',
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
