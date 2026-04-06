import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Brain,
  FlaskConical,
  Check,
  Crown,
  Infinity,
  Shield,
  Zap,
  Clock,
  HeadphonesIcon,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FadeUp } from '@/components/landing/FadeUp';
import api from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PlanFromAPI {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  max_bots: number;
  max_strategies: number;
  max_backtests_per_day: number;
  features: Record<string, unknown>;
}

interface PlanDisplay {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  maxBots: number;
  maxStrategies: number;
  maxBacktestsPerDay: number;
  features: string[];
  isRecommended: boolean;
}

/* ------------------------------------------------------------------ */
/*  Fallback plans                                                     */
/* ------------------------------------------------------------------ */

const FALLBACK_PLANS: PlanDisplay[] = [
  {
    id: 'starter',
    name: 'Starter',
    slug: 'starter',
    priceMonthly: 0,
    maxBots: 1,
    maxStrategies: 1,
    maxBacktestsPerDay: 5,
    features: [
      'Базовая аналитика',
      'Email-уведомления',
      'Документация и гайды',
    ],
    isRecommended: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    slug: 'pro',
    priceMonthly: 29,
    maxBots: 5,
    maxStrategies: 5,
    maxBacktestsPerDay: 50,
    features: [
      'Расширенная аналитика',
      'Telegram-уведомления',
      'Приоритетная поддержка',
      'Multi-TP и Breakeven',
      'Оптимизация стратегий',
    ],
    isRecommended: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    slug: 'enterprise',
    priceMonthly: 99,
    maxBots: -1,
    maxStrategies: -1,
    maxBacktestsPerDay: -1,
    features: [
      'Все функции Pro',
      'Безлимитные ресурсы',
      'Персональный менеджер',
      'Custom стратегии',
      'API доступ',
      'SLA 99.9%',
    ],
    isRecommended: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapAPIPlan(plan: PlanFromAPI, index: number): PlanDisplay {
  const featureList: string[] = [];
  if (plan.features && typeof plan.features === 'object') {
    Object.entries(plan.features).forEach(([key, value]) => {
      if (typeof value === 'string') {
        featureList.push(value);
      } else if (value === true) {
        featureList.push(key);
      }
    });
  }

  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    priceMonthly: plan.price_monthly,
    maxBots: plan.max_bots,
    maxStrategies: plan.max_strategies,
    maxBacktestsPerDay: plan.max_backtests_per_day,
    features: featureList.length > 0 ? featureList : FALLBACK_PLANS[index]?.features ?? [],
    isRecommended: plan.slug === 'pro' || index === 1,
  };
}

function limitLabel(value: number, singular: string, plural: string): string {
  if (value < 0) return plural;
  if (value === 1) return singular;
  return plural;
}

function scrollToAccessForm(): void {
  document.getElementById('access-request')?.scrollIntoView({
    behavior: 'smooth',
  });
}

/* ------------------------------------------------------------------ */
/*  Limit Row                                                          */
/* ------------------------------------------------------------------ */

interface LimitRowProps {
  icon: React.ElementType;
  value: number;
  singular: string;
  plural: string;
  isRecommended: boolean;
}

function LimitRow({ icon: Icon, value, singular, plural, isRecommended }: LimitRowProps) {
  const isUnlimited = value < 0;

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-lg ${
          isRecommended
            ? 'bg-brand-premium/15'
            : 'bg-white/[0.04]'
        }`}
      >
        {isUnlimited ? (
          <Infinity
            className={`h-4 w-4 ${
              isRecommended ? 'text-brand-premium' : 'text-brand-accent'
            }`}
          />
        ) : (
          <Icon
            className={`h-4 w-4 ${
              isRecommended ? 'text-brand-premium' : 'text-gray-400'
            }`}
          />
        )}
      </div>
      <span className="text-sm text-gray-300">
        {isUnlimited ? (
          <>
            <span className="font-data text-brand-profit font-medium">
              &infin;
            </span>{' '}
            {plural}
          </>
        ) : (
          <>
            <span className="font-data font-medium text-white">{value}</span>{' '}
            {limitLabel(value, singular, plural)}
          </>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plan Card                                                          */
/* ------------------------------------------------------------------ */

interface PlanCardProps {
  plan: PlanDisplay;
  index: number;
}

function PlanCard({ plan, index }: PlanCardProps) {
  const isFree = plan.priceMonthly === 0;
  const { isRecommended } = plan;

  const ctaLabel = isFree
    ? 'Начать бесплатно'
    : isRecommended
      ? 'Запросить доступ'
      : 'Связаться';

  const CtaIcon = isRecommended
    ? Zap
    : isFree
      ? ArrowRight
      : HeadphonesIcon;

  return (
    <FadeUp delay={index * 0.1}>
      <div
        className={`
          relative flex flex-col h-full rounded-2xl backdrop-blur-xl transition-all duration-300
          ${
            isRecommended
              ? 'bg-white/[0.05] border-0 shadow-[0_0_60px_-12px_rgba(255,215,0,0.15)] scale-[1.02] lg:scale-105 z-10 hover:shadow-[0_0_80px_-8px_rgba(255,215,0,0.22)]'
              : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] hover:shadow-[0_0_40px_-12px_rgba(68,136,255,0.08)]'
          }
        `}
      >
        {/* Gold gradient border for recommended */}
        {isRecommended && (
          <div
            className="absolute inset-0 rounded-2xl -z-10"
            style={{
              padding: '1px',
              background: 'linear-gradient(135deg, #FFD700, rgba(255,215,0,0.4), transparent 50%, rgba(255,215,0,0.2), #FFD700)',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
        )}

        {/* Recommended badge */}
        {isRecommended && (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
            <Badge
              variant="premium"
              className="px-4 py-1 text-xs font-semibold tracking-wide rounded-full shadow-lg shadow-brand-premium/20"
            >
              <Crown className="h-3 w-3 mr-1.5" />
              Популярный
            </Badge>
          </div>
        )}

        <div className="flex flex-col h-full p-7 sm:p-8">
          {/* Header */}
          <div className={`${isRecommended ? 'pt-2' : ''}`}>
            <h3 className="font-heading text-lg font-semibold text-white mb-1">
              {plan.name}
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              {isFree && 'Для знакомства с платформой'}
              {isRecommended && 'Для активных трейдеров'}
              {!isFree && !isRecommended && 'Для команд и фондов'}
            </p>
          </div>

          {/* Price */}
          <div className="mb-6">
            {isFree ? (
              <div className="flex items-baseline gap-1">
                <span className="font-data text-4xl font-bold text-white tracking-tight">
                  Бесплатно
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="font-data text-sm text-gray-500">$</span>
                <span
                  className={`font-data text-4xl font-bold tracking-tight ${
                    isRecommended ? 'text-brand-premium' : 'text-white'
                  }`}
                >
                  {plan.priceMonthly}
                </span>
                <span className="text-sm text-gray-500 ml-0.5">/мес</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            className={`h-px mb-6 ${
              isRecommended
                ? 'bg-gradient-to-r from-transparent via-brand-premium/30 to-transparent'
                : 'bg-white/[0.06]'
            }`}
          />

          {/* Limits */}
          <div className="mb-6 space-y-0.5">
            <LimitRow
              icon={Bot}
              value={plan.maxBots}
              singular="бот"
              plural="ботов"
              isRecommended={isRecommended}
            />
            <LimitRow
              icon={Brain}
              value={plan.maxStrategies}
              singular="стратегия"
              plural="стратегий"
              isRecommended={isRecommended}
            />
            <LimitRow
              icon={FlaskConical}
              value={plan.maxBacktestsPerDay}
              singular="бэктест/день"
              plural="бэктестов/день"
              isRecommended={isRecommended}
            />
          </div>

          {/* Features */}
          <div className="flex-1 mb-8">
            <ul className="space-y-2.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-brand-profit mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-400">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <Button
            onClick={scrollToAccessForm}
            className={`
              w-full h-12 rounded-xl font-semibold text-[15px] transition-all duration-300 cursor-pointer group
              ${
                isRecommended
                  ? 'bg-brand-premium text-brand-bg hover:bg-brand-premium/90 shadow-lg shadow-brand-premium/20 animate-glow-pulse'
                  : 'bg-transparent border border-white/[0.1] text-gray-300 hover:bg-white/[0.05] hover:border-white/[0.2] hover:text-white'
              }
            `}
          >
            {ctaLabel}
            <CtaIcon
              className={`ml-2 h-4 w-4 transition-transform duration-200 ${
                isRecommended
                  ? 'group-hover:scale-110'
                  : 'group-hover:translate-x-0.5'
              }`}
            />
          </Button>
        </div>
      </div>
    </FadeUp>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing Section                                                    */
/* ------------------------------------------------------------------ */

export function PricingSection() {
  const [plans, setPlans] = useState<PlanDisplay[]>(FALLBACK_PLANS);

  const fetchPlans = useCallback(async () => {
    try {
      const { data } = await api.get<PlanFromAPI[]>('/billing/plans');
      if (Array.isArray(data) && data.length > 0) {
        setPlans(data.map(mapAPIPlan));
      }
    } catch {
      // Используем fallback планы при ошибке
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return (
    <section
      id="pricing"
      className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] overflow-hidden"
    >
      {/* Ambient glow background */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full opacity-[0.03] blur-[120px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #FFD700 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-[1200px] mx-auto">
        {/* Section header */}
        <FadeUp className="text-center mb-16">
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Тарифы
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Выберите свой план
          </h2>
          <p className="text-[17px] text-gray-400 max-w-[520px] mx-auto">
            От бесплатного старта до корпоративных решений.
            Масштабируйтесь по мере роста.
          </p>
        </FadeUp>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 items-start max-w-[960px] mx-auto">
          {plans.map((plan, i) => (
            <PlanCard key={plan.id} plan={plan} index={i} />
          ))}
        </div>

        {/* Trust signals */}
        <FadeUp delay={0.35} className="mt-14">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
            <TrustSignal icon={Shield} text="Без доступа к выводу средств" />
            <TrustSignal icon={Clock} text="Отмена в любой момент" />
            <TrustSignal icon={Zap} text="Активация за 2 минуты" />
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Trust Signal                                                       */
/* ------------------------------------------------------------------ */

interface TrustSignalProps {
  icon: React.ElementType;
  text: string;
}

function TrustSignal({ icon: Icon, text }: TrustSignalProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Icon className="h-4 w-4 text-gray-600" />
      <span>{text}</span>
    </div>
  );
}
