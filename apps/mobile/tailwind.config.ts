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
        mobileScreenEnter: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        mobileScreenExit: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        waitingDot: {
          '0%, 20%': { opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'mobile-screen-enter': 'mobileScreenEnter 0.45s ease-out both',
        'mobile-screen-exit': 'mobileScreenExit 300ms ease-in both',
        'waiting-dot': 'waitingDot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
