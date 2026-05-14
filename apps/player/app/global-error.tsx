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
          gap: '0.75rem',
          padding: '2rem',
        }}
      >
        <p style={{ fontSize: '1.375rem', fontWeight: 600, margin: 0 }}>
          Reprise dans quelques instants
        </p>
        <p style={{ fontSize: '1rem', opacity: 0.7, margin: 0 }}>
          Rechargement automatique dans environ {remainingSec} seconde
          {remainingSec !== 1 ? 's' : ''}.
        </p>
      </body>
    </html>
  );
}
