'use client';

import { formatBurgerTime, type BurgerConsoleView } from '@quiz-app/validation';
import { useCountdown } from '@quiz-app/ui';
import type { GameRendererProps } from '../types';

/**
 * Burger dans la console : phase, temps restant, burgers terminés et course des premiers. Ne
 * dépend que de la vue (la recette n'y apparaît qu'aux résultats).
 */
export default function BurgerConsole({
  view,
  clockOffsetMs,
}: GameRendererProps<BurgerConsoleView>) {
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs);
  const seconds = remainingMs !== null ? Math.ceil(Math.max(0, remainingMs) / 1000) : null;
  const status =
    view.phase === 'countdown'
      ? 'Départ imminent'
      : view.phase === 'build'
        ? 'Course en cours'
        : view.phase === 'results'
          ? 'Résultats affichés'
          : 'Course terminée';
  const racers = view.phase === 'countdown' ? [] : view.racers.slice(0, 10);

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-500">Burger — {status}</span>
        {seconds !== null && (
          <span className="font-mono text-gray-900">
            {view.phase === 'build' ? 'Fin de la course' : 'Suite'} : {seconds}s
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold text-gray-900">
        {view.finishedCount} / {view.totalPlayers} burgers terminés
      </p>

      {racers.length > 0 && (
        <ol className="mt-4 flex flex-col gap-2">
          {racers.map((r) => (
            <li key={r.playerId} className="flex items-center gap-3 text-sm text-gray-800">
              <span className="w-6 text-right font-mono text-gray-500">{r.rank}.</span>
              <span className="w-40 truncate font-medium">{r.pseudo}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span
                  className={`block h-full rounded-full ${r.finishMs !== null ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${(r.correctCount / view.totalLayers) * 100}%` }}
                />
              </span>
              <span className="w-20 text-right font-mono text-gray-700">
                {r.finishMs !== null
                  ? formatBurgerTime(r.finishMs)
                  : `${r.correctCount}/${view.totalLayers}`}
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
