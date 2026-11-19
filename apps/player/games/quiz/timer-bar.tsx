'use client';

import { TIMER_CRITICAL_THRESHOLD_SEC, TIMER_URGENT_THRESHOLD_SEC } from '@quiz-app/design-tokens';

interface TimerBarProps {
  /** Temps restant (ms), animé par l'appelant (`useCountdown` en mode `frame`, 60 i/s). */
  remainingMs: number;
  totalMs: number;
}

const SIZE = 104;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TimerBar({ remainingMs, totalMs }: TimerBarProps) {
  const remaining = Math.max(0, remainingMs);
  const progress = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const remainingSec = Math.ceil(remaining / 1000);

  const isUrgent = remainingSec <= TIMER_URGENT_THRESHOLD_SEC && remainingSec > 0;
  const isCritical = remainingSec <= TIMER_CRITICAL_THRESHOLD_SEC && remainingSec > 0;
  const color = isCritical ? '#ef4444' : isUrgent ? '#f59e0b' : '#3b82f6';
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${
        isCritical ? 'animate-timer-critical' : isUrgent ? 'animate-timer-urgent' : ''
      }`}
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
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="transition-[stroke] duration-300"
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span
          key={remainingSec}
          className={`font-black tabular-nums leading-none transition-colors duration-300 ${
            isCritical
              ? 'animate-timer-digit text-4xl text-red-400'
              : isUrgent
                ? 'animate-timer-digit text-4xl text-amber-400'
                : 'text-4xl text-white'
          }`}
        >
          {remainingSec}
        </span>
      </div>
    </div>
  );
}
