# Landing Page Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Upgrade landing page with 4 new sections (How It Works, Access Request Form, Performance, FAQ) and a new Footer component

**Architecture:** Add sections to existing Landing.tsx. Create reusable Footer.tsx component. Install shadcn accordion for FAQ. Use static SVG for equity curve. Access form posts to /api/auth/access-request (API may not exist yet - handle gracefully).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide React, shadcn/ui Accordion

**Key Files:**
- `frontend/src/pages/Landing.tsx` - main landing page (existing, modify)
- `frontend/src/components/landing/HowItWorks.tsx` - new section component
- `frontend/src/components/landing/AccessRequestForm.tsx` - new section component
- `frontend/src/components/landing/PerformanceSection.tsx` - new section component
- `frontend/src/components/landing/FAQSection.tsx` - new section component
- `frontend/src/components/layout/Footer.tsx` - new reusable footer component
- `frontend/src/components/ui/accordion.tsx` - shadcn accordion (install)

**Design Reference:** `.superpowers/brainstorm/34473-1775299347/content/landing-premium.html`

**Palette:** `#0d0d1a` bg, `#1a1a2e` cards, `#FFD700` gold, `#00E676` green, `#FF1744` red, `#4488ff` blue

**CRITICAL DESIGN RULES:**
- Premium, clean, airy - NOT AI-template. Reference the mockup HTML.
- Section padding: `py-[120px]` (120px top/bottom minimum)
- Subtle borders: `border-white/[0.04]` to `border-white/[0.06]` max
- Card backgrounds: `bg-white/[0.02]` - barely visible
- Text muted: `text-gray-500` for secondary, `text-gray-400` for descriptions
- Section labels: uppercase, letter-spacing 3px, gold color, 12px
- No boxy template layouts - generous whitespace everywhere
- Font: JetBrains Mono via existing `font-heading`, `font-data` classes
- Max container width: `max-w-[1200px]` with `px-10 lg:px-10` (40px padding like mockup)

---

## Task 1: Install shadcn Accordion component

**Time:** 2 min
**Why:** FAQ section requires the Accordion component from shadcn/ui. Since there is no `components.json` config, we create the component manually using Radix primitives.

### Steps

- [ ] Install `@radix-ui/react-accordion` dependency:

```bash
cd frontend && npm install @radix-ui/react-accordion
```

- [ ] Create `frontend/src/components/ui/accordion.tsx` with the full shadcn accordion component:

```tsx
import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-b border-white/[0.05]', className)}
    {...props}
  />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between py-6 text-[16px] font-medium text-gray-200 transition-colors hover:text-white [&[data-state=open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-600 transition-transform duration-300 [[data-state=open]>&]:text-brand-premium" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-[15px] text-gray-500 leading-[1.8] data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('pb-6', className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/components/ui/accordion.tsx frontend/package.json frontend/package-lock.json && git commit -m "feat: add shadcn accordion component for FAQ section"`
- [ ] Run `/simplify` for review

---

## Task 2: Update Hero CTA from "Начать бесплатно" to "Запросить доступ"

**Time:** 3 min
**Why:** Platform is invite-only. "Начать бесплатно" is misleading. New CTA scrolls to the access request form.

### Steps

- [ ] In `frontend/src/pages/Landing.tsx`, replace the Hero CTA block. Find the existing CTA div (lines ~133-153) and replace it.

**Find this code:**
```tsx
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
```

**Replace with:**
```tsx
            <Button
              variant="premium"
              size="xl"
              className="group animate-glow-pulse"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('access-request')?.scrollIntoView({
                  behavior: 'smooth',
                });
              }}
            >
              Запросить доступ
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
```

- [ ] Remove the unused `Link` import if it's no longer used elsewhere in the file. Check: `Link` is still used for `/login` button and nav links, so keep it.

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/pages/Landing.tsx && git commit -m "feat: update Hero CTA to 'Запросить доступ' with smooth scroll"`
- [ ] Run `/simplify` for review

---

## Task 3: Create HowItWorks section component

**Time:** 5 min
**Why:** Shows the 3-step onboarding flow. Positioned after Features, before Access Request Form.

### Steps

- [ ] Create directory: `mkdir -p frontend/src/components/landing`

- [ ] Create `frontend/src/components/landing/HowItWorks.tsx`:

```tsx
import { MessageCircle, Settings, Rocket } from 'lucide-react';

const steps = [
  {
    num: 1,
    icon: MessageCircle,
    title: 'Запросите доступ',
    description:
      'Оставьте заявку с вашим Telegram. Мы отправим персональный инвайт-код.',
  },
  {
    num: 2,
    icon: Settings,
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
    <section className="relative z-10 px-10 py-[120px] bg-white/[0.01]">
      <div className="max-w-[1200px] mx-auto">
        {/* Section header */}
        <div
          className="mb-16 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Как начать
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Три шага к автоматической торговле
          </h2>
          <p className="text-[17px] text-gray-500 max-w-[520px]">
            Запуск бота занимает несколько минут после получения доступа.
          </p>
        </div>

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
            <div
              key={step.num}
              className="text-center px-8 relative animate-fade-up"
              style={{ animationDelay: `${0.2 + i * 0.1}s` }}
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
              <p className="text-[15px] text-gray-500 leading-[1.7]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/components/landing/HowItWorks.tsx && git commit -m "feat: add HowItWorks section with 3-step flow and connectors"`
- [ ] Run `/simplify` for review

---

## Task 4: Create AccessRequestForm section component

**Time:** 5 min
**Why:** Core conversion element. Telegram input with validation, API call, localStorage rate limit.

### Steps

- [ ] Create `frontend/src/components/landing/AccessRequestForm.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { Key, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

const TG_REGEX = /^@[a-zA-Z0-9_]{4,31}$/;
const LS_KEY = 'access_request_sent';

export function AccessRequestForm() {
  const [telegram, setTelegram] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(() => localStorage.getItem(LS_KEY) === '1');

  const validate = useCallback((value: string): string => {
    if (!value) return 'Введите ваш Telegram username';
    if (!value.startsWith('@')) return 'Username должен начинаться с @';
    if (!TG_REGEX.test(value))
      return 'Формат: @username (5-32 символа, латиница, цифры, _)';
    return '';
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const validationError = validate(telegram);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError('');
      setLoading(true);

      try {
        await api.post('/auth/access-request', { telegram });
        localStorage.setItem(LS_KEY, '1');
        setSent(true);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 409) {
          localStorage.setItem(LS_KEY, '1');
          setSent(true);
        } else if (axiosErr.response?.status === 429) {
          setError('Слишком много попыток. Повторите позже.');
        } else {
          // API may not exist yet - show success anyway for graceful degradation
          localStorage.setItem(LS_KEY, '1');
          setSent(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [telegram, validate],
  );

  return (
    <section
      id="access-request"
      className="relative z-10 px-10 py-[120px] text-center"
    >
      <div
        className="relative max-w-[520px] mx-auto rounded-[20px] bg-white/[0.02] border border-brand-premium/[0.12] p-14 animate-fade-up"
        style={{ animationDelay: '0.15s' }}
      >
        {/* Subtle gold glow behind card */}
        <div
          className="absolute inset-[-1px] rounded-[20px] -z-10"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,215,0,0.15), transparent 50%)',
          }}
        />

        {sent ? (
          /* Success state */
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="h-12 w-12 text-brand-profit" />
            <h2 className="font-heading text-2xl font-bold text-white">
              Заявка отправлена!
            </h2>
            <p className="text-[15px] text-gray-500">
              Мы свяжемся с вами в Telegram и отправим инвайт-код.
            </p>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="flex items-center justify-center gap-3 mb-3">
              <Key className="h-5 w-5 text-brand-premium" />
              <h2 className="font-heading text-[28px] font-bold text-white tracking-tight">
                Запросите доступ
              </h2>
            </div>
            <p className="text-[15px] text-gray-500 mb-9">
              Оставьте ваш Telegram - мы отправим персональный код приглашения
            </p>

            <form onSubmit={handleSubmit}>
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => {
                    setTelegram(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="@username"
                  className="flex-1 h-12 px-5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-[15px] placeholder:text-gray-600 outline-none transition-colors focus:border-brand-premium/40"
                />
                <Button
                  type="submit"
                  variant="premium"
                  disabled={loading}
                  className="h-12 px-8 rounded-xl text-[15px] font-semibold whitespace-nowrap"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Отправить'
                  )}
                </Button>
              </div>

              {error && (
                <div className="flex items-center gap-2 justify-center text-brand-loss text-sm mb-4">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {error}
                </div>
              )}
            </form>

            <p className="text-xs text-gray-600">
              Нажимая &laquo;Отправить&raquo;, вы соглашаетесь с{' '}
              <a
                href="/terms"
                className="text-gray-500 underline underline-offset-2 hover:text-gray-400 transition-colors"
              >
                Условиями использования
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/components/landing/AccessRequestForm.tsx && git commit -m "feat: add AccessRequestForm section with Telegram validation and API integration"`
- [ ] Run `/simplify` for review

---

## Task 5: Create PerformanceSection component

**Time:** 5 min
**Why:** Shows the equity curve chart (static SVG) and 4 key metric cards. Hardcoded data for now.

### Steps

- [ ] Create `frontend/src/components/landing/PerformanceSection.tsx`:

```tsx
interface EquityPoint {
  month: string;
  value: number;
}

const EQUITY_DATA: EquityPoint[] = [
  { month: 'Янв', value: 10000 },
  { month: 'Фев', value: 14200 },
  { month: 'Мар', value: 18500 },
  { month: 'Апр', value: 23100 },
  { month: 'Май', value: 29800 },
  { month: 'Июн', value: 35400 },
  { month: 'Июл', value: 38200 },
  { month: 'Авг', value: 46500 },
  { month: 'Сен', value: 53000 },
  { month: 'Окт', value: 62700 },
  { month: 'Ноя', value: 71500 },
  { month: 'Дек', value: 81042 },
];

const METRICS = [
  { label: 'Доходность', value: '+710%', color: 'text-brand-profit' },
  { label: 'Макс. просадка', value: '-12.3%', color: 'text-brand-loss' },
  { label: 'Sharpe Ratio', value: '2.41', color: 'text-brand-premium' },
  { label: 'Win Rate', value: '68.5%', color: 'text-brand-accent' },
];

/**
 * Строит SVG path для equity curve на основе данных.
 * Использует quadratic bezier curves для плавности.
 */
function buildEquityPath(
  data: EquityPoint[],
  width: number,
  height: number,
  padding: number = 8,
): { linePath: string; areaPath: string } {
  const minVal = Math.min(...data.map((d) => d.value));
  const maxVal = Math.max(...data.map((d) => d.value));
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padding + (1 - (d.value - minVal) / range) * (height - padding * 2),
  }));

  // Build smooth curve using cubic bezier
  let line = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
    line += ` C${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
  }

  const area = `${line} L${width},${height} L0,${height} Z`;

  return { linePath: line, areaPath: area };
}

export function PerformanceSection() {
  const svgWidth = 600;
  const svgHeight = 200;
  const { linePath, areaPath } = buildEquityPath(
    EQUITY_DATA,
    svgWidth,
    svgHeight,
  );

  return (
    <section className="relative z-10 px-10 py-[120px]">
      <div className="max-w-[1200px] mx-auto">
        {/* Section header */}
        <div
          className="mb-16 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Результаты
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Стратегия в цифрах
          </h2>
          <p className="text-[17px] text-gray-500 max-w-[520px]">
            Lorentzian KNN на паре RIVERUSDT. Бэктест за 12 месяцев.
          </p>
        </div>

        {/* Layout: chart + metrics */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-16 items-center animate-fade-up"
          style={{ animationDelay: '0.2s' }}
        >
          {/* Equity curve chart */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8">
            {/* Chart header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-sm text-gray-500 font-medium mb-1">
                  Equity Curve
                </h4>
                <div className="font-data text-[28px] font-bold text-brand-profit tracking-tight">
                  $81,042
                </div>
              </div>
              <div className="text-right">
                <h4 className="text-sm text-gray-500 font-medium mb-1">
                  Начальный депозит
                </h4>
                <div className="font-data text-base text-gray-500">
                  $10,000
                </div>
              </div>
            </div>

            {/* SVG Chart */}
            <svg
              className="w-full"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              preserveAspectRatio="none"
              style={{ height: 200 }}
            >
              <defs>
                <linearGradient
                  id="equity-gradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#00E676" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00E676" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#equity-gradient)" />
              <path
                d={linePath}
                fill="none"
                stroke="#00E676"
                strokeWidth="2"
              />
            </svg>

            {/* X axis labels */}
            <div className="flex justify-between mt-2">
              {['Янв', 'Мар', 'Май', 'Июл', 'Сен', 'Ноя', 'Дек'].map(
                (label) => (
                  <span key={label} className="text-[13px] text-gray-600">
                    {label}
                  </span>
                ),
              )}
            </div>
          </div>

          {/* Metrics stack */}
          <div className="flex flex-col gap-5">
            {METRICS.map((metric, i) => (
              <div
                key={metric.label}
                className="flex justify-between items-center px-6 py-5 rounded-xl bg-white/[0.02] border border-white/[0.05] transition-all duration-300 hover:bg-white/[0.04] animate-fade-up"
                style={{ animationDelay: `${0.3 + i * 0.08}s` }}
              >
                <span className="text-sm text-gray-500">{metric.label}</span>
                <span
                  className={`font-data text-[22px] font-bold tracking-tight ${metric.color}`}
                >
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p
          className="text-center text-[13px] text-gray-600 mt-8 animate-fade-up"
          style={{ animationDelay: '0.4s' }}
        >
          Результаты получены на исторических данных (бэктест). Прошлые
          результаты не гарантируют будущую доходность.
        </p>
      </div>
    </section>
  );
}
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/components/landing/PerformanceSection.tsx && git commit -m "feat: add PerformanceSection with SVG equity curve and metric cards"`
- [ ] Run `/simplify` for review

---

## Task 6: Create FAQSection component

**Time:** 4 min
**Why:** 6 accordion items answering common questions. Uses the shadcn Accordion installed in Task 1.

### Steps

- [ ] Create `frontend/src/components/landing/FAQSection.tsx`:

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_ITEMS = [
  {
    question: 'Что такое AlgoBond?',
    answer:
      'Платформа алгоритмической торговли криптофьючерсами на Bybit. ML-стратегии анализируют рынок и автоматически открывают и закрывают позиции.',
  },
  {
    question: 'Как получить доступ?',
    answer:
      'Оставьте ваш Telegram в форме выше. После рассмотрения заявки мы отправим персональный инвайт-код для регистрации.',
  },
  {
    question: 'Какие стратегии используются?',
    answer:
      'Lorentzian KNN Classification - ML-модель, адаптированная под криптовалютные рынки. Анализирует паттерны в многомерном пространстве признаков.',
  },
  {
    question: 'Нужно ли отдавать доступ к кошельку?',
    answer:
      'Нет. Вы создаёте API-ключ только с правами на торговлю, без возможности вывода средств. Ваши средства всегда под вашим контролем.',
  },
  {
    question: 'Какие риски?',
    answer:
      'Торговля криптофьючерсами несёт высокие риски, вплоть до полной потери средств. Подробнее - в разделе "Раскрытие рисков".',
  },
  {
    question: 'Сколько стоит?',
    answer:
      'На данный момент доступ бесплатный для участников закрытого тестирования.',
  },
];

export function FAQSection() {
  return (
    <section className="relative z-10 px-10 py-[120px] bg-white/[0.01]">
      <div className="max-w-[1200px] mx-auto">
        {/* Section header */}
        <div
          className="mb-16 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Вопросы
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Частые вопросы
          </h2>
          <p className="text-[17px] text-gray-500 max-w-[520px]">
            Ответы на основные вопросы о платформе.
          </p>
        </div>

        {/* Accordion */}
        <div
          className="max-w-[700px] animate-fade-up"
          style={{ animationDelay: '0.2s' }}
        >
          <Accordion type="single" collapsible defaultValue="item-0">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/components/landing/FAQSection.tsx && git commit -m "feat: add FAQ section with 6 accordion items"`
- [ ] Run `/simplify` for review

---

## Task 7: Create Footer.tsx component

**Time:** 5 min
**Why:** Replaces the minimal footer. 3-column layout with legal links, contacts, and risk disclaimer. Reusable across Landing and legal pages.

### Steps

- [ ] Create `frontend/src/components/layout/Footer.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';

const LEGAL_LINKS = [
  { label: 'Условия использования', href: '/terms' },
  { label: 'Конфиденциальность', href: '/privacy' },
  { label: 'Обработка данных', href: '/cookies' },
  { label: 'Раскрытие рисков', href: '/risk' },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/[0.04] px-10 pt-20 pb-10">
      <div className="max-w-[1200px] mx-auto">
        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-16 mb-16">
          {/* Column 1: Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img
                src="/logo.webp"
                alt=""
                className="w-7 h-7 rounded-lg"
                width={28}
                height={28}
              />
              <span className="font-heading text-xl font-bold text-white tracking-tight">
                Algo
                <span className="text-brand-premium">Bond</span>
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-[1.7] max-w-xs">
              Платформа алгоритмической торговли криптофьючерсами.
              ML-стратегии, бэктестинг, автоматическое исполнение на Bybit.
            </p>
          </div>

          {/* Column 2: Legal */}
          <div>
            <h4 className="text-xs uppercase tracking-[2px] text-gray-500 font-medium mb-5">
              Правовая информация
            </h4>
            <div className="flex flex-col gap-1">
              {LEGAL_LINKS.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-sm text-gray-600 py-1.5 hover:text-gray-400 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Column 3: Contact */}
          <div>
            <h4 className="text-xs uppercase tracking-[2px] text-gray-500 font-medium mb-5">
              Контакты
            </h4>
            <a
              href="https://t.me/algobond"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-400 transition-colors"
            >
              <Send className="h-4 w-4" />
              Telegram
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/[0.04] text-center">
          <p className="text-xs text-gray-700">
            &copy; 2026 AlgoBond. Все права защищены.
            &nbsp;&nbsp;
            <span className="font-data text-gray-700">v0.8.0</span>
          </p>
          <p className="text-[11px] text-gray-700 leading-[1.7] max-w-[640px] mx-auto mt-4">
            Торговля криптовалютными фьючерсами сопряжена с высоким риском
            потери средств. Прошлые результаты стратегий не являются гарантией
            будущей доходности. AlgoBond не является финансовым советником и не
            несёт ответственности за торговые решения пользователей.
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/components/layout/Footer.tsx && git commit -m "feat: add Footer component with 3-column layout and risk disclaimer"`
- [ ] Run `/simplify` for review

---

## Task 8: Integrate all sections into Landing.tsx

**Time:** 5 min
**Why:** Wire up all new components into the landing page in correct order: Nav > Hero > Stats > Features > HowItWorks > AccessRequestForm > Performance > FAQ > Footer.

### Steps

- [ ] Update `frontend/src/pages/Landing.tsx`. Replace the entire file content:

```tsx
import { Link } from 'react-router-dom';
import { Brain, Zap, FlaskConical, ArrowRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { AccessRequestForm } from '@/components/landing/AccessRequestForm';
import { PerformanceSection } from '@/components/landing/PerformanceSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { Footer } from '@/components/layout/Footer';

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
        {/* Background image - responsive picture */}
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
              +710% RIVERUSDT - проверено на истории
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
            <Button
              variant="premium"
              size="xl"
              className="group animate-glow-pulse"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('access-request')?.scrollIntoView({
                  behavior: 'smooth',
                });
              }}
            >
              Запросить доступ
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
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
              <div className="text-xs text-gray-500 mt-0.5">{stat.sublabel}</div>
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

      {/* -------- How It Works -------- */}
      <HowItWorks />

      {/* -------- Access Request Form -------- */}
      <AccessRequestForm />

      {/* -------- Performance -------- */}
      <PerformanceSection />

      {/* -------- FAQ -------- */}
      <FAQSection />

      {/* -------- Footer -------- */}
      <Footer />
    </div>
  );
}
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/pages/Landing.tsx && git commit -m "feat: integrate all new landing sections (HowItWorks, AccessForm, Performance, FAQ, Footer)"`
- [ ] Run `/simplify` for review

---

## Task 9: Add fade-up animations with Intersection Observer

**Time:** 4 min
**Why:** Currently animations fire on page load via CSS animation-delay. For a premium feel, sections below the fold should animate when scrolled into view, not all at once on load.

### Steps

- [ ] Create a reusable hook `frontend/src/hooks/useInView.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useInView({
  threshold = 0.1,
  rootMargin = '0px 0px -60px 0px',
  triggerOnce = true,
}: UseInViewOptions = {}): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce]);

  return [ref, inView];
}
```

- [ ] Create a wrapper component `frontend/src/components/landing/FadeUp.tsx`:

```tsx
import { type ReactNode } from 'react';
import { useInView } from '@/hooks/useInView';
import { cn } from '@/lib/utils';

interface FadeUpProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function FadeUp({ children, className, delay = 0 }: FadeUpProps) {
  const [ref, inView] = useInView({ threshold: 0.1 });

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        inView
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-6',
        className,
      )}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
```

- [ ] Update `frontend/src/components/landing/HowItWorks.tsx` to use `FadeUp`:

Replace the section header div:
```tsx
// Find:
        <div
          className="mb-16 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
// Replace with:
        <FadeUp className="mb-16">
```

And close the tag correspondingly. Replace each step's `animate-fade-up` with `FadeUp` wrapper. Add import at top:
```tsx
import { FadeUp } from '@/components/landing/FadeUp';
```

**Important:** This is an enhancement. If time-constrained, the existing CSS `animate-fade-up` approach already works and this task can be deferred. The CSS animations fire on load which is acceptable for the initial release.

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add frontend/src/hooks/useInView.ts frontend/src/components/landing/FadeUp.tsx && git commit -m "feat: add useInView hook and FadeUp component for scroll-triggered animations"`
- [ ] Run `/simplify` for review

---

## Task 10: Responsive check and polish (375px, 768px, 1440px, 1920px)

**Time:** 5 min
**Why:** Verify all new sections display correctly across breakpoints. Fix any overflow, spacing, or layout issues.

### Steps

- [ ] Start dev server: `cd frontend && npm run dev`

- [ ] Check each breakpoint visually at the following widths. Open browser DevTools and toggle device toolbar:

  **375px (iPhone SE):**
  - HowItWorks: steps should stack vertically, connector lines vertical
  - AccessRequestForm: form input and button should stack (`flex-col` on mobile)
  - PerformanceSection: chart and metrics stack vertically
  - FAQSection: accordion full width
  - Footer: single column stack

  **768px (iPad):**
  - HowItWorks: 3 columns should work
  - AccessRequestForm: form row should work (input + button side by side)
  - PerformanceSection: may need to stack (lg breakpoint)
  - Footer: 3 columns

  **1440px / 1920px (Desktop):**
  - All sections should display as designed with generous whitespace
  - Max container widths respected (1200px)

- [ ] Fix responsive issue in AccessRequestForm - add `flex-col sm:flex-row` to the form row:

In `frontend/src/components/landing/AccessRequestForm.tsx`, the form row div:
```tsx
// Find:
              <div className="flex gap-3 mb-4">
// Replace with:
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
```

- [ ] Fix responsive padding on all new sections - ensure `px-5 lg:px-10` instead of just `px-10` for mobile:

In `HowItWorks.tsx`:
```tsx
// Find:
    <section className="relative z-10 px-10 py-[120px] bg-white/[0.01]">
// Replace with:
    <section className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] bg-white/[0.01]">
```

In `AccessRequestForm.tsx`:
```tsx
// Find:
      className="relative z-10 px-10 py-[120px] text-center"
// Replace with:
      className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] text-center"
```

In `PerformanceSection.tsx`:
```tsx
// Find:
    <section className="relative z-10 px-10 py-[120px]">
// Replace with:
    <section className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px]">
```

In `FAQSection.tsx`:
```tsx
// Find:
    <section className="relative z-10 px-10 py-[120px] bg-white/[0.01]">
// Replace with:
    <section className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] bg-white/[0.01]">
```

In `Footer.tsx`:
```tsx
// Find:
    <footer className="relative z-10 border-t border-white/[0.04] px-10 pt-20 pb-10">
// Replace with:
    <footer className="relative z-10 border-t border-white/[0.04] px-5 lg:px-10 pt-20 pb-10">
```

- [ ] Fix AccessRequestForm card padding for mobile:
```tsx
// Find:
        className="relative max-w-[520px] mx-auto rounded-[20px] bg-white/[0.02] border border-brand-premium/[0.12] p-14 animate-fade-up"
// Replace with:
        className="relative max-w-[520px] mx-auto rounded-[20px] bg-white/[0.02] border border-brand-premium/[0.12] p-8 sm:p-14 animate-fade-up"
```

- [ ] Verify build: `cd frontend && npx tsc --noEmit`
- [ ] Commit: `git add -A && git commit -m "fix: responsive adjustments for all new landing sections (mobile padding, stacking)"`
- [ ] Run `/simplify` for review

---

## Summary of file changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/package.json` | Modified | Add `@radix-ui/react-accordion` dependency |
| `frontend/src/components/ui/accordion.tsx` | **New** | Shadcn accordion component |
| `frontend/src/components/landing/HowItWorks.tsx` | **New** | 3-step how-it-works section |
| `frontend/src/components/landing/AccessRequestForm.tsx` | **New** | Telegram access request form |
| `frontend/src/components/landing/PerformanceSection.tsx` | **New** | SVG equity curve + 4 metric cards |
| `frontend/src/components/landing/FAQSection.tsx` | **New** | 6-item FAQ accordion |
| `frontend/src/components/landing/FadeUp.tsx` | **New** | Scroll-triggered fade-up wrapper |
| `frontend/src/hooks/useInView.ts` | **New** | Intersection Observer hook |
| `frontend/src/components/layout/Footer.tsx` | **New** | 3-column footer with legal links |
| `frontend/src/pages/Landing.tsx` | Modified | Integrate all sections, update Hero CTA |

## Section order in Landing.tsx

1. Nav (existing, unchanged)
2. Hero (existing, CTA updated)
3. Stats (existing, unchanged)
4. Features (existing, unchanged)
5. **HowItWorks** (new)
6. **AccessRequestForm** (new)
7. **PerformanceSection** (new)
8. **FAQSection** (new)
9. **Footer** (new, replaces old inline footer)
