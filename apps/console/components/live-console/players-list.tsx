'use client';

import { useState } from 'react';
import { useLiveSessionStore, type PlayerLive } from '@/lib/stores/live-session-store';

export function PlayersList() {
  const players = useLiveSessionStore((s) => s.players);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');

  const sorted = [...players].sort((a, b) => b.scoreTotal - a.scoreTotal);
  const filtered = search
    ? sorted.filter((p) => p.pseudo.toLowerCase().includes(search.toLowerCase()))
    : sorted;
  const displayed = showAll ? filtered : filtered.slice(0, 8);

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Joueurs ({players.length})</h3>
        {players.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            {showAll ? 'Top 8' : 'Tout afficher'}
          </button>
        )}
      </div>

      {showAll && (
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
        />
      )}

      <div className={`mt-2 space-y-1 ${showAll ? 'max-h-96 overflow-y-auto' : ''}`}>
        {displayed.map((p, i) => (
          <PlayerRow key={p.playerId} player={p} rank={i + 1} />
        ))}
        {!showAll && players.length > 8 && (
          <p className="pt-1 text-center text-xs text-gray-400">+{players.length - 8} joueurs</p>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ player, rank }: { player: PlayerLive; rank: number }) {
  return (
    <div className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-gray-50">
      <span className="text-gray-600">
        <span className="mr-2 inline-block w-5 text-right text-xs text-gray-400">#{rank}</span>
        {player.pseudo}
      </span>
      <span className="font-mono text-xs text-gray-500">{player.scoreTotal} pts</span>
    </div>
  );
}
