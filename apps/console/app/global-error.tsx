'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_CONSOLE;
    if (dsn) {
      Sentry.captureException(error);
    }
    // #region agent log
    fetch('http://127.0.0.1:7376/ingest/bb886729-3067-42e7-8e36-4c5165f027e2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6b2aa5' },
      body: JSON.stringify({
        sessionId: '6b2aa5',
        runId: 'pre-fix',
        hypothesisId: 'ALL',
        location: 'global-error.tsx:useEffect',
        message: 'GlobalError caught',
        data: {
          errorMessage: error.message,
          errorName: error.name,
          digest: error.digest ?? null,
          stackPreview: error.stack?.slice(0, 500) ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <h1>Une erreur est survenue</h1>
        <p>Veuillez recharger la page.</p>
        <pre style={{ fontSize: 12, color: '#666', marginTop: 16, whiteSpace: 'pre-wrap' }}>
          {error.message}
        </pre>
      </body>
    </html>
  );
}
