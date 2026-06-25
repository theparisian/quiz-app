'use client';

import { useEffect, useState } from 'react';

const CONFETTI_COLORS = ['#F1C40F', '#FFD700', '#FFFFFF', '#E74C3C', '#3498DB', '#27AE60'];

interface ConfettiPiece {
  left: number;
  delay: number;
  duration: number;
  width: number;
  height: number;
  color: string;
  rotate: number;
  drift: number;
  round: boolean;
}

/**
 * Pluie de confettis purement CSS. Les pièces sont générées après le montage
 * (côté client) pour éviter tout décalage d'hydratation et tomber sur le NUC.
 */
export default function ConfettiBurst({
  count = 130,
  startDelay = 0,
}: {
  count?: number;
  startDelay?: number;
}) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    const generated: ConfettiPiece[] = Array.from({ length: count }, () => {
      const size = 7 + Math.random() * 9;
      return {
        left: Math.random() * 100,
        delay: startDelay + Math.random() * 1.4,
        duration: 3 + Math.random() * 2.6,
        width: size,
        height: size * (0.4 + Math.random() * 0.4),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? '#FFD700',
        rotate: 360 + Math.random() * 720,
        drift: (Math.random() - 0.5) * 200,
        round: Math.random() > 0.7,
      };
    });
    setPieces(generated);
  }, [count, startDelay]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="animate-confetti-fall absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: `${p.width}px`,
            height: `${p.height}px`,
            backgroundColor: p.color,
            borderRadius: p.round ? '9999px' : '2px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--confetti-drift' as string]: `${p.drift}px`,
            ['--confetti-rot' as string]: `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}
