'use client';

import { useEffect, useRef, useState } from 'react';

interface QuestionTimerProps {
  startedAt: number;
  totalMs: number;
}

const SIZE = 132;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function QuestionTimer({ startedAt, totalMs }: QuestionTimerProps) {
  const rafRef = useRef<number>(0);
  const [progress, setProgress] = useState(1);
  const [remainingSec, setRemainingSec] = useState(Math.ceil(totalMs / 1000));

  useEffect(() => {
    function tick() {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, totalMs - elapsed);
      setProgress(remaining / totalMs);
      setRemainingSec(Math.ceil(remaining / 1000));

      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startedAt, totalMs]);

  const isUrgent = remainingSec <= 5 && remainingSec > 0;
  const isCritical = remainingSec <= 2 && remainingSec > 0;
  const strokeColor = isCritical ? '#ef4444' : isUrgent ? '#f59e0b' : '#6366f1';
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div
      className="relative inline-flex flex-col items-center"
      style={{ width: SIZE, height: SIZE }}
      aria-live="polite"
      aria-label={`${remainingSec} secondes restantes`}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="transition-[stroke] duration-300"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-black tabular-nums leading-none ${
            isCritical
              ? 'text-5xl text-red-400'
              : isUrgent
                ? 'text-5xl text-amber-400'
                : 'text-5xl text-white'
          }`}
        >
          {remainingSec}
        </span>
        <span className="mt-1 text-xs text-gray-400">secondes</span>
      </div>
    </div>
  );
}
