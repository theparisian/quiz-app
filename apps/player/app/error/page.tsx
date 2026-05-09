'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  not_provisioned: "Ce NUC n'est pas provisionné. Vérifiez l'URL de démarrage.",
  heartbeat_failed: 'Connexion au serveur perdue. Redémarrage automatique dans 30 secondes.',
};

function ErrorContent() {
  const params = useSearchParams();
  const reason = params.get('reason') ?? 'unknown';

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gray-950 text-white">
      <div className="text-6xl">⚠</div>
      <div className="text-3xl font-bold">Erreur NUC</div>
      <div className="max-w-md text-center text-xl text-gray-400">
        {ERROR_MESSAGES[reason] ?? `Erreur inconnue (${reason})`}
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={null}>
      <ErrorContent />
    </Suspense>
  );
}
