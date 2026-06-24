import type { Config } from 'tailwindcss';
import { tailwindPreset } from '@quiz-app/design-tokens/tailwind-preset';

const config: Config = {
  presets: [tailwindPreset as Config],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(52, 152, 219, 0.6)' },
          '50%': { boxShadow: '0 0 40px rgba(52, 152, 219, 0.9)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(60px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-60px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-up': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'cascade-in': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'answer-reveal': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'timer-urgent': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        'timer-critical': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
        'timer-digit': {
          '0%': { transform: 'scale(1)' },
          '35%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
        'pseudo-pop': {
          '0%': { opacity: '0', transform: 'translateY(140px) scale(0.85)' },
          '60%': { opacity: '1' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pseudo-float': {
          '0%, 100%': { transform: 'translateY(0) rotate(var(--pseudo-rot, 0deg))' },
          '50%': { transform: 'translateY(-12px) rotate(calc(var(--pseudo-rot, 0deg) * -1))' },
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 1.5s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.6s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.6s ease-out forwards',
        'scale-up': 'scale-up 0.6s ease-out forwards',
        'cascade-in': 'cascade-in 0.3s ease-out forwards',
        'answer-reveal': 'answer-reveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'timer-urgent': 'timer-urgent 1s ease-in-out infinite',
        'timer-critical': 'timer-critical 0.55s ease-in-out infinite',
        'timer-digit': 'timer-digit 0.35s ease-out',
        'pseudo-pop': 'pseudo-pop 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'pseudo-float': 'pseudo-float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
