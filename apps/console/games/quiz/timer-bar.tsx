'use client';

import { useCountdown } from '@quiz-app/ui';

interface TimerBarProps {
  endsAt: string | null;
  pausedRemainingMs: number | null;
  clockOffsetMs: number;
  /** Durée totale de la question (proportion de la barre). */
  timeLimitMs: number;
}

export function TimerBar({ endsAt, pausedRemainingMs, clockOffsetMs, timeLimitMs }: TimerBarProps) {
  // Barre fluide (60 i/s) comme avant ; figée pendant une pause, vide une fois la question close.
  const displayMs = useCountdown(endsAt, pausedRemainingMs, clockOffsetMs, { mode: 'frame' }) ?? 0;

  if (timeLimitMs === 0) return null;

  const pct = Math.max(0, Math.min(100, (displayMs / timeLimitMs) * 100));
  const seconds = Math.ceil(displayMs / 1000);

  let color = 'bg-green-500';
  if (displayMs <= 2000) color = 'bg-red-500';
  else if (displayMs <= 5000) color = 'bg-orange-500';

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">Timer</span>
        <span className="font-mono text-gray-900">{seconds}s</span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-colors ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
