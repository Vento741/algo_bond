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
  subtitle: string;
  priceMonthly: number;
  maxBots: number;
  maxStrategies: number;
  maxBacktestsPerDay: number;
  features: string[];
  isRecommended: boolean;
}

/* ------------------------------------------------------------------ */
/*  Feature key -> human-readable label                                */
/* ------------------------------------------------------------------ */

const FEATURE_LABELS: Record<string, string> = {
  demo_mode: 'Демо-режим',
  live_trading: 'Live-торговля',
  priority_support: 'Приоритетная поддержка',
  custom_strategies: 'Кастомные стратегии',
  api_access: 'API доступ',
  dedicated_server: 'Выделенный сервер',
  multi_tp: 'Multi-TP и Breakeven',
  telegram_alerts: 'Telegram-уведомления',
  optimization: 'Оптимизация стратегий',
  advanced_analytics: 'Расширенная аналитика',
};

/* ------------------------------------------------------------------ */
/*  Plan subtitles by slug/index                                       */
/* ------------------------------------------------------------------ */

const PLAN_SUBTITLES: Record<string, string> = {
  free: 'Для знакомства',
  starter: 'Для знакомства',
  basic: 'Для активных трейдеров',
  pro: 'Максимум возможностей',
  vip: 'Для команд и фондов',
  enterprise: 'Для команд и фондов',
};

/* ------------------------------------------------------------------ */
/*  Fallback plans (used if API is empty)                              */
/* ------------------------------------------------------------------ */

const FALLBACK_PLANS: PlanDisplay[] = [
  {
    id: 'starter',
    name: 'Starter',
    slug: 'starter',
    subtitle: 'Для знакомства',
    priceMonthly: 0,
    maxBots: 1,
    maxStrategies: 1,
    maxBacktestsPerDay: 5,
    features: ['Демо-режим', 'Базовая аналитика', 'Документация'],
    isRecommended: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    slug: 'pro',
    subtitle: 'Максимум возможностей',
    priceMonthly: 29,
    maxBots: 5,
    maxStrategies: 5,
    maxBacktestsPerDay: 50,
    features: [
      'Live-торговля',
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
    subtitle: 'Для команд и фондов',
    priceMonthly: 99,
    maxBots: -1,
    maxStrategies: -1,
    maxBacktestsPerDay: -1,
    features: [
      'Все функции Pro',
      'Безлимитные ресурсы',
      'Персональный менеджер',
      'Кастомные стратегии',
      'API доступ',
      'SLA 99.9%',
    ],
    isRecommended: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const RECOMMENDED_SLUGS = ['pro'];

function mapAPIPlan(plan: PlanFromAPI): PlanDisplay {
  const featureList: string[] = [];
  if (plan.features && typeof plan.features === 'object') {
    Object.entries(plan.features).forEach(([key, value]) => {
      if (typeof value === 'string') {
        featureList.push(value);
      } else if (value === true) {
        featureList.push(FEATURE_LABELS[key] ?? key.replace(/_/g, ' '));
      }
    });
  }

  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    subtitle: PLAN_SUBTITLES[plan.slug.toLowerCase()] ?? 'Для трейдеров',
    priceMonthly: Number(plan.price_monthly),
    maxBots: plan.max_bots,
    maxStrategies: plan.max_strategies,
    maxBacktestsPerDay: plan.max_backtests_per_day,
    features: featureList,
    isRecommended: RECOMMENDED_SLUGS.includes(plan.slug.toLowerCase()),
  };
}

function limitLabel(value: number, one: string, few: string, many: string): string {
  if (value < 0) return many;
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

function scrollToAccessForm(): void {
  document.getElementById('access-request')?.scrollIntoView({
    behavior: 'smooth',
  });
}

/* ------------------------------------------------------------------ */
/*  Limit Row                                                          */
/* ------------------------------------------------------------------ */

function LimitRow({
  icon: Icon,
  value,
  one,
  few,
  many,
  accent,
}: {
  icon: React.ElementType;
  value: number;
  one: string;
  few: string;
  many: string;
  accent: boolean;
}) {
  const unlimited = value < 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className={`flex items-center justify-center w-7 h-7 rounded-lg ${
          accent ? 'bg-brand-premium/10' : 'bg-white/[0.04]'
        }`}
      >
        {unlimited ? (
          <Infinity className={`h-3.5 w-3.5 ${accent ? 'text-brand-premium' : 'text-brand-accent'}`} />
        ) : (
          <Icon className={`h-3.5 w-3.5 ${accent ? 'text-brand-premium' : 'text-gray-400'}`} />
        )}
      </div>
      <span className="text-sm text-gray-300">
        {unlimited ? (
          <>
            <span className="font-data text-brand-profit font-medium">&infin;</span>{' '}
            {many}
          </>
        ) : (
          <>
            <span className="font-data font-medium text-white">{value}</span>{' '}
            {limitLabel(value, one, few, many)}
          </>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plan Card                                                          */
/* ------------------------------------------------------------------ */

function PlanCard({ plan, index }: { plan: PlanDisplay; index: number }) {
  const isFree = plan.priceMonthly === 0;
  const rec = plan.isRecommended;

  const ctaLabel = isFree
    ? 'Начать бесплатно'
    : rec
      ? 'Запросить доступ'
      : plan.priceMonthly >= 90
        ? 'Связаться'
        : 'Запросить доступ';

  const CtaIcon = rec ? Zap : isFree ? ArrowRight : plan.priceMonthly >= 90 ? HeadphonesIcon : Zap;

  return (
    <FadeUp delay={index * 0.08}>
      <div
        className={`
          relative flex flex-col h-full rounded-2xl backdrop-blur-xl transition-all duration-300
          ${rec
            ? 'bg-white/[0.05] border-0 shadow-[0_0_60px_-12px_rgba(255,215,0,0.15)] hover:shadow-[0_0_80px_-8px_rgba(255,215,0,0.22)]'
            : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]'
          }
        `}
      >
        {/* Gold gradient border */}
        {rec && (
          <div
            className="absolute inset-0 rounded-2xl -z-10"
            style={{
              padding: '1px',
              background:
                'linear-gradient(160deg, #FFD700, rgba(255,215,0,0.3) 40%, transparent 60%, rgba(255,215,0,0.2) 80%, #FFD700)',
              WebkitMask:
                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
        )}

        {/* Badge */}
        {rec && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
            <Badge
              variant="premium"
              className="px-3 py-0.5 text-[11px] font-semibold tracking-wide rounded-full shadow-lg shadow-brand-premium/20"
            >
              <Crown className="h-3 w-3 mr-1" />
              Популярный
            </Badge>
          </div>
        )}

        <div className="flex flex-col h-full p-6 sm:p-7">
          {/* Header */}
          <div className={rec ? 'pt-1' : ''}>
            <h3 className="font-heading text-lg font-semibold text-white mb-0.5">
              {plan.name}
            </h3>
            <p className="text-xs text-gray-500 mb-4">{plan.subtitle}</p>
          </div>

          {/* Price */}
          <div className="mb-5">
            {isFree ? (
              <span className="font-data text-3xl font-bold text-white tracking-tight">
                Бесплатно
              </span>
            ) : (
              <div className="flex items-baseline gap-0.5">
                <span className="font-data text-sm text-gray-500">$</span>
                <span
                  className={`font-data text-3xl font-bold tracking-tight ${
                    rec ? 'text-brand-premium' : 'text-white'
                  }`}
                >
                  {plan.priceMonthly % 1 === 0
                    ? plan.priceMonthly
                    : plan.priceMonthly.toFixed(2)}
                </span>
                <span className="text-sm text-gray-500 ml-0.5">/мес</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            className={`h-px mb-5 ${
              rec
                ? 'bg-gradient-to-r from-transparent via-brand-premium/30 to-transparent'
                : 'bg-white/[0.06]'
            }`}
          />

          {/* Limits */}
          <div className="mb-5">
            <LimitRow icon={Bot} value={plan.maxBots} one="бот" few="бота" many="ботов" accent={rec} />
            <LimitRow icon={Brain} value={plan.maxStrategies} one="стратегия" few="стратегии" many="стратегий" accent={rec} />
            <LimitRow icon={FlaskConical} value={plan.maxBacktestsPerDay} one="бэктест/день" few="бэктеста/день" many="бэктестов/день" accent={rec} />
          </div>

          {/* Features */}
          {plan.features.length > 0 && (
            <div className="flex-1 mb-6">
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-brand-profit mt-0.5 shrink-0" />
                    <span className="text-sm text-gray-400">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="mt-auto">
            <button
              onClick={scrollToAccessForm}
              className={`
                w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer
                ${rec
                  ? 'bg-brand-premium text-brand-bg hover:bg-brand-premium/90 shadow-lg shadow-brand-premium/20'
                  : 'bg-transparent border border-white/[0.1] text-gray-300 hover:bg-white/[0.05] hover:border-white/[0.2] hover:text-white'
                }
              `}
            >
              {ctaLabel}
              <CtaIcon className="h-4 w-4" />
            </button>
          </div>
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
      // fallback
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Determine grid: 2-col for 2/4 plans, 3-col for 3, 4-col for 4+
  const count = plans.length;
  const gridCols =
    count <= 2
      ? 'sm:grid-cols-2'
      : count === 3
        ? 'lg:grid-cols-3'
        : 'sm:grid-cols-2 xl:grid-cols-4';

  return (
    <section
      id="pricing"
      className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full opacity-[0.03] blur-[120px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FFD700 0%, transparent 70%)' }}
      />

      <div className="relative max-w-[1280px] mx-auto">
        {/* Header */}
        <FadeUp className="text-center mb-14">
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Тарифы
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Выберите свой план
          </h2>
          <p className="text-[17px] text-gray-400 max-w-[520px] mx-auto leading-relaxed">
            От бесплатного старта до корпоративных решений.
            <br className="hidden sm:block" />
            Масштабируйтесь по мере роста.
          </p>
        </FadeUp>

        {/* Grid */}
        <div
          className={`grid grid-cols-1 ${gridCols} gap-5 lg:gap-6 items-stretch max-w-[1100px] mx-auto`}
        >
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

function TrustSignal({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Icon className="h-4 w-4 text-gray-600" />
      <span>{text}</span>
    </div>
  );
}
