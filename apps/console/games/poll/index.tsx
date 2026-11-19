'use client';

import { ANSWER_COLORS, ANSWER_POSITIONS } from '@quiz-app/design-tokens';
import { pollPercentages, type PollConsoleView } from '@quiz-app/validation';
import { useCountdown } from '@quiz-app/ui';
import type { GameRendererProps } from '../types';

/**
 * Sondage dans la console : question en cours, votes reçus, échéance, puis résultats. Ne dépend
 * que de la vue (aucun contenu secret : le sondage n'a pas de bonne réponse).
 */
export default function PollConsole({ view, clockOffsetMs }: GameRendererProps<PollConsoleView>) {
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs);
  const seconds = remainingMs !== null ? Math.ceil(Math.max(0, remainingMs) / 1000) : null;
  const percents = view.phase === 'question' ? null : pollPercentages(view.counts);

  const status =
    view.phase === 'question'
      ? 'Vote en cours'
      : view.phase === 'results'
        ? 'Résultats affichés'
        : 'Sondage terminé';

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-500">
          {view.questionIndex + 1}. Question — {status}
        </span>
        {seconds !== null && (
          <span className="font-mono text-gray-900">
            {view.phase === 'question' ? 'Fin du vote' : 'Suite'} : {seconds}s
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold text-gray-900">{view.question.text}</p>

      <div className="mt-4 flex flex-col gap-2">
        {view.question.options.map((option, index) => {
          const letter = ANSWER_POSITIONS[index] ?? 'A';
          const votes =
            view.phase === 'question'
              ? null
              : (view.counts.find((c) => c.optionId === option.id)?.votes ?? 0);
          const percent = percents?.get(option.id) ?? 0;
          return (
            <div
              key={option.id}
              className="relative overflow-hidden rounded-md border border-gray-200 px-4 py-3 text-sm text-gray-800"
            >
              {votes !== null && (
                <span
                  className="absolute inset-y-0 left-0 opacity-25"
                  style={{ width: `${percent}%`, backgroundColor: ANSWER_COLORS[letter].bg }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center justify-between gap-3">
                <span>
                  <span className="font-bold" style={{ color: ANSWER_COLORS[letter].bg }}>
                    {letter}.
                  </span>{' '}
                  {option.text}
                </span>
                {votes !== null && (
                  <span className="font-mono text-gray-700">
                    {votes} · {percent} %
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-gray-500">
        Votes reçus : {view.totalVotes} / {view.totalPlayers}
      </p>
    </div>
  );
}
