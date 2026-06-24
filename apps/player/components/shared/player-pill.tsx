'use client';

import type { CSSProperties } from 'react';

interface PlayerPillProps {
  pseudo: string;
  index: number;
  seed?: string;
}

// Palette vive : couleur attribuée de façon déterministe (stable au re-render / reconnexion).
const PSEUDO_COLORS = [
  '#10b981',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#f97316',
  '#06b6d4',
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default function PlayerPill({ pseudo, index, seed }: PlayerPillProps) {
  const h = hashSeed(seed ?? pseudo);
  const color = PSEUDO_COLORS[h % PSEUDO_COLORS.length];
  const floatDuration = 3.4 + (h % 26) / 10; // 3.4s → 5.9s
  const floatDelay = (h % 17) / 10; // 0 → 1.6s
  const rotation = ((h % 7) - 3) * 1.2; // -3.6deg → +3.6deg

  return (
    <span
      className="animate-pseudo-pop inline-block"
      style={{ animationDelay: `${Math.min(index, 40) * 0.06}s` }}
    >
      <span
        className="animate-pseudo-float inline-block rounded-full px-6 py-2.5 text-2xl font-semibold text-white shadow-lg ring-1 ring-white/20"
        style={
          {
            backgroundColor: color,
            animationDuration: `${floatDuration}s`,
            animationDelay: `${floatDelay}s`,
            '--pseudo-rot': `${rotation}deg`,
          } as CSSProperties
        }
      >
        {pseudo}
      </span>
    </span>
  );
}
