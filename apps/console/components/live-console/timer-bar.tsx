'use client';

import { useState, useEffect, useRef } from 'react';
import { useLiveSessionStore } from '@/lib/stores/live-session-store';

export function TimerBar() {
  const remainingMs = useLiveSessionStore((s) => s.remainingMs);
  const questionTimeLimitMs = useLiveSessionStore((s) => s.questionTimeLimitMs);
  const [displayMs, setDisplayMs] = useState(remainingMs);
  const baselineRef = useRef({ ms: remainingMs, at: performance.now() });

  useEffect(() => {
    baselineRef.current = { ms: remainingMs, at: performance.now() };
  }, [remainingMs]);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const now = performance.now();
      const elapsed = now - baselineRef.current.at;
      setDisplayMs(Math.max(0, baselineRef.current.ms - elapsed));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (questionTimeLimitMs === 0) return null;

  const pct = Math.max(0, Math.min(100, (displayMs / questionTimeLimitMs) * 100));
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
