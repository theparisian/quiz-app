'use client';

import { formatTowerHeight, type TowerConsoleView } from '@quiz-app/validation';
import { useCountdown } from '@quiz-app/ui';
import type { GameRendererProps } from '../types';

/**
 * Tour de livres dans la console : phase, temps restant et hauteur des tours des premiers. Ne
 * dépend que de la vue.
 */
export default function TowerConsole({ view, clockOffsetMs }: GameRendererProps<TowerConsoleView>) {
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs);
  const seconds = remainingMs !== null ? Math.ceil(Math.max(0, remainingMs) / 1000) : null;
  const status =
    view.phase === 'countdown'
      ? 'Départ imminent'
      : view.phase === 'build'
        ? 'Construction en cours'
        : view.phase === 'results'
          ? 'Résultats affichés'
          : 'Construction terminée';
  const racers = view.phase === 'countdown' ? [] : view.racers.slice(0, 10);
  const top = Math.max(1, view.topHeight);

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-500">Tour de livres — {status}</span>
        {seconds !== null && (
          <span className="font-mono text-gray-900">
            {view.phase === 'build' ? 'Fin de la construction' : 'Suite'} : {seconds}s
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold text-gray-900">
        Plus haute tour : {formatTowerHeight(view.topHeight)} · {view.totalPlayers} joueur
        {view.totalPlayers > 1 ? 's' : ''}
      </p>

      {racers.length > 0 && (
        <ol className="mt-4 flex flex-col gap-2">
          {racers.map((r) => (
            <li key={r.playerId} className="flex items-center gap-3 text-sm text-gray-800">
              <span className="w-6 text-right font-mono text-gray-500">{r.rank}.</span>
              <span className="w-40 truncate font-medium">{r.pseudo}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span
                  className={`block h-full rounded-full ${r.rank === 1 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${(r.heightCm / top) * 100}%` }}
                />
              </span>
              <span className="w-20 text-right font-mono text-gray-700">
                {formatTowerHeight(r.heightCm)}
              </span>
              <span className="w-16 text-right font-mono text-gray-400" title="Effondrements">
                💥 {r.collapses}
              </span>
              {r.points !== null && (
                <span className="w-16 text-right font-mono text-gray-500">+{r.points}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
