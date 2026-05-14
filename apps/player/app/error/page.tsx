'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

const AUTO_RELOAD_MS = 30_000;

const ERROR_MESSAGES: Record<string, string> = {
  not_provisioned: "Ce lecteur doit encore être configuré par l'équipe technique.",
  heartbeat_failed: 'Connexion temporairement interrompue.',
};

function shouldAutoReload(reason: string): boolean {
  return reason !== 'not_provisioned';
}

function ScreenMessage({ reason }: { reason: string }) {
  const text =
    ERROR_MESSAGES[reason] ??
    'Une interruption courte est en cours ; le lecteur réessaie tout seul.';

  return (
    <div className="max-w-xl text-center text-xl leading-relaxed text-gray-400">
      {text}
      {reason === 'not_provisioned' ? (
        <p className="mt-4 text-base text-gray-500">Merci de contacter le support technique.</p>
      ) : null}
    </div>
  );
}

function ErrorInner() {
  const params = useSearchParams();
  const reasonRaw = params.get('reason');
  const reason = reasonRaw ?? 'unknown';
  const reload = shouldAutoReload(reason);

  const [remainingSec, setRemainingSec] = useState<number | null>(() =>
    reload ? Math.ceil(AUTO_RELOAD_MS / 1000) : null,
  );

  useEffect(() => {
    if (!reload) return;

    const deadline = Date.now() + AUTO_RELOAD_MS;

    const tick = () => {
      setRemainingSec(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };

    tick();
    const interval = window.setInterval(tick, 300);
    const timeout = window.setTimeout(() => window.location.reload(), AUTO_RELOAD_MS);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [reload]);

  const countdownLine = useMemo(() => {
    if (!reload || remainingSec === null) return null;
    if (remainingSec <= 0)
      return <p className="text-gray-400">Redémarrage du lecteur imminente…</p>;
    return (
      <p className="text-lg text-gray-300" aria-live="polite">
        Rechargement automatique environ dans {remainingSec} seconde{remainingSec > 1 ? 's' : ''}.
      </p>
    );
  }, [reload, remainingSec]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gray-950 px-6 text-white">
      <div className="text-6xl opacity-95">⚠</div>
      <div className="text-3xl font-semibold tracking-tight">Patience…</div>
      <ScreenMessage reason={reason} />
      {countdownLine}
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-gray-950" />}>
      <ErrorInner />
    </Suspense>
  );
}
