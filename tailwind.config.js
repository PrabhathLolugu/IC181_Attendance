/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      boxShadow: {
        'xs':    '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'card':  '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'modal': '0 25px 50px -12px rgb(0 0 0 / 0.22)',
        'glow-blue': '0 0 0 3px rgb(37 99 235 / 0.15)',
        'glow-green': '0 0 0 3px rgb(16 185 129 / 0.15)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-in':    'fadeIn 200ms ease-out',
        'slide-up':   'slideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-down': 'slideDown 200ms ease-out',
        'scale-in':   'scaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-dot':  'pulseDot 2s ease-in-out infinite',
        'count-up':   'countUp 600ms ease-out',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideDown: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: 0, transform: 'scale(0.95)' }, to: { opacity: 1, transform: 'scale(1)' } },
        pulseDot:  { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
