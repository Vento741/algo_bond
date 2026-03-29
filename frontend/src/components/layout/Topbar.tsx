import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';

export function Topbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-brand-bg/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: breadcrumb placeholder */}
        <div className="text-sm text-gray-400">
          {/* breadcrumb area */}
        </div>

        {/* Right: user info + logout */}
        <div className="flex items-center gap-4">
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
            className="text-gray-400 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
