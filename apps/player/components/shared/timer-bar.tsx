'use client';

import { useEffect, useRef, useState } from 'react';

interface TimerBarProps {
  startedAt: number;
  totalMs: number;
}

export default function TimerBar({ startedAt, totalMs }: TimerBarProps) {
  const rafRef = useRef<number>(0);
  const [progress, setProgress] = useState(1);
  const [remainingSec, setRemainingSec] = useState(Math.ceil(totalMs / 1000));

  useEffect(() => {
    function tick() {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, totalMs - elapsed);
      const pct = remaining / totalMs;
      setProgress(pct);
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

  const color = remainingSec <= 2 ? '#ef4444' : remainingSec <= 5 ? '#f59e0b' : '#3b82f6';

  return (
    <div className="flex items-center gap-4">
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        ⏱ {remainingSec}s
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-colors duration-300"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
