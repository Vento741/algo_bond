import { Send, SlidersHorizontal, Rocket } from 'lucide-react';
import { FadeUp } from '@/components/landing/FadeUp';

const steps = [
  {
    num: 1,
    icon: Send,
    title: 'Запросите доступ',
    description:
      'Оставьте заявку с вашим Telegram. Мы отправим персональный инвайт-код.',
  },
  {
    num: 2,
    icon: SlidersHorizontal,
    title: 'Настройте стратегию',
    description:
      'Выберите ML-стратегию, задайте параметры и протестируйте на истории.',
  },
  {
    num: 3,
    icon: Rocket,
    title: 'Запустите бота',
    description:
      'Подключите API Bybit и запустите автоматическую торговлю. Мониторинг 24/7.',
  },
];

export function HowItWorks() {
  return (
    <section className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px]">
      <div className="max-w-[1200px] mx-auto">
        {/* Section header */}
        <FadeUp className="text-center mb-16 lg:mb-20">
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Как начать
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Три шага к автоматической торговле
          </h2>
          <p className="text-[17px] text-gray-400 max-w-[520px] mx-auto">
            Запуск бота занимает несколько минут после получения доступа.
          </p>
        </FadeUp>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((step, i) => (
            <FadeUp key={step.num} delay={0.1 + i * 0.12}>
              <div className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 lg:p-10 transition-all duration-300 hover:border-brand-premium/20 hover:bg-white/[0.04]">
                {/* Step number tag */}
                <div className="absolute top-6 right-6 font-data text-xs text-gray-600 tracking-wider">
                  0{step.num}
                </div>

                {/* Icon */}
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-brand-premium/[0.08] border border-brand-premium/15 mb-7 transition-colors duration-300 group-hover:bg-brand-premium/[0.14]">
                  <step.icon className="h-6 w-6 text-brand-premium" />
                </div>

                {/* Content */}
                <h3 className="font-heading text-[18px] font-semibold text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-[15px] text-gray-400 leading-[1.7]">
                  {step.description}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
