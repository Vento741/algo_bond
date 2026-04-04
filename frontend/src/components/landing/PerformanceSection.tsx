import { FadeUp } from '@/components/landing/FadeUp';

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
 * Использует cubic bezier curves для плавности.
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
    <section className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px]">
      <div className="max-w-[1200px] mx-auto">
        {/* Section header */}
        <FadeUp className="mb-16">
          <p className="text-xs uppercase tracking-[3px] text-brand-premium font-medium mb-4">
            Результаты
          </p>
          <h2 className="font-heading text-3xl sm:text-[40px] font-bold text-white leading-[1.15] tracking-tight mb-4">
            Стратегия в цифрах
          </h2>
          <p className="text-[17px] text-gray-400 max-w-[520px]">
            Lorentzian KNN на паре RIVERUSDT. Бэктест за 12 месяцев.
          </p>
        </FadeUp>

        {/* Layout: chart + metrics */}
        <FadeUp delay={0.1}>
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-16 items-center">
            {/* Equity curve chart */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8">
              {/* Chart header */}
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h4 className="text-sm text-gray-400 font-medium mb-1">
                    Equity Curve
                  </h4>
                  <div className="font-data text-[28px] font-bold text-brand-profit tracking-tight">
                    $81,042
                  </div>
                </div>
                <div className="text-right">
                  <h4 className="text-sm text-gray-400 font-medium mb-1">
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
                <FadeUp
                  key={metric.label}
                  delay={0.2 + i * 0.08}
                >
                  <div className="flex justify-between items-center px-6 py-5 rounded-xl bg-white/[0.02] border border-white/[0.05] transition-all duration-300 hover:bg-white/[0.04]">
                    <span className="text-sm text-gray-400">{metric.label}</span>
                    <span
                      className={`font-data text-[22px] font-bold tracking-tight ${metric.color}`}
                    >
                      {metric.value}
                    </span>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </FadeUp>

        {/* Disclaimer */}
        <FadeUp delay={0.3} className="text-center mt-8">
          <p className="text-[13px] text-gray-600">
            Результаты получены на исторических данных (бэктест). Прошлые
            результаты не гарантируют будущую доходность.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
