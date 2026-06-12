'use client';

import { useEffect, useState } from 'react';

interface LateWaitScreenProps {
  timerRemainingMs?: number | null;
}

export default function LateWaitScreen({ timerRemainingMs }: LateWaitScreenProps) {
  const [remainingSec, setRemainingSec] = useState<number | null>(
    timerRemainingMs != null ? Math.max(1, Math.ceil(timerRemainingMs / 1000)) : null,
  );

  useEffect(() => {
    if (timerRemainingMs == null) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, timerRemainingMs - elapsed);
      setRemainingSec(left > 0 ? Math.ceil(left / 1000) : null);
    }, 500);
    return () => clearInterval(interval);
  }, [timerRemainingMs]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="animate-pulse text-4xl">🎬</div>
      <div className="text-2xl font-bold">Tu es dans la partie !</div>
      <p className="text-lg text-gray-400">La prochaine question arrive…</p>
      {remainingSec != null && remainingSec > 0 && (
        <p className="text-brand-400 text-sm">Prochaine question dans ~{remainingSec}s</p>
      )}
    </div>
  );
}
