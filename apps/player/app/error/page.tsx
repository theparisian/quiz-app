'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';

const AUTO_RELOAD_MS = 30_000;

function userFacingMessage(reason: string | null): string {
  if (reason === 'not_provisioned') {
    return "Ce lecteur doit encore être configuré par l'équipe technique avant utilisation.";
  }
  return 'Reprise dans quelques instants';
}

function shouldAutoReload(reason: string | null): boolean {
  return reason !== 'not_provisioned';
}

function PulseDots() {
  return (
    <>
      <div className="flex gap-5" aria-hidden>
        <span className="error-dot [--error-dot-delay:0ms]" />
        <span className="error-dot [--error-dot-delay:220ms]" />
        <span className="error-dot [--error-dot-delay:440ms]" />
      </div>
      <style>{`
        @keyframes error-dot-pulse {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(0.88);
          }
          55% {
            opacity: 1;
            transform: scale(1.05);
          }
        }
        .error-dot {
          display: inline-block;
          width: 0.9rem;
          height: 0.9rem;
          border-radius: 999px;
          background-color: rgb(229 231 235 / 0.55);
          box-shadow: 0 0 18px rgb(255 255 255 / 0.18);
          animation: error-dot-pulse 1.35s ease-in-out infinite;
          animation-delay: var(--error-dot-delay, 0ms);
        }
      `}</style>
    </>
  );
}

function ErrorContentInner() {
  const params = useSearchParams();
  const reason = params.get('reason');
  const cinemaName = useNucStore((s) => s.cinemaName);
  const cinemaLogoUrl = useNucStore((s) => s.cinemaLogoUrl);

  const displayName = cinemaName?.trim() || 'Cinéma';
  const message = userFacingMessage(reason);
  const reload = shouldAutoReload(reason);

  const [remainingSec, setRemainingSec] = useState<number | null>(() =>
    reload ? Math.ceil(AUTO_RELOAD_MS / 1000) : null,
  );

  useEffect(() => {
    if (!reload) return;

    const deadline = Date.now() + AUTO_RELOAD_MS;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSec(left);
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
    if (remainingSec <= 0) return 'Rechargement imminent…';
    return `Actualisation automatique dans environ ${remainingSec} secondes`;
  }, [reload, remainingSec]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-16 bg-gray-950 px-8 text-white">
      <div className="flex max-w-xl flex-col items-center gap-10 text-center">
        {cinemaLogoUrl ? (
          <img
            src={cinemaLogoUrl}
            alt={displayName}
            className="max-h-[26vh] max-w-[min(72vw,480px)] object-contain drop-shadow-[0_8px_32px_rgb(0_0_0/0.55)]"
          />
        ) : (
          <p className="text-[clamp(32px,5vw,80px)] font-semibold leading-tight tracking-tight text-gray-50">
            {displayName}
          </p>
        )}
        <div className="space-y-3">
          <p className="text-2xl font-medium text-gray-100 md:text-[1.67rem]">{message}</p>
          {reload && countdownLine ? (
            <p className="text-lg text-gray-500" aria-live="polite">
              {countdownLine}
            </p>
          ) : reason === 'not_provisioned' ? (
            <p className="text-lg text-gray-500">
              Une personne référente doit relancer la procédure d&apos;installation.
            </p>
          ) : null}
        </div>
      </div>
      {reload ? <PulseDots /> : null}
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-gray-950" />}>
      <ErrorContentInner />
    </Suspense>
  );
}
