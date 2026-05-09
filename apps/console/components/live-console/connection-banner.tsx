'use client';

import { useLiveSessionStore } from '@/lib/stores/live-session-store';

export function LiveConnectionBanner() {
  const status = useLiveSessionStore((s) => s.connectionStatus);

  if (status === 'connected') return null;

  const label =
    status === 'reconnecting'
      ? 'Reconnexion au serveur en cours…'
      : 'Connexion temps réel perdue — reconnexion automatique';

  const color =
    status === 'reconnecting'
      ? 'bg-amber-100 text-amber-950 border-amber-300'
      : 'bg-red-100 text-red-900 border-red-300';

  return (
    <div
      role="status"
      className={`mb-4 rounded-lg border px-4 py-2 text-center text-sm font-medium ${color}`}
    >
      {label}
    </div>
  );
}
