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
      {/* Background image - responsive */}
      <picture className="absolute inset-0 z-0">
        <source media="(min-width: 768px)" srcSet="/errors/500-desktop.webp" />
        <img
          src="/errors/500-mobile.webp"
          alt=""
          className="w-full h-full object-cover object-center opacity-50"
          loading="eager"
        />
      </picture>

      {/* Heavy vignette - dark edges, only center glows */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 50% 45% at center, transparent 0%, rgba(13,13,26,0.3) 30%, rgba(13,13,26,0.75) 50%, rgba(13,13,26,0.95) 70%, #0d0d1a 100%)",
        }}
      />

      {/* Extra corner darkening */}
      <div
        className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0d0d1a] via-transparent to-[#0d0d1a]"
        style={{ opacity: 0.6 }}
      />
      <div
        className="absolute inset-0 z-[1] bg-gradient-to-r from-[#0d0d1a] via-transparent to-[#0d0d1a]"
        style={{ opacity: 0.7 }}
      />

      {/* Red scanlines */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,23,68,0.4) 2px, rgba(255,23,68,0.4) 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* Glitch flicker */}
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
              left: `${15 + Math.random() * 70}%`,
              top: `${15 + Math.random() * 70}%`,
              animationDuration: `${2 + Math.random() * 4}s`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-lg px-4 sm:px-6">
        {/* 500 code */}
        <h1
          className={`text-[100px] xs:text-[120px] sm:text-[150px] md:text-[180px] font-bold leading-none bg-gradient-to-b from-red-500 via-red-500/70 to-red-500/10 bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(255,23,68,0.3)] transition-transform ${glitch ? "translate-x-[2px] skew-x-1" : ""}`}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          500
        </h1>

        {/* Title */}
        <h2
          className="mt-2 sm:mt-3 text-2xl sm:text-3xl md:text-4xl font-bold text-white drop-shadow-[0_2px_20px_rgba(0,0,0,1)]"
          style={{ fontFamily: "'Tektur', sans-serif" }}
        >
          Маржин-колл серверу
        </h2>

        {/* Subtitle */}
        <p className="mt-3 sm:mt-4 text-gray-200 text-lg sm:text-xl drop-shadow-[0_2px_10px_rgba(0,0,0,1)]">
          Что-то пошло не так. Мы уже разбираемся.
        </p>
        <p className="mt-2 text-gray-400 text-sm sm:text-base drop-shadow-[0_1px_8px_rgba(0,0,0,1)]">
          Сервер попал в стоп-лосс, но скоро вернётся в рынок
        </p>

        {/* Divider */}
        <div className="mt-6 w-24 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />

        {/* Buttons */}
        <div className="mt-6 sm:mt-8 flex flex-col xs:flex-row items-center gap-3 w-full xs:w-auto">
          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full xs:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 text-base rounded-lg bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-semibold hover:opacity-90 active:scale-[0.97] transition-all shadow-[0_0_30px_rgba(255,215,0,0.2)]"
            >
              <RefreshCw className="h-5 w-5" />
              Попробовать снова
            </button>
          )}
          <a
            href="/"
            className="w-full xs:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 text-base rounded-lg border border-white/15 bg-black/40 backdrop-blur-md text-gray-200 font-medium hover:text-white hover:bg-white/10 active:scale-[0.97] transition-all"
          >
            <Home className="h-5 w-5" />
            На главную
          </a>
        </div>

        {/* Logo footer */}
        <div className="mt-10 sm:mt-14 flex items-center gap-2 opacity-30">
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
