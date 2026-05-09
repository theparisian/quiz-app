'use client';

import { useLiveSessionStore } from '@/lib/stores/live-session-store';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'http://localhost:3002';

interface LobbyViewProps {
  onStart: () => void;
  onAbort: () => void;
  starting?: boolean;
}

export function LobbyView({ onStart, onAbort, starting }: LobbyViewProps) {
  const slugShort = useLiveSessionStore((s) => s.slugShort);
  const players = useLiveSessionStore((s) => s.players);

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Code session</p>
        <p className="mt-2 font-mono text-7xl font-bold tracking-widest text-gray-900">
          {slugShort}
        </p>
      </div>

      <div className="text-center text-sm text-gray-500">
        <p>Les joueurs peuvent rejoindre via :</p>
        <p className="mt-1">
          le code <span className="font-mono font-bold">{slugShort}</span> sur{' '}
          <span className="font-medium text-blue-600">{PLAY_URL.replace(/^https?:\/\//, '')}</span>
        </p>
      </div>

      <div className="w-full max-w-lg">
        <h3 className="text-sm font-medium text-gray-700">Joueurs connectés ({players.length})</h3>
        {players.length > 0 ? (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border bg-white">
            {players.map((p) => (
              <div
                key={p.playerId}
                className="flex items-center justify-between border-b px-4 py-2 last:border-b-0"
              >
                <span className="text-sm font-medium text-gray-800">{p.pseudo}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-400">En attente de joueurs...</p>
        )}
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onAbort}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={players.length === 0 || starting}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {starting ? 'Démarrage...' : 'Démarrer la session'}
        </button>
      </div>
    </div>
  );
}
