import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { Dashboard } from '@/pages/Dashboard';
import { Strategies } from '@/pages/Strategies';
import { StrategyDetail } from '@/pages/StrategyDetail';
import { Chart } from '@/pages/Chart';
import { Bots } from '@/pages/Bots';
import { BotDetail } from '@/pages/BotDetail';
import { Backtest } from '@/pages/Backtest';
import { Settings } from '@/pages/Settings';
import { NotFound } from '@/pages/NotFound';
import { Terms } from '@/pages/Terms';
import { Privacy } from '@/pages/Privacy';
import { Cookies } from '@/pages/Cookies';
import { RiskDisclosure } from '@/pages/RiskDisclosure';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminRoute } from '@/components/AdminRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CookieBanner } from '@/components/CookieBanner';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import { ToastProvider } from '@/components/ui/toast';

// Telegram Mini App
import TelegramLayout from '@/layouts/TelegramLayout';
import TgDashboard from '@/pages/tg/TgDashboard';
import TgBots from '@/pages/tg/TgBots';
import TgBotDetail from '@/pages/tg/TgBotDetail';
import TgChart from '@/pages/tg/TgChart';
import TgBacktest from '@/pages/tg/TgBacktest';
import TgSettings from '@/pages/tg/TgSettings';

// Admin pages
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminUsers } from '@/pages/admin/AdminUsers';
import { AdminRequests } from '@/pages/admin/AdminRequests';
import { AdminInvites } from '@/pages/admin/AdminInvites';
import { AdminBilling } from '@/pages/admin/AdminBilling';
import { AdminLogs } from '@/pages/admin/AdminLogs';
import { AdminAnalytics } from '@/pages/admin/AdminAnalytics';
import { AdminSystem } from '@/pages/admin/AdminSystem';

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AnalyticsProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Legal pages */}
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/risk" element={<RiskDisclosure />} />

            {/* Protected routes with dashboard layout */}
            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/strategies" element={<Strategies />} />
              <Route path="/strategies/:slug" element={<StrategyDetail />} />
              <Route path="/chart/:symbol" element={<Chart />} />
              <Route path="/chart" element={<Chart />} />
              <Route path="/bots" element={<Bots />} />
              <Route path="/bots/:id" element={<BotDetail />} />
              <Route path="/backtest" element={<Backtest />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Admin routes with dashboard layout */}
            <Route
              element={
                <AdminRoute>
                  <DashboardLayout />
                </AdminRoute>
              }
            >
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/analytics" element={<AdminAnalytics />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/requests" element={<AdminRequests />} />
              <Route path="/admin/invites" element={<AdminInvites />} />
              <Route path="/admin/billing" element={<AdminBilling />} />
              <Route path="/admin/logs" element={<AdminLogs />} />
              <Route path="/admin/system" element={<AdminSystem />} />
            </Route>

            {/* Telegram Mini App routes */}
            <Route element={<TelegramLayout />}>
              <Route path="/tg" element={<TgDashboard />} />
              <Route path="/tg/bots" element={<TgBots />} />
              <Route path="/tg/bots/:id" element={<TgBotDetail />} />
              <Route path="/tg/chart" element={<TgChart />} />
              <Route path="/tg/backtest" element={<TgBacktest />} />
              <Route path="/tg/settings" element={<TgSettings />} />
            </Route>

            {/* Fallback - 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <CookieBanner />
          </AnalyticsProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
