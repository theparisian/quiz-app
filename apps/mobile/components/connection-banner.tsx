'use client';

import { usePlayerStore } from '@/lib/stores/player-store';

export function ConnectionBanner() {
  const status = usePlayerStore((s) => s.connectionStatus);

  if (status === 'connected') return null;

  const label =
    status === 'reconnecting'
      ? 'Reconnexion au serveur…'
      : 'Connexion perdue — nouvelle tentative automatique';

  const color = status === 'reconnecting' ? 'bg-amber-500 text-amber-950' : 'bg-red-600 text-white';

  return (
    <div
      role="status"
      className={`sticky top-0 z-50 w-full px-3 py-2 text-center text-sm font-medium ${color}`}
    >
      {label}
    </div>
  );
}
