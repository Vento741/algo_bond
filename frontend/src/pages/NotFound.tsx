import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#0d0d1a] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background image - responsive */}
      <picture className="absolute inset-0 z-0">
        <source media="(min-width: 768px)" srcSet="/errors/404-desktop.webp" />
        <img
          src="/errors/404-mobile.webp"
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

      {/* Floating golden particles */}
      <div className="absolute inset-0 z-[3] pointer-events-none">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              width: `${1.5 + Math.random() * 3}px`,
              height: `${1.5 + Math.random() * 3}px`,
              left: `${15 + Math.random() * 70}%`,
              top: `${15 + Math.random() * 70}%`,
              backgroundColor: `rgba(255, 215, 0, ${0.15 + Math.random() * 0.3})`,
              boxShadow: `0 0 ${4 + Math.random() * 8}px rgba(255, 215, 0, 0.2)`,
              animationDuration: `${2 + Math.random() * 5}s`,
              animationDelay: `${Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-lg px-4 sm:px-6">
        {/* 404 code */}
        <h1 className="text-[100px] xs:text-[120px] sm:text-[150px] md:text-[180px] font-bold leading-none font-data bg-gradient-to-b from-brand-premium via-brand-premium/80 to-brand-premium/10 bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(255,215,0,0.3)]">
          404
        </h1>

        {/* Title */}
        <h2 className="mt-2 sm:mt-3 text-2xl sm:text-3xl md:text-4xl font-heading font-bold text-white drop-shadow-[0_2px_20px_rgba(0,0,0,1)]">
          Ордер не найден
        </h2>

        {/* Subtitle */}
        <p className="mt-3 sm:mt-4 text-gray-200 text-lg sm:text-xl drop-shadow-[0_2px_10px_rgba(0,0,0,1)]">
          Эта страница ушла в ликвидацию
        </p>
        <p className="mt-2 text-gray-400 text-sm sm:text-base drop-shadow-[0_1px_8px_rgba(0,0,0,1)]">
          Похоже, маркет-мейкеры забрали эту страницу раньше вас
        </p>

        {/* Divider */}
        <div className="mt-6 w-24 h-px bg-gradient-to-r from-transparent via-brand-premium/40 to-transparent" />

        {/* Buttons */}
        <div className="mt-6 sm:mt-8 flex flex-col xs:flex-row items-center gap-3 w-full xs:w-auto">
          <Button
            variant="premium"
            onClick={() => navigate("/")}
            className="w-full xs:w-auto gap-2 px-8 py-3 text-base shadow-[0_0_30px_rgba(255,215,0,0.2)] active:scale-[0.97] transition-all"
          >
            <Home className="h-5 w-5" />
            На главную
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="w-full xs:w-auto gap-2 px-8 py-3 text-base border-white/15 bg-black/40 backdrop-blur-md text-gray-200 hover:text-white hover:bg-white/10 active:scale-[0.97] transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
            Назад
          </Button>
        </div>

        {/* Logo footer */}
        <div className="mt-10 sm:mt-14 flex items-center gap-2 opacity-30">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          <span className="text-sm text-gray-500 font-heading">AlgoBond</span>
        </div>
      </div>
    </div>
  );
}
