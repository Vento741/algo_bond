import { Link } from 'react-router-dom';
import { Brain, Zap, FlaskConical, ArrowRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: Brain,
    title: 'ML Стратегии',
    description:
      'Lorentzian KNN и другие алгоритмы машинного обучения для поиска точек входа с высокой вероятностью.',
  },
  {
    icon: Zap,
    title: 'Live Торговля',
    description:
      'Автоматическое исполнение сделок на Bybit. Боты работают 24/7 без вашего участия.',
  },
  {
    icon: FlaskConical,
    title: 'Бэктестинг',
    description:
      'Проверьте стратегию на исторических данных перед запуском. Детальная статистика и метрики.',
  },
];

const stats = [
  { value: '+710%', label: 'Результат RIVERUSDT', sublabel: 'Lorentzian KNN v1' },
  { value: '24/7', label: 'Автоторговля', sublabel: 'Без простоев' },
  { value: '0.05%', label: 'Комиссия', sublabel: 'Минимальная на рынке' },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-brand-bg text-white overflow-hidden">
      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-16 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-premium/10">
            <TrendingUp className="h-5 w-5 text-brand-premium" />
          </div>
          <span className="text-xl font-bold tracking-tight">AlgoBond</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-gray-300">
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

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-20 pb-32 lg:pt-32 lg:pb-40">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
          {/* Gradient orbs */}
          <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-brand-premium/5 blur-[150px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-brand-premium/20 bg-brand-premium/5 text-brand-premium text-sm font-medium">
            <Zap className="h-3.5 w-3.5" />
            Lorentzian KNN — +710% на RIVERUSDT
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">
            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Алгоритмическая
            </span>
            <br />
            <span className="bg-gradient-to-r from-brand-premium via-yellow-300 to-brand-premium bg-clip-text text-transparent">
              торговля
            </span>{' '}
            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              нового поколения
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Торгуйте криптофьючерсами на Bybit с помощью ML-стратегий.
            Автоматические боты, бэктестинг, и полный контроль рисков.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register">
              <Button
                variant="premium"
                size="xl"
                className="group"
              >
                Начать бесплатно
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="xl" className="border-gray-700 text-gray-300">
                Войти в аккаунт
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 px-6 lg:px-16 -mt-10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="relative rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-6 text-center"
            >
              <div className="font-mono text-4xl font-bold text-brand-premium mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-white font-medium">{stat.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.sublabel}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 lg:px-16 py-28">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Все инструменты в одной платформе
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              От исследования стратегий до реальной торговли на бирже
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-8 transition-all hover:border-brand-premium/20 hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-brand-premium/10 mb-5 transition-colors group-hover:bg-brand-premium/20">
                  <feature.icon className="h-6 w-6 text-brand-premium" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 lg:px-16 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <TrendingUp className="h-4 w-4" />
            <span>AlgoBond</span>
          </div>
          <div className="text-xs text-gray-600">
            Торговля криптовалютами связана с рисками. Прошлые результаты не гарантируют будущую доходность.
          </div>
        </div>
      </footer>
    </div>
  );
}
