import { useNavigate } from 'react-router-dom';
import { TrendingDown, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-brand-premium/5 blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Icon */}
        <div className="mb-6 p-4 rounded-2xl bg-brand-loss/10 border border-brand-loss/20">
          <TrendingDown className="h-12 w-12 text-brand-loss" />
        </div>

        {/* 404 code */}
        <h1
          className="text-[120px] font-bold leading-none font-data bg-gradient-to-b from-brand-premium to-brand-premium/40 bg-clip-text text-transparent"
        >
          404
        </h1>

        {/* Title */}
        <h2 className="mt-2 text-2xl font-heading font-semibold text-white">
          Ордер не найден
        </h2>

        {/* Subtitle */}
        <p className="mt-3 text-gray-400 text-lg">
          Эта страница ушла в ликвидацию
        </p>
        <p className="mt-1 text-gray-500 text-sm">
          Похоже, маркет-мейкеры забрали эту страницу раньше вас
        </p>

        {/* Falling candle ASCII art */}
        <pre className="mt-6 text-brand-loss/60 text-xs font-mono leading-tight select-none">
{`     |
     |
   __|__
  |     |
  |     |
  |     |
  |_____|
     |
     |
     |
     |
     |`}
        </pre>

        {/* Buttons */}
        <div className="mt-8 flex items-center gap-3">
          <Button
            variant="premium"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            На главную
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2 border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
        </div>

        {/* Logo footer */}
        <div className="mt-12 flex items-center gap-2 opacity-40">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          <span className="text-sm text-gray-500 font-heading">AlgoBond</span>
        </div>
      </div>
    </div>
  );
}
