import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Dashboard } from "@/pages/Dashboard";
import { Strategies } from "@/pages/Strategies";
import { StrategyDetail } from "@/pages/StrategyDetail";
import { Chart } from "@/pages/Chart";
import { Bots } from "@/pages/Bots";
import { BotDetail } from "@/pages/BotDetail";
import { Backtest } from "@/pages/Backtest";
import { Settings } from "@/pages/Settings";
import { NotFound } from "@/pages/NotFound";
import { Terms } from "@/pages/Terms";
import { Privacy } from "@/pages/Privacy";
import { Cookies } from "@/pages/Cookies";
import { RiskDisclosure } from "@/pages/RiskDisclosure";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CookieBanner } from "@/components/CookieBanner";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { ToastProvider } from "@/components/ui/toast";

// Telegram Mini App
import { lazy, Suspense } from "react";
import { Component, type ReactNode, type ErrorInfo } from "react";
const TelegramLayout = lazy(() => import("@/layouts/TelegramLayout"));
const TgDashboard = lazy(() => import("@/pages/tg/TgDashboard"));
const TgBots = lazy(() => import("@/pages/tg/TgBots"));
const TgBotDetail = lazy(() => import("@/pages/tg/TgBotDetail"));
const TgChart = lazy(() => import("@/pages/tg/TgChart"));
const TgBacktest = lazy(() => import("@/pages/tg/TgBacktest"));
const TgSettings = lazy(() => import("@/pages/tg/TgSettings"));

class TgErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error("TG crash:", e, info);
  }
  render() {
    if (this.state.error)
      return (
        <div
          style={{
            background: "#0d0d1a",
            color: "white",
            minHeight: "100vh",
            padding: 20,
          }}
        >
          <h2 style={{ color: "#FF1744" }}>Mini App Error</h2>
          <p style={{ color: "#999", marginTop: 8 }}>{this.state.error}</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              background: "#FFD700",
              color: "black",
              border: "none",
              borderRadius: 8,
            }}
          >
            Retry
          </button>
        </div>
      );
    return this.props.children;
  }
}

function TgSuspense({ children }: { children: ReactNode }) {
  return (
    <TgErrorBoundary>
      <Suspense
        fallback={
          <div
            style={{
              background: "#0d0d1a",
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FFD700] border-t-transparent" />
          </div>
        }
      >
        {children}
      </Suspense>
    </TgErrorBoundary>
  );
}

// Admin pages
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { AdminUsers } from "@/pages/admin/AdminUsers";
import { AdminRequests } from "@/pages/admin/AdminRequests";
import { AdminInvites } from "@/pages/admin/AdminInvites";
import { AdminBilling } from "@/pages/admin/AdminBilling";
import { AdminLogs } from "@/pages/admin/AdminLogs";
import { AdminAnalytics } from "@/pages/admin/AdminAnalytics";
import { AdminSystem } from "@/pages/admin/AdminSystem";

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
              <Route
                element={
                  <TgSuspense>
                    <TelegramLayout />
                  </TgSuspense>
                }
              >
                <Route
                  path="/tg"
                  element={
                    <TgSuspense>
                      <TgDashboard />
                    </TgSuspense>
                  }
                />
                <Route
                  path="/tg/bots"
                  element={
                    <TgSuspense>
                      <TgBots />
                    </TgSuspense>
                  }
                />
                <Route
                  path="/tg/bots/:id"
                  element={
                    <TgSuspense>
                      <TgBotDetail />
                    </TgSuspense>
                  }
                />
                <Route
                  path="/tg/chart"
                  element={
                    <TgSuspense>
                      <TgChart />
                    </TgSuspense>
                  }
                />
                <Route
                  path="/tg/backtest"
                  element={
                    <TgSuspense>
                      <TgBacktest />
                    </TgSuspense>
                  }
                />
                <Route
                  path="/tg/settings"
                  element={
                    <TgSuspense>
                      <TgSettings />
                    </TgSuspense>
                  }
                />
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
