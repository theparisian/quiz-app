'use client';

import { useNucStore } from '@/lib/stores/nuc-store';

export function NucConnectionBanner() {
  const status = useNucStore((s) => s.connectionStatus);

  if (status === 'connected') return null;

  const label =
    status === 'reconnecting'
      ? 'Reconnexion au serveur…'
      : 'Connexion au serveur perdue — reconnexion automatique';

  const color = status === 'reconnecting' ? 'bg-amber-500 text-amber-950' : 'bg-red-600 text-white';

  return (
    <div
      role="status"
      className={`absolute left-0 right-0 top-0 z-[100] px-4 py-2 text-center text-sm font-medium ${color}`}
    >
      {label}
    </div>
  );
}
