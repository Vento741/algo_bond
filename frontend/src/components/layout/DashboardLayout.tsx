import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <Sidebar />
      {/* ml-0 on mobile (sidebar is overlay), ml-64 on desktop */}
      <div className="md:ml-64">
        <Topbar />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
