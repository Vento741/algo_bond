import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, Bell, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useTradingStore } from '@/stores/trading';
import { Button } from '@/components/ui/button';

export function Topbar() {
  const { user, logout } = useAuthStore();
  const wsConnected = useTradingStore((s) => s.isConnected);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-brand-bg/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: mobile spacer + breadcrumb area */}
        <div className="flex items-center gap-3 text-sm text-gray-400">
          {/* spacer for mobile hamburger */}
          <div className="w-10 md:hidden" />
        </div>

        {/* Right: WS status + notifications + user + logout */}
        <div className="flex items-center gap-4">
          {/* WebSocket connection indicator */}
          <div
            className="flex items-center gap-1.5"
            title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
          >
            {wsConnected ? (
              <Wifi className="h-3.5 w-3.5 text-brand-profit" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-gray-600" />
            )}
            <span
              className={`hidden sm:inline text-xs ${
                wsConnected ? 'text-brand-profit' : 'text-gray-600'
              }`}
            >
              {wsConnected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Notification bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-400 hover:text-white h-8 w-8"
          >
            <Bell className="h-4 w-4" />
          </Button>

          {/* User */}
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-premium/10">
              <UserIcon className="h-4 w-4 text-brand-premium" />
            </div>
            <span className="text-gray-300 hidden sm:inline">
              {user?.username || user?.email || '...'}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-gray-400 hover:text-white h-8 w-8"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
