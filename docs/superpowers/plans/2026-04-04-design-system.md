# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Update design system: split fonts (Jiro/Inter for UI, JetBrains Mono for data), add SEO meta tags, create robots.txt and sitemap.xml

**Architecture:** Modify tailwind.config.js font families, update index.css variables, add SEO tags to index.html, create static files. Global visual regression check after font change.

**Tech Stack:** Tailwind CSS 3.4, Vite 6, React 18

---

### Task 1: Font sourcing - verify Jiro availability, fallback to Inter

**Files:**
- Check: `frontend/public/fonts/` (create directory if needed)
- Modify: `frontend/index.html` (Google Fonts link already loads Inter)

Jiro is specified in CLAUDE.md as the UI font. It is a commercial/niche font unlikely to be available as a free web font. The plan: attempt to find it, then fall back to Inter which is already loaded from Google Fonts in `index.html`.

- [ ] **Step 1: Search for Jiro font availability**

Run a web search for "Jiro font download woff2 free" to confirm availability. If Jiro .woff2 files are found:

```bash
mkdir -p frontend/public/fonts
# Place Jiro-Regular.woff2, Jiro-Medium.woff2, Jiro-Bold.woff2 into frontend/public/fonts/
```

If Jiro is NOT available (most likely outcome), proceed with Inter as the UI font. Inter is already loaded in `frontend/index.html` line 14:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
```

No changes needed to index.html for font loading - Inter is already present.

- [ ] **Step 2: Document the decision**

If Jiro is unavailable, update `CLAUDE.md` line 43 to reflect the actual font used:

In `CLAUDE.md`, replace:
```
- Шрифт UI: Jiro | Шрифт цифр: JetBrains Mono
```
with:
```
- Шрифт UI: Inter (fallback from Jiro) | Шрифт цифр: JetBrains Mono
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Inter as UI font fallback (Jiro unavailable)"
```

After commit, run `/simplify` for review.

---

### Task 2: Update tailwind.config.js fontFamily entries

**Files:**
- Modify: `frontend/tailwind.config.js`

Currently ALL fontFamily entries point to JetBrains Mono (lines 57-61). After this change, `font-sans` (the Tailwind default for all text) will use Inter, and only `font-mono`/`font-data` will use JetBrains Mono. This affects every page visually.

- [ ] **Step 1: Update fontFamily configuration**

In `frontend/tailwind.config.js`, replace lines 56-62:

```javascript
      fontFamily: {
        sans: ['JetBrains Mono', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        heading: ['JetBrains Mono', 'system-ui', 'sans-serif'],
        body: ['JetBrains Mono', 'system-ui', 'sans-serif'],
        data: ['JetBrains Mono', 'monospace'],
      },
```

**If Jiro IS available** (font files placed in `public/fonts/`), replace with:

```javascript
      fontFamily: {
        sans: ['Jiro', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        heading: ['Jiro', 'Inter', 'system-ui', 'sans-serif'],
        data: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
```

**If Jiro is NOT available** (expected), replace with:

```javascript
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        heading: ['Inter', 'system-ui', 'sans-serif'],
        data: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
```

Note: `body` key is removed - it is not a standard Tailwind key and was unused in components. `heading` is kept because it is used in 7 components via `font-heading` class.

- [ ] **Step 2: Verify Tailwind compiles without errors**

```bash
cd frontend && npx tailwindcss --content './src/**/*.tsx' --output /dev/null 2>&1 || echo "Tailwind compilation failed"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tailwind.config.js
git commit -m "feat: split font families - Inter for UI, JetBrains Mono for data"
```

After commit, run `/simplify` for review.

---

### Task 3: Update index.css - CSS variables, font-face, remove old utilities

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add CSS custom properties for fonts and update body font**

In `frontend/src/index.css`, replace the entire first `@layer base` block (lines 5-28):

```css
@layer base {
  :root {
    --font-ui: 'Inter', system-ui, sans-serif;
    --font-data: 'JetBrains Mono', Consolas, monospace;

    --background: 240 33% 5%;
    --foreground: 0 0% 95%;
    --card: 240 33% 9%;
    --card-foreground: 0 0% 95%;
    --popover: 240 33% 9%;
    --popover-foreground: 0 0% 95%;
    --primary: 45 100% 50%;
    --primary-foreground: 240 33% 5%;
    --secondary: 240 20% 15%;
    --secondary-foreground: 0 0% 90%;
    --muted: 240 20% 15%;
    --muted-foreground: 240 5% 55%;
    --accent: 240 20% 18%;
    --accent-foreground: 0 0% 95%;
    --destructive: 348 100% 55%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 10% 20%;
    --input: 240 10% 20%;
    --ring: 45 100% 50%;
    --radius: 0.5rem;
  }
}
```

If Jiro IS available, use `--font-ui: 'Jiro', 'Inter', system-ui, sans-serif;` instead.

- [ ] **Step 2: Update body font-family in second @layer base block**

Replace the second `@layer base` block (lines 30-39):

```css
@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-ui);
    margin: 0;
    min-height: 100vh;
  }
}
```

- [ ] **Step 3: Replace old utility classes**

Replace the `.font-heading` and `.font-data` blocks (lines 42-48):

```css
.font-heading {
  font-family: 'JetBrains Mono', system-ui, sans-serif;
}

.font-data {
  font-family: 'JetBrains Mono', monospace;
}
```

with:

```css
.font-data {
  font-family: var(--font-data);
}
```

The `.font-heading` class is removed because `font-heading` now resolves through Tailwind's `fontFamily.heading` config (Inter). Components using `font-heading` class (Landing.tsx, Login.tsx, Register.tsx, Dashboard.tsx, Sidebar.tsx) will automatically use the Tailwind-generated `font-heading` utility instead.

- [ ] **Step 4: Add @font-face declarations (only if Jiro is available)**

If Jiro font files exist in `frontend/public/fonts/`, add BEFORE the first `@layer base`:

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

If Jiro is NOT available, skip this step entirely - Inter is loaded via Google Fonts in index.html.

- [ ] **Step 5: Verify the full index.css looks correct**

The final `frontend/src/index.css` (Inter-only scenario) should be:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --font-ui: 'Inter', system-ui, sans-serif;
    --font-data: 'JetBrains Mono', Consolas, monospace;

    --background: 240 33% 5%;
    --foreground: 0 0% 95%;
    --card: 240 33% 9%;
    --card-foreground: 0 0% 95%;
    --popover: 240 33% 9%;
    --popover-foreground: 0 0% 95%;
    --primary: 45 100% 50%;
    --primary-foreground: 240 33% 5%;
    --secondary: 240 20% 15%;
    --secondary-foreground: 0 0% 90%;
    --muted: 240 20% 15%;
    --muted-foreground: 240 5% 55%;
    --accent: 240 20% 18%;
    --accent-foreground: 0 0% 95%;
    --destructive: 348 100% 55%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 10% 20%;
    --input: 240 10% 20%;
    --ring: 45 100% 50%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-ui);
    margin: 0;
    min-height: 100vh;
  }
}

.font-data {
  font-family: var(--font-data);
}

.pnl-positive {
  color: #00E676;
}

.pnl-negative {
  color: #FF1744;
}

/* Custom scrollbar for dark theme */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #0d0d1a;
}

::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css
git commit -m "refactor: update CSS variables for font system, remove obsolete .font-heading"
```

After commit, run `/simplify` for review.

---

### Task 4: Update index.html - SEO meta, OG tags, fix theme-color

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Fix theme-color and add title tag content**

In `frontend/index.html`, replace line 9:

```html
    <meta name="theme-color" content="#0a242c" />
```

with:

```html
    <meta name="theme-color" content="#0d0d1a" />
```

- [ ] **Step 2: Add SEO meta tags, OG tags, and canonical link**

In `frontend/index.html`, replace the entire `<title>AlgoBond</title>` line (line 11) with the full SEO block:

```html
    <title>AlgoBond - Алгоритмическая торговля криптовалютами</title>

    <!-- Primary Meta -->
    <meta name="description" content="AlgoBond - платформа алгоритмической торговли криптофьючерсами. ML-стратегии, бэктестинг, автоматическая торговля на Bybit." />
    <meta name="keywords" content="алготрейдинг, криптовалюта, торговый бот, Bybit, бэктестинг, машинное обучение, KNN" />
    <meta name="author" content="AlgoBond" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://algo.dev-james.bond/" />
    <meta property="og:title" content="AlgoBond - Алгоритмическая торговля криптовалютами" />
    <meta property="og:description" content="ML-стратегии с доходностью +710% на исторических данных. Бэктестинг, live-торговля, мониторинг - всё в одном." />
    <meta property="og:image" content="https://algo.dev-james.bond/og-image.png" />
    <meta property="og:locale" content="ru_RU" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="AlgoBond - Алгоритмическая торговля" />
    <meta name="twitter:description" content="ML-стратегии, бэктестинг и автоматическая торговля на Bybit" />
    <meta name="twitter:image" content="https://algo.dev-james.bond/og-image.png" />

    <!-- Canonical -->
    <link rel="canonical" href="https://algo.dev-james.bond/" />
```

- [ ] **Step 3: Verify the full index.html**

The final `frontend/index.html` should be:

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#0d0d1a" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AlgoBond - Алгоритмическая торговля криптовалютами</title>

    <!-- Primary Meta -->
    <meta name="description" content="AlgoBond - платформа алгоритмической торговли криптофьючерсами. ML-стратегии, бэктестинг, автоматическая торговля на Bybit." />
    <meta name="keywords" content="алготрейдинг, криптовалюта, торговый бот, Bybit, бэктестинг, машинное обучение, KNN" />
    <meta name="author" content="AlgoBond" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://algo.dev-james.bond/" />
    <meta property="og:title" content="AlgoBond - Алгоритмическая торговля криптовалютами" />
    <meta property="og:description" content="ML-стратегии с доходностью +710% на исторических данных. Бэктестинг, live-торговля, мониторинг - всё в одном." />
    <meta property="og:image" content="https://algo.dev-james.bond/og-image.png" />
    <meta property="og:locale" content="ru_RU" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="AlgoBond - Алгоритмическая торговля" />
    <meta name="twitter:description" content="ML-стратегии, бэктестинг и автоматическая торговля на Bybit" />
    <meta name="twitter:image" content="https://algo.dev-james.bond/og-image.png" />

    <!-- Canonical -->
    <link rel="canonical" href="https://algo.dev-james.bond/" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add SEO meta tags, OG tags, fix theme-color to brand-bg"
```

After commit, run `/simplify` for review.

---

### Task 5: Create robots.txt

**Files:**
- Create: `frontend/public/robots.txt`

- [ ] **Step 1: Create robots.txt**

Create `frontend/public/robots.txt` with the following content:

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

This allows indexing of public pages (Landing, Login, Register) while blocking authenticated pages from crawlers.

- [ ] **Step 2: Verify Vite serves the file**

Vite serves files from `public/` as static assets at the root. Verify:

```bash
cd frontend && ls -la public/robots.txt
```

The file will be available at `https://algo.dev-james.bond/robots.txt` after deploy.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/robots.txt
git commit -m "feat: add robots.txt - allow public pages, block authenticated routes"
```

After commit, run `/simplify` for review.

---

### Task 6: Create sitemap.xml

**Files:**
- Create: `frontend/public/sitemap.xml`

- [ ] **Step 1: Create sitemap.xml**

Create `frontend/public/sitemap.xml` with the following content:

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

- [ ] **Step 2: Validate XML syntax**

```bash
cd frontend && python3 -c "import xml.etree.ElementTree as ET; ET.parse('public/sitemap.xml'); print('XML valid')"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/sitemap.xml
git commit -m "feat: add sitemap.xml with public pages for SEO"
```

After commit, run `/simplify` for review.

---

### Task 7: Create OG-image placeholder (SVG approach)

**Files:**
- Create: `frontend/public/og-image.svg` (source)
- Create: `frontend/public/og-image.png` (generated from SVG, 1200x630)

The OG-image is referenced in the Open Graph meta tags. Create an SVG placeholder and convert to PNG.

- [ ] **Step 1: Create the SVG source file**

Create `frontend/public/og-image.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d0d1a"/>
  <rect x="0" y="0" width="1200" height="630" fill="url(#grad)" opacity="0.3"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d0d1a;stop-opacity:1" />
    </linearGradient>
  </defs>
  <text x="600" y="280" font-family="Inter, system-ui, sans-serif" font-size="72" font-weight="700" fill="#ffffff" text-anchor="middle">AlgoBond</text>
  <text x="600" y="340" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="400" fill="#9ca3af" text-anchor="middle">Алгоритмическая торговля криптовалютами</text>
  <text x="600" y="400" font-family="JetBrains Mono, monospace" font-size="22" font-weight="700" fill="#FFD700" text-anchor="middle">+710% RIVERUSDT</text>
  <line x1="400" y1="370" x2="800" y2="370" stroke="#333333" stroke-width="1"/>
</svg>
```

- [ ] **Step 2: Convert SVG to PNG**

Option A - using sharp (if available in node_modules):

```bash
cd frontend && node -e "
const sharp = require('sharp');
sharp('public/og-image.svg')
  .resize(1200, 630)
  .png()
  .toFile('public/og-image.png')
  .then(() => console.log('og-image.png created'))
  .catch(e => console.error(e));
"
```

Option B - using Playwright browser screenshot:

```bash
cd frontend && node -e "
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const svg = fs.readFileSync('public/og-image.svg', 'utf-8');
  await page.setContent('<html><body style=\"margin:0;padding:0\">' + svg + '</body></html>');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.screenshot({ path: 'public/og-image.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log('og-image.png created via Playwright');
})();
"
```

Option C - if neither works, keep the SVG and note that PNG conversion should be done manually (e.g., open SVG in browser, screenshot at 1200x630). The SVG itself is a valid placeholder.

- [ ] **Step 3: Verify the file exists and has reasonable size**

```bash
ls -la frontend/public/og-image.png frontend/public/og-image.svg
```

Expected: og-image.svg ~1KB, og-image.png ~5-50KB

- [ ] **Step 4: Commit**

```bash
git add frontend/public/og-image.svg frontend/public/og-image.png
git commit -m "feat: add OG-image placeholder (1200x630) for social sharing"
```

If only SVG was created (PNG conversion failed):

```bash
git add frontend/public/og-image.svg
git commit -m "feat: add OG-image SVG placeholder (PNG conversion needed manually)"
```

After commit, run `/simplify` for review.

---

### Task 8: Visual regression check of all pages

**Files:**
- Check: all 12 routes in `frontend/src/App.tsx`

The font change from JetBrains Mono to Inter for all `font-sans` text is a major visual change affecting every page. This task verifies nothing is broken.

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev &
```

Wait for Vite to report the local URL (typically `http://localhost:5173`).

- [ ] **Step 2: Check public pages visually using Playwright**

Navigate to each public page and take a snapshot to verify text renders in Inter (not JetBrains Mono):

Pages to check (no auth required):
1. `http://localhost:5173/` - Landing page
2. `http://localhost:5173/login` - Login page
3. `http://localhost:5173/register` - Register page

For each page, verify:
- Headings render in Inter (proportional sans-serif, not monospaced)
- Body text renders in Inter
- Numeric data (stats on Landing: "+710%", "14 pairs") renders in JetBrains Mono via `font-data` class
- No layout breakage (text overflow, misaligned elements)
- Gold CTA buttons still have correct styling

Use Playwright browser_navigate + browser_snapshot for each page.

- [ ] **Step 3: Check authenticated pages**

These require login. If a test account is available, check:
4. `/dashboard` - stat cards should use `font-data` for numbers, `font-sans` (Inter) for labels
5. `/strategies` - strategy names in Inter, percentages in JetBrains Mono
6. `/strategies/:slug` - config values in `font-mono`, descriptions in Inter
7. `/chart` - prices in `font-mono`, symbol name in Inter
8. `/chart/:symbol` - same as above
9. `/bots` - bot stats in `font-mono`, bot names in Inter
10. `/bots/:id` - P&L numbers in `font-mono`, labels in Inter
11. `/backtest` - results in `font-mono`, form labels in Inter
12. `/settings` - API keys in `font-mono`, section titles in Inter

For each page, verify:
- No monospaced text where proportional is expected (headings, labels, buttons, paragraphs)
- Numeric/data text still monospaced (prices, percentages, P&L, timestamps, API keys)
- No layout overflow caused by font width change (Inter is narrower than JetBrains Mono)

- [ ] **Step 4: Document any issues found**

If issues found (e.g., a component needs explicit `font-mono` added for data that lost its monospace styling), fix them immediately. Common fixes:

```tsx
// If a numeric display lost monospaced styling, add font-mono:
<span className="font-mono text-lg">{price}</span>

// If a heading incorrectly shows monospaced, ensure no font-mono override:
<h1 className="text-2xl font-bold">{title}</h1>
```

- [ ] **Step 5: Commit any visual fixes**

```bash
git add -A frontend/src/
git commit -m "fix: visual regression fixes after font system split"
```

After commit, run `/simplify` for review.

---

### Task 9: WCAG contrast verification

**Files:**
- Potentially modify: `frontend/tailwind.config.js` (if gray-500 fails contrast check)
- Potentially modify: components using `text-gray-500` on card backgrounds

Verify WCAG AA (4.5:1 ratio) for all text/background pairs in the design system.

- [ ] **Step 1: Calculate contrast ratios programmatically**

Run a Node.js script to check all pairs from the spec:

```bash
node -e "
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrast(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return ((lighter + 0.05) / (darker + 0.05)).toFixed(2);
}

const pairs = [
  ['#ffffff', '#0d0d1a', 'white on bg'],
  ['#FFD700', '#0d0d1a', 'gold on bg'],
  ['#00E676', '#0d0d1a', 'profit on bg'],
  ['#FF1744', '#0d0d1a', 'loss on bg'],
  ['#9ca3af', '#0d0d1a', 'gray-400 on bg'],
  ['#FFD700', '#1a1a2e', 'gold on card'],
  ['#6b7280', '#1a1a2e', 'gray-500 on card (RISK)'],
  ['#9ca3af', '#1a1a2e', 'gray-400 on card (fallback)'],
];

console.log('WCAG AA Contrast Check (min 4.5:1):');
console.log('='.repeat(50));
pairs.forEach(([fg, bg, label]) => {
  const ratio = contrast(fg, bg);
  const pass = parseFloat(ratio) >= 4.5;
  console.log(pass ? 'PASS' : 'FAIL', ratio + ':1', '-', label);
});
"
```

Expected output:
```
PASS 19.16:1 - white on bg
PASS 11.41:1 - gold on bg
PASS  9.29:1 - profit on bg
PASS  4.82:1 - loss on bg
PASS  6.24:1 - gray-400 on bg
PASS  8.32:1 - gold on card
FAIL  3.54:1 - gray-500 on card (RISK)
PASS  4.64:1 - gray-400 on card (fallback)
```

- [ ] **Step 2: Fix gray-500 on card backgrounds if it fails**

If `gray-500` (`#6b7280`) on card bg (`#1a1a2e`) fails the 4.5:1 threshold (expected ~3.5:1 - FAIL), find all instances of `text-gray-500` used on card backgrounds and replace with `text-gray-400`:

Files with `text-gray-500` usage (115 occurrences across 15 files). Not all need changing - only those rendered on card backgrounds (`bg-brand-card`, `bg-[#1a1a2e]`, or within `<Card>` components).

Key files to audit:

```bash
# Find gray-500 usage in component context
grep -rn "text-gray-500" frontend/src/pages/ frontend/src/components/
```

For each occurrence on a card background, replace `text-gray-500` with `text-gray-400`. Example pattern:

In files where `text-gray-500` appears inside a Card or on card-colored background:
```tsx
// Before:
<span className="text-gray-500 text-xs">Secondary info</span>

// After:
<span className="text-gray-400 text-xs">Secondary info</span>
```

Note: `text-gray-500` on the main background (`#0d0d1a`) passes at ~4.2:1, which is borderline. Consider upgrading those to `text-gray-400` as well for safety margin.

Common components to check:
- `frontend/src/pages/BotDetail.tsx` (44 occurrences of gray-500/muted)
- `frontend/src/pages/Settings.tsx` (15 occurrences)
- `frontend/src/pages/Backtest.tsx` (16 occurrences)
- `frontend/src/pages/Bots.tsx` (8 occurrences)
- `frontend/src/components/layout/Sidebar.tsx` (1 occurrence: version number)

- [ ] **Step 3: Re-run contrast check after fixes**

Re-run the script from Step 1 to confirm all pairs now pass.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/
git commit -m "fix: upgrade gray-500 to gray-400 on card backgrounds for WCAG AA contrast"
```

After commit, run `/simplify` for review.

---

### Summary of all changes

| File | Action | Description |
|------|--------|-------------|
| `CLAUDE.md` | Modify | Document Inter as Jiro fallback |
| `frontend/tailwind.config.js` | Modify | Split fontFamily: Inter for UI, JetBrains Mono for data |
| `frontend/src/index.css` | Modify | Add --font-ui/--font-data vars, update body font, remove .font-heading |
| `frontend/index.html` | Modify | Add SEO meta, OG tags, fix theme-color #0d0d1a |
| `frontend/public/robots.txt` | Create | Allow public pages, block authenticated routes |
| `frontend/public/sitemap.xml` | Create | 7 public URLs for search engines |
| `frontend/public/og-image.svg` | Create | OG-image source (1200x630) |
| `frontend/public/og-image.png` | Create | OG-image rendered (1200x630) |
| Various component files | Modify | gray-500 to gray-400 on card backgrounds (WCAG fix) |

**Impact scope:** All 12 routes will show visual changes from the font switch. The `font-heading` and `font-data` Tailwind utilities continue to work. Components using explicit `font-mono` for numeric data are unaffected. The main visible change is body text, headings, labels, and buttons switching from monospaced (JetBrains Mono) to proportional (Inter).
