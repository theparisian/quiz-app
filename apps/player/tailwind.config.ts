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
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'podium-rise': {
          '0%': { opacity: '0', transform: 'translateY(90px) scale(0.92)' },
          '60%': { opacity: '1' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'winner-pop': {
          '0%': { opacity: '0', transform: 'translateY(60px) scale(0.8)' },
          '65%': { opacity: '1', transform: 'translateY(-8px) scale(1.04)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'crown-drop': {
          '0%': { opacity: '0', transform: 'translateY(-34px) rotate(-14deg) scale(0.5)' },
          '70%': { opacity: '1', transform: 'translateY(5px) rotate(5deg) scale(1.08)' },
          '100%': { opacity: '1', transform: 'translateY(0) rotate(0deg) scale(1)' },
        },
        'laurel-left': {
          '0%': { opacity: '0', transform: 'translateX(28px) rotate(18deg) scale(0.7)' },
          '100%': { opacity: '1', transform: 'translateX(0) rotate(0deg) scale(1)' },
        },
        'laurel-right': {
          '0%': {
            opacity: '0',
            transform: 'translateX(-28px) scaleX(-1) rotate(18deg) scale(0.7)',
          },
          '100%': { opacity: '1', transform: 'scaleX(-1) translateX(0) rotate(0deg) scale(1)' },
        },
        'winner-aura': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.08)' },
        },
        'bonus-pop': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.85)' },
          '70%': { opacity: '1', transform: 'translateY(0) scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'confetti-fall': {
          '0%': { opacity: '0', transform: 'translate3d(0, -12vh, 0) rotate(0deg)' },
          '8%': { opacity: '1' },
          '100%': {
            opacity: '1',
            transform:
              'translate3d(var(--confetti-drift, 0px), 112vh, 0) rotate(var(--confetti-rot, 720deg))',
          },
        },
        'correct-highlight': {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(34, 197, 94, 0)' },
          '40%': { transform: 'scale(1.03)', boxShadow: '0 0 40px rgba(34, 197, 94, 0.7)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 24px rgba(34, 197, 94, 0.5)' },
        },
        'content-fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
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
        'fade-in-up': 'fade-in-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'podium-rise': 'podium-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'winner-pop': 'winner-pop 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'crown-drop': 'crown-drop 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'laurel-left': 'laurel-left 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'laurel-right': 'laurel-right 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'winner-aura': 'winner-aura 2.6s ease-in-out infinite',
        'bonus-pop': 'bonus-pop 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'confetti-fall': 'confetti-fall 4s linear forwards',
        'correct-highlight': 'correct-highlight 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'content-fade-out': 'content-fade-out 0.5s ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
