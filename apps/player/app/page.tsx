'use client';

import { useSocket } from '@quiz-app/socket-client';
import { ConnectionStatus } from '@quiz-app/ui';

export default function PlayerPage() {
  const { connected, sendPing, lastPong } = useSocket('/player');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold text-brand-400">Hello Player</h1>
      <p className="text-gray-400">Interface écran cinéma (NUC)</p>
      <ConnectionStatus connected={connected} />
      <button
        onClick={sendPing}
        className="rounded-lg bg-brand-600 px-4 py-2 text-white transition hover:bg-brand-700"
      >
        Envoyer Ping
      </button>
      {lastPong && (
        <p className="text-sm text-gray-500">
          Pong reçu : {lastPong.serverTime}
        </p>
      )}
    </main>
  );
}
