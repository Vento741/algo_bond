import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FadeUp } from '@/components/landing/FadeUp';

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
    <section className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] bg-white/[0.01]">
      <div className="max-w-[1200px] mx-auto">
        {/* Section header */}
        <FadeUp className="mb-16">
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Вопросы
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Частые вопросы
          </h2>
          <p className="text-[17px] text-gray-400 max-w-[520px]">
            Ответы на основные вопросы о платформе.
          </p>
        </FadeUp>

        {/* Accordion */}
        <FadeUp delay={0.1}>
          <div className="max-w-[700px]">
            <Accordion type="single" collapsible defaultValue="item-0">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
