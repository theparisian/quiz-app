import type { Config } from 'tailwindcss';
import { ELEVATION_SHADOW, GLASS_SURFACE_SHADOW, SURFACE_RADIUS } from './elevation';

export const tailwindPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
        },
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0',
        sm: '0.75rem',
        DEFAULT: SURFACE_RADIUS,
        md: SURFACE_RADIUS,
        lg: SURFACE_RADIUS,
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        full: '9999px',
      },
      boxShadow: {
        sm: ELEVATION_SHADOW,
        DEFAULT: ELEVATION_SHADOW,
        md: ELEVATION_SHADOW,
        lg: ELEVATION_SHADOW,
        xl: ELEVATION_SHADOW,
        '2xl': ELEVATION_SHADOW,
        glass: GLASS_SURFACE_SHADOW,
        inner: 'inset 0 2px 4px 0 rgba(103, 110, 144, 0.06)',
        none: 'none',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'answer-reveal': 'answerReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        answerReveal: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
};
