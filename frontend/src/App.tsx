import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { Dashboard } from '@/pages/Dashboard';
import { Strategies } from '@/pages/Strategies';
import { StrategyDetail } from '@/pages/StrategyDetail';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

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
          {/* Placeholder routes for future pages */}
          <Route path="/bots" element={<ComingSoon title="Боты" />} />
          <Route path="/backtest" element={<ComingSoon title="Бэктестинг" />} />
          <Route path="/settings" element={<ComingSoon title="Настройки" />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Страница-заглушка для будущих разделов */
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
      <p className="text-gray-400">Этот раздел скоро будет доступен</p>
    </div>
  );
}

export default App;
