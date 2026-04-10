import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, WifiOff, Wallet } from 'lucide-react';
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
    <header className="sticky top-0 z-30 h-16 bg-brand-bg/80 backdrop-blur-md border-b border-transparent"
      style={{
        borderImage: 'linear-gradient(to right, transparent, rgba(68, 136, 255, 0.15), rgba(255, 255, 255, 0.06), transparent) 1',
      }}
    >
      <div className="flex items-center justify-between h-full px-3 sm:px-6">
        {/* Left: mobile spacer */}
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <div className="w-10 md:hidden" />
        </div>

        {/* Right: balance + WS status + notifications + user + logout */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Bybit balance */}
          {(balance || balanceLoading) && (
            <div
              className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg border border-white/[0.06]"
              style={{
                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.8) 0%, rgba(26, 26, 46, 0.4) 100%)',
              }}
              title={
                balance
                  ? `${balance.account_label}${balance.is_demo ? ' (Demo)' : ''}\nAvailable: $${formatBalance(balance.available)}\nUnrealized PnL: $${formatBalance(balance.unrealized_pnl)}`
                  : 'Loading balance...'
              }
            >
              <Wallet className="h-3.5 w-3.5 text-brand-accent" />
              {balanceLoading && !balance ? (
                <span className="text-xs text-gray-500 font-mono">---</span>
              ) : balance ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-mono font-semibold tracking-tight ${
                      balance.equity >= 0 ? 'text-white' : 'text-brand-loss'
                    }`}
                  >
                    ${formatBalance(balance.equity)}
                  </span>
                  {balance.unrealized_pnl !== 0 && (
                    <span
                      className={`text-[11px] font-mono font-medium ${
                        balance.unrealized_pnl >= 0 ? 'text-brand-profit' : 'text-brand-loss'
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
            title={wsConnected ? 'WebSocket подключен' : 'Нет соединения'}
          >
            {wsConnected ? (
              <span className="relative flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand-profit/60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-profit" />
                </span>
                <span className="hidden sm:inline text-[11px] font-medium text-brand-profit tracking-wide">
                  Live
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <WifiOff className="h-3.5 w-3.5 text-gray-600" />
                <span className="hidden sm:inline text-[11px] text-gray-600">
                  Offline
                </span>
              </span>
            )}
          </div>

          {/* Notification bell */}
          <NotificationBell />

          {/* User */}
          <div className="flex items-center gap-2 text-sm">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{
                background: 'linear-gradient(135deg, rgba(68, 136, 255, 0.15) 0%, rgba(68, 136, 255, 0.05) 100%)',
                boxShadow: '0 0 0 1px rgba(68, 136, 255, 0.2)',
              }}
            >
              <UserIcon className="h-4 w-4 text-brand-accent" />
            </div>
            <span className="text-gray-200 font-medium hidden sm:inline">
              {user?.username || user?.email || '...'}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Выйти"
            aria-label="Выйти"
            className="text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] h-9 w-9 min-h-[44px] min-w-[44px] transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
