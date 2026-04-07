/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0d0d1a',
          card: '#1a1a2e',
          profit: '#00E676',
          loss: '#FF1744',
          premium: '#FFD700',
          accent: '#4488ff',
          border: '#333333',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Tektur', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        heading: ['Tektur', 'system-ui', 'sans-serif'],
        data: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px 0 rgba(255, 215, 0, 0.25)' },
          '50%': { boxShadow: '0 0 32px 6px rgba(255, 215, 0, 0.40)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'wave-move': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'heartbeat-loss': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 23, 68, 0.5)' },
          '25%': { boxShadow: '0 0 0 6px rgba(255, 23, 68, 0)' },
          '50%': { boxShadow: '0 0 0 0 rgba(255, 23, 68, 0.3)' },
          '75%': { boxShadow: '0 0 0 4px rgba(255, 23, 68, 0)' },
        },
        'heartbeat-profit': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 230, 118, 0.5)' },
          '25%': { boxShadow: '0 0 0 6px rgba(0, 230, 118, 0)' },
          '50%': { boxShadow: '0 0 0 0 rgba(0, 230, 118, 0.3)' },
          '75%': { boxShadow: '0 0 0 4px rgba(0, 230, 118, 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.7s ease-out both',
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        'slide-up': 'slide-up 0.4s ease-out both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
