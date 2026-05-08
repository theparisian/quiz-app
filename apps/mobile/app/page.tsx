'use client';

import { useSocket } from '@quiz-app/socket-client';
import { ConnectionStatus } from '@quiz-app/ui';

export default function MobilePage() {
  const { connected, sendPing, lastPong } = useSocket('/mobile');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-3xl font-bold text-brand-600">Hello Mobile</h1>
      <p className="text-gray-500">Interface joueur (téléphone)</p>
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
