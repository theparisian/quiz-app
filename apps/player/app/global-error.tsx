'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

const AUTO_RELOAD_MS = 30_000;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_PLAYER;
    if (dsn) {
      Sentry.captureException(error);
    }
  }, [error]);

  const [remainingSec, setRemainingSec] = useState(() => Math.ceil(AUTO_RELOAD_MS / 1000));

  useEffect(() => {
    const deadline = Date.now() + AUTO_RELOAD_MS;
    const tick = () => setRemainingSec(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 320);
    const timeout = window.setTimeout(() => window.location.reload(), AUTO_RELOAD_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#030712',
          color: '#f9fafb',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
        }}
      >
        <p style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
          Reprise dans quelques instants
        </p>
        <p style={{ fontSize: '1rem', opacity: 0.68, margin: 0 }}>
          Actualisation automatique sous environ {remainingSec} seconde
          {remainingSec !== 1 ? 's' : ''}.
        </p>
        <div
          style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}
        >
          <PulseDot delay="0ms" />
          <PulseDot delay="210ms" />
          <PulseDot delay="420ms" />
        </div>

        <style>{`
          @keyframes globalPulse {
            0%,
            100% {
              opacity: 0.35;
              transform: scale(0.9);
            }
            52% {
              opacity: 1;
              transform: scale(1.05);
            }
          }
          .pulse-dot-global {
            display: inline-block;
            width: 0.72rem;
            height: 0.72rem;
            border-radius: 999px;
            background-color: rgb(229 231 235 / 0.55);
            box-shadow: 0 0 16px rgb(255 255 255 / 0.16);
            animation-name: globalPulse;
            animation-duration: 1.3s;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
          }
        `}</style>
      </body>
    </html>
  );
}

function PulseDot({ delay }: { delay: string }) {
  return (
    <span
      className="pulse-dot-global"
      style={{
        animationDelay: delay,
      }}
      aria-hidden
    />
  );
}
