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
      },
      fontFamily: {
        sans: ['Jiro', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
