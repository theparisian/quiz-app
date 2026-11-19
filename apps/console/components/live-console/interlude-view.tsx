'use client';

import { selectInterlude, useLiveSessionStore } from '@/lib/stores/live-session-store';

/** Entracte entre deux manches : classement de la manche terminée, la suivante va commencer. */
export function InterludeView() {
  const board = useLiveSessionStore(selectInterlude);
  if (!board) return null;
  const top = board.scoreboard.slice(0, 5);

  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-gray-900">
        Manche {board.position}/{board.totalRounds} terminée
      </p>
      <p className="mt-1 text-sm text-gray-500">La manche suivante va commencer.</p>
      {top.length > 0 && (
        <ol className="mt-3 space-y-1 text-sm">
          {top.map((entry, i) => (
            <li key={entry.playerId} className="flex justify-between gap-3">
              <span className="truncate text-gray-900">
                {i + 1}. {entry.pseudo}
              </span>
              <span className="shrink-0 text-gray-500">
                {entry.scoreTotal} pts (+{entry.scoreThisRound})
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
