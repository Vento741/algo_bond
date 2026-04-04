import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ServerErrorProps {
  onRetry?: () => void;
}

export function ServerError({ onRetry }: ServerErrorProps) {
  return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-red-500/5 blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Icon */}
        <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="h-12 w-12 text-red-500" />
        </div>

        {/* 500 code */}
        <h1
          className="text-[120px] font-bold leading-none bg-gradient-to-b from-red-500 to-red-500/40 bg-clip-text text-transparent"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          500
        </h1>

        {/* Title */}
        <h2 className="mt-2 text-2xl font-semibold text-white" style={{ fontFamily: "'Jiro', sans-serif" }}>
          Маржин-колл серверу
        </h2>

        {/* Subtitle */}
        <p className="mt-3 text-gray-400 text-lg">
          Что-то пошло не так. Мы уже разбираемся.
        </p>
        <p className="mt-1 text-gray-500 text-sm">
          Сервер попал в стоп-лосс, но скоро вернётся в рынок
        </p>

        {/* Broken chart ASCII art */}
        <pre className="mt-6 text-red-500/50 text-xs font-mono leading-tight select-none">
{`  ___
 |   |
 |   |___
 |       |  ___
 |       | |   |
 |       | |   |
 |       |_|   |
 |             |  X
 |             |/
 |              \\
 |               \\___`}
        </pre>

        {/* Buttons - using native elements, NOT React Router */}
        <div className="mt-8 flex items-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-4 w-4" />
              Попробовать снова
            </button>
          )}
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-white/10 text-gray-300 font-medium text-sm hover:text-white hover:bg-white/5 transition-colors"
          >
            <Home className="h-4 w-4" />
            На главную
          </a>
        </div>

        {/* Logo footer */}
        <div className="mt-12 flex items-center gap-2 opacity-40">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          <span className="text-sm text-gray-500" style={{ fontFamily: "'Jiro', sans-serif" }}>AlgoBond</span>
        </div>
      </div>
    </div>
  );
}
