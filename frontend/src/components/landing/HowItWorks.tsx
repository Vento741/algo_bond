import { FadeUp } from '@/components/landing/FadeUp';

const steps = [
  {
    num: 1,
    title: 'Запросите доступ',
    description:
      'Оставьте заявку с вашим Telegram. Мы отправим персональный инвайт-код.',
  },
  {
    num: 2,
    title: 'Настройте стратегию',
    description:
      'Выберите ML-стратегию, задайте параметры и протестируйте на истории.',
  },
  {
    num: 3,
    title: 'Запустите бота',
    description:
      'Подключите API Bybit и запустите автоматическую торговлю. Мониторинг 24/7.',
  },
];

export function HowItWorks() {
  return (
    <section className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] bg-white/[0.01]">
      <div className="max-w-[1200px] mx-auto">
        {/* Section header */}
        <FadeUp className="mb-16">
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Как начать
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Три шага к автоматической торговле
          </h2>
          <p className="text-[17px] text-gray-400 max-w-[520px]">
            Запуск бота занимает несколько минут после получения доступа.
          </p>
        </FadeUp>

        {/* Steps grid */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* Connector line (desktop only) */}
          <div
            className="hidden md:block absolute top-[36px] left-[16.67%] right-[16.67%] h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,215,0,0.3), rgba(255,215,0,0.3), transparent)',
            }}
          />

          {steps.map((step, i) => (
            <FadeUp
              key={step.num}
              className="text-center px-8 relative"
              delay={0.1 + i * 0.1}
            >
              {/* Step number circle */}
              <div className="inline-flex items-center justify-center w-[72px] h-[72px] rounded-full bg-brand-premium/[0.08] border border-brand-premium/20 mb-8 relative z-10">
                <span className="font-heading text-[28px] font-bold text-brand-premium">
                  {step.num}
                </span>
              </div>

              {/* Mobile connector (vertical dashed line between steps) */}
              {i < steps.length - 1 && (
                <div className="md:hidden w-px h-8 mx-auto border-l border-dashed border-brand-premium/20 mb-4" />
              )}

              <h3 className="font-heading text-lg font-semibold text-white mb-3">
                {step.title}
              </h3>
              <p className="text-[15px] text-gray-400 leading-[1.7]">
                {step.description}
              </p>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
