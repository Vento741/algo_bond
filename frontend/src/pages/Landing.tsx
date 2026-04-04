import { Link } from 'react-router-dom';
import { Brain, Zap, FlaskConical, ArrowRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: Brain,
    title: 'ML Стратегии',
    description:
      'Lorentzian KNN анализирует 4 фичи на каждом баре. Не угадывает\u00A0\u2014 вычисляет.',
  },
  {
    icon: Zap,
    title: 'Live Торговля',
    description:
      'Бот получает сигнал через WebSocket, выставляет TP/SL и следит за позицией. Вы\u00A0\u2014 наблюдаете.',
  },
  {
    icon: FlaskConical,
    title: 'Бэктестинг',
    description:
      'Прогоните стратегию по истории. Увидите каждую сделку, просадку и equity\u00A0curve.',
  },
];

const stats = [
  { value: '+710%', label: 'Результат на RIVER', sublabel: 'Lorentzian KNN, 15m TF' },
  { value: '24/7', label: 'Роботы не спят', sublabel: 'Полная автоматизация' },
  { value: '< 1 сек', label: 'Реакция на сигнал', sublabel: 'WebSocket триггер' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Landing() {
  return (
    <div className="min-h-screen bg-brand-bg text-white overflow-hidden">
      {/* -------- Nav -------- */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-5 lg:px-16 py-4 bg-brand-bg/70 backdrop-blur-lg border-b border-white/5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="AlgoBond - Главная">
          <img
            src="/logo.webp"
            alt=""
            className="w-9 h-9 rounded-lg"
            width={36}
            height={36}
          />
          <span className="font-heading text-xl font-bold tracking-tight">AlgoBond</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
              Войти
            </Button>
          </Link>
          <Link to="/register">
            <Button variant="premium" size="sm">
              Регистрация
            </Button>
          </Link>
        </div>
      </nav>

      {/* -------- Hero -------- */}
      <section className="relative flex flex-col items-center justify-center min-h-[100svh] px-5 pt-24 pb-20 lg:pt-0 lg:pb-0">
        {/* Background image — responsive picture */}
        <picture className="absolute inset-0 w-full h-full">
          <source media="(min-width: 768px)" srcSet="/hero-desktop.webp" />
          <img
            src="/hero-mobile.webp"
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        </picture>

        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-brand-bg/55" />
        {/* Bottom gradient fade into bg */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand-bg to-transparent" />

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div
            className="animate-fade-up"
            style={{ animationDelay: '0.1s' }}
          >
            <Badge
              variant="premium"
              className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full text-sm"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              +710% RIVERUSDT — проверено на истории
            </Badge>
          </div>

          {/* Title */}
          <h1
            className="font-heading text-4xl sm:text-5xl lg:text-7xl font-bold leading-[1.1] mb-6 animate-fade-up"
            style={{ animationDelay: '0.25s' }}
          >
            <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              Пока рынок спит
            </span>
            <br />
            <span className="bg-gradient-to-r from-brand-premium via-yellow-300 to-brand-premium bg-clip-text text-transparent">
              твои алгоритмы
            </span>{' '}
            <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              работают
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-base sm:text-lg lg:text-xl text-gray-300 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up"
            style={{ animationDelay: '0.4s' }}
          >
            ML-стратегии, бэктестинг на истории, автоматические боты на&nbsp;Bybit.
            Никаких иллюзий&nbsp;&mdash; только данные, код и&nbsp;дисциплина.
          </p>

          {/* CTA */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up"
            style={{ animationDelay: '0.55s' }}
          >
            <Link to="/register">
              <Button
                variant="premium"
                size="xl"
                className="group animate-glow-pulse"
              >
                Начать бесплатно
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="xl" className="border-white/10 text-gray-200 hover:bg-white/5">
                Войти в аккаунт
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* -------- Stats -------- */}
      <section className="relative z-10 px-5 lg:px-16 -mt-12 sm:-mt-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="relative rounded-2xl border border-white/[0.06] bg-brand-card/60 backdrop-blur-xl p-6 text-center transition-all hover:border-brand-premium/20 hover:bg-brand-card/80 animate-fade-up"
              style={{ animationDelay: `${0.7 + i * 0.12}s` }}
            >
              <div className="font-data text-4xl font-bold text-brand-premium mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-white font-medium">{stat.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{stat.sublabel}</div>
            </div>
          ))}
        </div>
      </section>

      {/* -------- Features -------- */}
      <section className="relative z-10 px-5 lg:px-16 py-24 lg:py-32">
        <div className="max-w-5xl mx-auto">
          <div
            className="text-center mb-14 animate-fade-up"
            style={{ animationDelay: '0.15s' }}
          >
            <h2 className="font-heading text-3xl sm:text-4xl font-bold mb-4">
              Все инструменты&nbsp;&mdash; одна платформа
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              От исследования стратегий до реальной торговли на бирже
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-8 transition-all duration-300 hover:border-brand-premium/25 hover:bg-white/[0.05] hover:shadow-[0_0_40px_-12px_rgba(255,215,0,0.12)] animate-fade-up"
                style={{ animationDelay: `${0.25 + i * 0.15}s` }}
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-brand-premium/10 mb-6 transition-colors duration-300 group-hover:bg-brand-premium/20">
                  <feature.icon className="h-6 w-6 text-brand-premium" />
                </div>
                <h3 className="font-heading text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------- Footer -------- */}
      <footer className="relative z-10 border-t border-white/5 px-5 lg:px-16 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <img
              src="/logo.webp"
              alt=""
              className="w-4 h-4 rounded-sm"
              width={16}
              height={16}
            />
            <span>AlgoBond</span>
          </div>
          <p className="text-xs text-gray-600 text-center sm:text-right max-w-lg">
            Торговля криптофьючерсами&nbsp;&mdash; это риск. Прошлые результаты&nbsp;&ne; гарантия будущих. Мы даём инструменты, решения&nbsp;&mdash; ваши.
          </p>
        </div>
      </footer>
    </div>
  );
}
