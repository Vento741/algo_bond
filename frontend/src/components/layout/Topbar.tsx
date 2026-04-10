import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, Wifi, WifiOff, Wallet } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAuthStore } from '@/stores/auth';
import { useTradingStore } from '@/stores/trading';
import { useBalance } from '@/hooks/useBalance';
import { Button } from '@/components/ui/button';

export function Topbar() {
  const { user, logout } = useAuthStore();
  const wsConnected = useTradingStore((s) => s.isConnected);
  const { balance, isLoading: balanceLoading } = useBalance();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /** Форматирование баланса: $1,234.56 */
  const formatBalance = (value: number): string => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-brand-bg/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: mobile spacer + breadcrumb area */}
        <div className="flex items-center gap-3 text-sm text-gray-400">
          {/* spacer for mobile hamburger */}
          <div className="w-10 md:hidden" />
        </div>

        {/* Right: balance + WS status + notifications + user + logout */}
        <div className="flex items-center gap-4">
          {/* Bybit balance */}
          {(balance || balanceLoading) && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-card/60 border border-border"
              title={
                balance
                  ? `${balance.account_label}${balance.is_demo ? ' (Demo)' : ''}\nAvailable: $${formatBalance(balance.available)}\nUnrealized PnL: $${formatBalance(balance.unrealized_pnl)}`
                  : 'Loading balance...'
              }
            >
              <Wallet className="h-3.5 w-3.5 text-brand-premium" />
              {balanceLoading && !balance ? (
                <span className="text-xs text-gray-500 font-mono">---</span>
              ) : balance ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-sm font-mono font-medium ${
                      balance.equity >= 0 ? 'text-brand-profit' : 'text-brand-loss'
                    }`}
                  >
                    ${formatBalance(balance.equity)}
                  </span>
                  {balance.unrealized_pnl !== 0 && (
                    <span
                      className={`text-[10px] font-mono ${
                        balance.unrealized_pnl >= 0 ? 'text-brand-profit/70' : 'text-brand-loss/70'
                      }`}
                    >
                      {balance.unrealized_pnl >= 0 ? '+' : ''}
                      {formatBalance(balance.unrealized_pnl)}
                    </span>
                  )}
                  {balance.is_demo && (
                    <span className="text-[9px] uppercase tracking-wider text-brand-premium/60 font-medium">
                      demo
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          )}

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
          <NotificationBell />

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
