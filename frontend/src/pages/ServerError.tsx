import { RefreshCw, Home } from "lucide-react";
import { useEffect, useState } from "react";

interface ServerErrorProps {
  onRetry?: () => void;
}

export function ServerError({ onRetry }: ServerErrorProps) {
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const interval = setInterval(
      () => {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 150 + Math.random() * 200);
      },
      2000 + Math.random() * 3000,
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#0d0d1a] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background image - mobile */}
      <picture className="absolute inset-0 z-0">
        <source media="(min-width: 768px)" srcSet="/errors/500-desktop.webp" />
        <img
          src="/errors/500-mobile.webp"
          alt=""
          className="w-full h-full object-cover object-center"
          loading="eager"
        />
      </picture>

      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0d0d1a]/60 via-[#0d0d1a]/40 to-[#0d0d1a]/80" />

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(13,13,26,0.7) 70%, rgba(13,13,26,0.95) 100%)",
        }}
      />

      {/* Animated red scanlines */}
      <div
        className="absolute inset-0 z-[3] pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,23,68,0.4) 2px, rgba(255,23,68,0.4) 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* Glitch flicker overlay */}
      {glitch && (
        <div className="absolute inset-0 z-[4] pointer-events-none">
          <div
            className="absolute w-full bg-red-500/10"
            style={{
              top: `${Math.random() * 80}%`,
              height: `${2 + Math.random() * 8}%`,
              transform: `translateX(${(Math.random() - 0.5) * 10}px)`,
            }}
          />
          <div
            className="absolute w-full bg-red-500/5"
            style={{
              top: `${Math.random() * 60}%`,
              height: `${1 + Math.random() * 4}%`,
              transform: `translateX(${(Math.random() - 0.5) * 6}px)`,
            }}
          />
        </div>
      )}

      {/* Floating red particles */}
      <div className="absolute inset-0 z-[3] pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-red-500/30 animate-pulse"
            style={{
              width: `${2 + Math.random() * 3}px`,
              height: `${2 + Math.random() * 3}px`,
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
              animationDuration: `${2 + Math.random() * 4}s`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-md px-4 sm:px-6">
        {/* 500 code */}
        <h1
          className={`text-[80px] xs:text-[100px] sm:text-[120px] md:text-[140px] font-bold leading-none bg-gradient-to-b from-red-500 to-red-500/20 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(255,23,68,0.3)] transition-transform ${glitch ? "translate-x-[2px] skew-x-1" : ""}`}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          500
        </h1>

        {/* Title */}
        <h2
          className="mt-1 sm:mt-2 text-xl sm:text-2xl font-semibold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]"
          style={{ fontFamily: "'Tektur', sans-serif" }}
        >
          Маржин-колл серверу
        </h2>

        {/* Subtitle */}
        <p className="mt-2 sm:mt-3 text-gray-300/90 text-base sm:text-lg drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
          Что-то пошло не так. Мы уже разбираемся.
        </p>
        <p className="mt-1 text-gray-400/80 text-xs sm:text-sm drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          Сервер попал в стоп-лосс, но скоро вернётся в рынок
        </p>

        {/* Buttons */}
        <div className="mt-6 sm:mt-8 flex flex-col xs:flex-row items-center gap-3 w-full xs:w-auto">
          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full xs:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-lg bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-semibold text-sm hover:opacity-90 active:scale-[0.97] transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)]"
            >
              <RefreshCw className="h-4 w-4" />
              Попробовать снова
            </button>
          )}
          <a
            href="/"
            className="w-full xs:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-lg border border-white/10 bg-black/30 backdrop-blur-sm text-gray-300 font-medium text-sm hover:text-white hover:bg-white/10 active:scale-[0.97] transition-all"
          >
            <Home className="h-4 w-4" />
            На главную
          </a>
        </div>

        {/* Logo footer */}
        <div className="mt-8 sm:mt-12 flex items-center gap-2 opacity-40">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          <span
            className="text-sm text-gray-500"
            style={{ fontFamily: "'Tektur', sans-serif" }}
          >
            AlgoBond
          </span>
        </div>
      </div>
    </div>
  );
}
