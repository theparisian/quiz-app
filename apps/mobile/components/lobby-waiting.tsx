'use client';

import { usePlayerStore } from '@/lib/stores/player-store';

export default function LobbyWaiting() {
  const pseudo = usePlayerStore((s) => s.pseudo);
  const players = usePlayerStore((s) => s.players);
  const totalPlayers = usePlayerStore((s) => s.totalPlayers);
  const prizes = usePlayerStore((s) => s.prizes);
  const rank1 = prizes?.rank1;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mb-2 text-lg text-gray-400">Tu participes en tant que :</div>
        <div className="bg-brand-600/20 text-brand-400 inline-block rounded-full px-6 py-2 text-xl font-bold">
          {pseudo}
        </div>
      </div>

      {rank1 && (
        <div className="mb-4 text-center text-sm text-gray-300">
          À gagner : {rank1.label} 🥇
          {rank1.isSuperPrize && (
            <span className="ml-2 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-400">
              Super lot
            </span>
          )}
        </div>
      )}

      {prizes?.all && (
        <div className="mb-6 text-center text-sm text-emerald-300">
          🎁 Un lot pour tous les joueurs : {prizes.all.label}
        </div>
      )}

      <div className="mb-8 text-gray-400">On attend les autres joueurs...</div>

      <div className="w-full max-w-xs rounded-xl bg-white/5 p-4">
        <div className="mb-3 text-sm font-semibold text-gray-400">
          {totalPlayers} joueur{totalPlayers > 1 ? 's' : ''} connecté{totalPlayers > 1 ? 's' : ''}
        </div>
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <span key={p.playerId} className="rounded-full bg-white/10 px-3 py-1 text-sm">
              {p.pseudo}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-gray-600">
        Le projectionniste va bientôt lancer la session !
      </div>
    </div>
  );
}
