'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_MOBILE;
    if (dsn) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <h1>Une erreur est survenue</h1>
        <p>Veuillez recharger la page.</p>
      </body>
    </html>
  );
}
