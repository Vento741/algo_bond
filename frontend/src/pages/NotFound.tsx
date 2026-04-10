import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-[100dvh] bg-brand-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background image - responsive */}
      <picture className="absolute inset-0 z-0">
        <source media="(min-width: 768px)" srcSet="/errors/404-desktop.webp" />
        <img
          src="/errors/404-mobile.webp"
          alt=""
          className="w-full h-full object-cover object-center"
          loading="eager"
        />
      </picture>

      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0d0d1a]/50 via-[#0d0d1a]/30 to-[#0d0d1a]/70" />

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 25%, rgba(13,13,26,0.6) 60%, rgba(13,13,26,0.95) 100%)",
        }}
      />

      {/* Floating golden particles */}
      <div className="absolute inset-0 z-[3] pointer-events-none">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              width: `${1.5 + Math.random() * 3}px`,
              height: `${1.5 + Math.random() * 3}px`,
              left: `${5 + Math.random() * 90}%`,
              top: `${5 + Math.random() * 90}%`,
              backgroundColor: `rgba(255, 215, 0, ${0.15 + Math.random() * 0.3})`,
              boxShadow: `0 0 ${4 + Math.random() * 8}px rgba(255, 215, 0, 0.2)`,
              animationDuration: `${2 + Math.random() * 5}s`,
              animationDelay: `${Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Subtle golden light rays from center */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none opacity-[0.04]"
        style={{
          background:
            "conic-gradient(from 0deg at 50% 45%, transparent 0deg, rgba(255,215,0,0.5) 10deg, transparent 20deg, transparent 40deg, rgba(255,215,0,0.3) 50deg, transparent 60deg, transparent 90deg, rgba(255,215,0,0.4) 100deg, transparent 110deg, transparent 150deg, rgba(255,215,0,0.3) 160deg, transparent 170deg, transparent 200deg, rgba(255,215,0,0.5) 210deg, transparent 220deg, transparent 270deg, rgba(255,215,0,0.3) 280deg, transparent 290deg, transparent 330deg, rgba(255,215,0,0.4) 340deg, transparent 350deg)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-md px-4 sm:px-6">
        {/* 404 code */}
        <h1 className="text-[80px] xs:text-[100px] sm:text-[120px] md:text-[140px] font-bold leading-none font-data bg-gradient-to-b from-brand-premium to-brand-premium/20 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(255,215,0,0.25)]">
          404
        </h1>

        {/* Title */}
        <h2 className="mt-1 sm:mt-2 text-xl sm:text-2xl font-heading font-semibold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
          Ордер не найден
        </h2>

        {/* Subtitle */}
        <p className="mt-2 sm:mt-3 text-gray-300/90 text-base sm:text-lg drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
          Эта страница ушла в ликвидацию
        </p>
        <p className="mt-1 text-gray-400/80 text-xs sm:text-sm drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          Похоже, маркет-мейкеры забрали эту страницу раньше вас
        </p>

        {/* Buttons */}
        <div className="mt-6 sm:mt-8 flex flex-col xs:flex-row items-center gap-3 w-full xs:w-auto">
          <Button
            variant="premium"
            onClick={() => navigate("/")}
            className="w-full xs:w-auto gap-2 py-3 sm:py-2.5 shadow-[0_0_20px_rgba(255,215,0,0.15)] active:scale-[0.97] transition-all"
          >
            <Home className="h-4 w-4" />
            На главную
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="w-full xs:w-auto gap-2 py-3 sm:py-2.5 border-white/10 bg-black/30 backdrop-blur-sm text-gray-300 hover:text-white hover:bg-white/10 active:scale-[0.97] transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
        </div>

        {/* Logo footer */}
        <div className="mt-8 sm:mt-12 flex items-center gap-2 opacity-40">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          <span className="text-sm text-gray-500 font-heading">AlgoBond</span>
        </div>
      </div>
    </div>
  );
}
