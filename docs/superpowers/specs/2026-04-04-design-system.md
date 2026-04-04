# SPEC 1: Design System — Типографика, SEO, Фундамент

> **Статус:** Draft
> **Зависимости:** Нет (выполняется первым)
> **Параллельно:** SPEC 4 (auth-and-error-pages)
> **Блокирует:** SPEC 2, SPEC 3

---

## Цель

Обновить дизайн-систему: разделить шрифты (UI vs данные), добавить SEO meta tags, исправить CSS-переменные. Это фундамент для всех последующих спеков.

---

## 1. Типографика

### Разделение шрифтов

| Контекст | Шрифт | Tailwind-класс |
|----------|-------|----------------|
| Заголовки, навигация, кнопки, body-текст, маркетинг | **Jiro** (sans-serif) | `font-sans` |
| Цены, P&L, проценты, таймстемпы, коды, таблицы с цифрами | **JetBrains Mono** | `font-mono`, `font-data` |

### Шрифт Jiro — Sourcing

Jiro указан в CLAUDE.md как UI-шрифт. Варианты подключения:

1. **Приоритет:** Найти и скачать файлы Jiro (.woff2), разместить в `frontend/public/fonts/`, подключить через `@font-face` в `index.css`
2. **Fallback:** Если Jiro недоступен — использовать **Inter** (уже загружается из Google Fonts в `index.html`). Inter — качественный sans-serif, отлично подходит для финтех-UI

### Изменения в файлах

#### `frontend/tailwind.config.js`

```javascript
fontFamily: {
  sans: ['Jiro', 'Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'Consolas', 'monospace'],
  heading: ['Jiro', 'Inter', 'system-ui', 'sans-serif'],
  data: ['JetBrains Mono', 'Consolas', 'monospace'],
},
```

> **ВНИМАНИЕ:** Сейчас ВСЕ `fontFamily.*` указывают на JetBrains Mono. После изменения весь текст без явного `font-mono` переключится на Jiro/Inter. Это затронет все 9 страниц и 13+ компонентов. **Требуется визуальная проверка всех страниц после изменения.**

#### `frontend/src/index.css`

```css
@layer base {
  :root {
    --font-ui: 'Jiro', 'Inter', system-ui, sans-serif;
    --font-data: 'JetBrains Mono', Consolas, monospace;
  }
}
```

Если Jiro подключается через `@font-face`:

```css
@font-face {
  font-family: 'Jiro';
  src: url('/fonts/Jiro-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Jiro';
  src: url('/fonts/Jiro-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Jiro';
  src: url('/fonts/Jiro-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
```

#### Замена утилити-классов

Текущие классы `.font-heading`, `.font-data` в `index.css` — заменить:
- `.font-heading` → удалить (теперь `font-sans` + `font-bold` достаточно)
- `.font-data` → оставить как алиас для `font-mono` (для семантики)

---

## 2. SEO Meta Tags

### `frontend/index.html`

Добавить в `<head>`:

```html
<!-- Primary Meta -->
<meta name="description" content="AlgoBond — платформа алгоритмической торговли криптофьючерсами. ML-стратегии, бэктестинг, автоматическая торговля на Bybit." />
<meta name="keywords" content="алготрейдинг, криптовалюта, торговый бот, Bybit, бэктестинг, машинное обучение, KNN" />
<meta name="author" content="AlgoBond" />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://algo.dev-james.bond/" />
<meta property="og:title" content="AlgoBond — Алгоритмическая торговля криптовалютами" />
<meta property="og:description" content="ML-стратегии с доходностью +710% на исторических данных. Бэктестинг, live-торговля, мониторинг — всё в одном." />
<meta property="og:image" content="https://algo.dev-james.bond/og-image.png" />
<meta property="og:locale" content="ru_RU" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="AlgoBond — Алгоритмическая торговля" />
<meta name="twitter:description" content="ML-стратегии, бэктестинг и автоматическая торговля на Bybit" />
<meta name="twitter:image" content="https://algo.dev-james.bond/og-image.png" />

<!-- Canonical -->
<link rel="canonical" href="https://algo.dev-james.bond/" />
```

### Исправление theme-color

Текущий: `#0a242c` (teal) → Новый: `#0d0d1a` (brand-bg).

### OG-Image

Создать `frontend/public/og-image.png` - 1200x630px. Placeholder: сплошной фон `#0d0d1a`, белый текст "AlgoBond" по центру, подзаголовок "Алгоритмическая торговля" серым. Создать как SVG и конвертировать в PNG через sharp/canvas или вручную.

---

## 3. Статические файлы

### `frontend/public/robots.txt`

```
User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /strategies
Disallow: /chart
Disallow: /bots
Disallow: /backtest
Disallow: /settings
Disallow: /admin

Sitemap: https://algo.dev-james.bond/sitemap.xml
```

### `frontend/public/sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://algo.dev-james.bond/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://algo.dev-james.bond/login</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://algo.dev-james.bond/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://algo.dev-james.bond/terms</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://algo.dev-james.bond/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://algo.dev-james.bond/cookies</loc>
    <changefreq>monthly</changefreq>
    <priority>0.2</priority>
  </url>
  <url>
    <loc>https://algo.dev-james.bond/risk</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

---

## 4. WCAG AA — Проверка контрастности

Проверить следующие пары на контрастность >= 4.5:1:

| Текст | Фон | Текущее |
|-------|-----|---------|
| `#ffffff` (text) | `#0d0d1a` (bg) | ~19:1 OK |
| `#FFD700` (gold) | `#0d0d1a` (bg) | ~11:1 OK |
| `#00E676` (profit) | `#0d0d1a` (bg) | ~9:1 OK |
| `#FF1744` (loss) | `#0d0d1a` (bg) | ~4.8:1 OK |
| `#9ca3af` (gray-400) | `#0d0d1a` (bg) | ~6:1 OK |
| `#FFD700` (gold) | `#1a1a2e` (card) | ~8:1 OK |
| `#6b7280` (gray-500) | `#1a1a2e` (card) | ~3.5:1 RISK |

**Правило:** Если ratio < 4.5:1, заменить gray-500 на gray-400 (`#9ca3af`) для вторичного текста на карточках.

---

## 5. Скоуп

### Включено
- Обновление `tailwind.config.js` (шрифты)
- Обновление `index.css` (CSS-переменные, @font-face)
- Обновление `index.html` (SEO meta, theme-color)
- Создание `robots.txt`, `sitemap.xml`
- Создание OG-image placeholder
- Визуальная проверка всех существующих страниц после смены шрифта

### НЕ включено
- Редизайн компонентов (другие спеки)
- Новые shadcn-компоненты
- Изменение цветовой палитры
- Новые страницы

---

## Чеклист реализации

- [ ] Sourcing шрифта Jiro (или fallback на Inter)
- [ ] Подключение через @font-face (если Jiro) или проверка Google Fonts load (если Inter)
- [ ] Обновить `tailwind.config.js` — fontFamily
- [ ] Обновить `index.css` — CSS variables, удалить устаревшие утилити
- [ ] Обновить `index.html` — SEO meta, OG tags, theme-color
- [ ] Создать `robots.txt`
- [ ] Создать `sitemap.xml`
- [ ] Создать OG-image placeholder (1200x630)
- [ ] Визуальная проверка: Landing, Login, Register, Dashboard, Strategies, StrategyDetail, Chart, Bots, BotDetail, Backtest, Settings
- [ ] WCAG AA контрастность — проверить gray-500 на card-bg
- [ ] Вызвать `/simplify` для ревью
