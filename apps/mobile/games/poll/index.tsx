'use client';

import { useState, type ReactNode } from 'react';
import { pollPercentages, type PollMobileView } from '@quiz-app/validation';
import { AppLogo, useCountdown } from '@quiz-app/ui';
import { ScreenTransition } from '@/components/screen-transition';
import type { GameRendererProps } from '../types';
import PollOption from './poll-option';

/** Libellés des refus d'un vote (codes de `game:action`), en tutoiement. */
export function voteErrorMessage(code: string): string {
  switch (code) {
    case 'PHASE_CLOSED':
    case 'WRONG_ROUND':
    case 'NO_ACTIVE_ROUND':
      return 'Trop tard, le vote est terminé.';
    case 'ALREADY_VOTED':
      return 'Tu as déjà voté pour cette question.';
    case 'SESSION_PAUSED':
      return 'La partie est en pause, réessaie à la reprise.';
    case 'TIMEOUT':
    case 'NOT_CONNECTED':
      return 'Connexion lente : ton vote n’est pas parti, réessaie.';
    case 'RATE_LIMITED':
      return 'Doucement ! Réessaie dans un instant.';
    default:
      return 'Ton vote n’a pas pu être enregistré, réessaie.';
  }
}

/**
 * Rendu mobile du sondage : ne dépend que de la vue. Le vote s'affiche tout de suite
 * (optimiste) ; la vue suivante fait foi.
 */
export default function PollMobileGame({
  view,
  clockOffsetMs,
  sendAction,
}: GameRendererProps<PollMobileView>) {
  const [optimistic, setOptimistic] = useState<{ base: PollMobileView; optionId: string } | null>(
    null,
  );
  const [error, setError] = useState<{ base: PollMobileView; message: string } | null>(null);
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs);
  const remainingSec = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;

  const pendingOptionId = optimistic?.base === view ? optimistic.optionId : null;
  const errorMessage = error?.base === view ? error.message : null;
  const myVote = view.myVote ?? (view.phase === 'question' ? pendingOptionId : null);

  function handleVote(optionId: string) {
    if (!sendAction || view.phase !== 'question' || myVote) return;
    const base = view;
    setOptimistic({ base, optionId });
    setError(null);
    void sendAction('vote', { questionId: view.question.id, optionId }).then((ack) => {
      if (ack.ok) return;
      setOptimistic((cur) => (cur?.base === base ? null : cur));
      setError({ base, message: voteErrorMessage(ack.code) });
    });
  }

  const header = (
    <header className="flex shrink-0 flex-col items-center px-4 pb-3 pt-4">
      <AppLogo className="h-8" variant="light" />
      <p className="mt-3 text-sm text-gray-400">
        Sondage · Question {view.questionIndex + 1} / {view.totalQuestions}
      </p>
    </header>
  );

  let screenKey: string;
  let screen: ReactNode;

  if (view.phase === 'question') {
    screenKey = myVote ? `voted-${view.questionIndex}` : `question-${view.questionIndex}`;
    screen = (
      <div className="flex flex-col">
        {header}
        <div className="px-4 pb-6 pt-2">
          <h2 className="text-center text-xl font-bold leading-snug">{view.question.text}</h2>
          {myVote && (
            <p className="mt-4 text-center text-lg font-semibold text-green-300">
              Vote enregistré !
            </p>
          )}
          <div
            className="mt-6 flex flex-col gap-2.5"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {view.question.options.map((option, index) => (
              <PollOption
                key={option.id}
                index={index}
                text={option.text}
                state={myVote ? (option.id === myVote ? 'chosen' : 'dimmed') : 'idle'}
                {...(myVote ? {} : { onTap: () => handleVote(option.id) })}
              />
            ))}
          </div>
          {errorMessage && (
            <p role="alert" className="text-center text-sm text-red-300">
              {errorMessage}
            </p>
          )}
          {remainingSec !== null && remainingSec > 0 && (
            <p className="text-brand-400 mt-2 text-center text-sm">
              {myVote ? 'Résultats dans' : 'Encore'} ~{remainingSec}s
            </p>
          )}
        </div>
      </div>
    );
  } else {
    const percents = pollPercentages(view.counts);
    const isDone = view.phase === 'done';
    screenKey = isDone ? 'done' : `results-${view.questionIndex}`;
    screen = (
      <div className="flex flex-col">
        {header}
        <div className="px-4 pb-6 pt-2">
          <h2 className="text-center text-xl font-bold leading-snug">{view.question.text}</h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            {view.totalVotes} vote{view.totalVotes > 1 ? 's' : ''}
            {view.myVote ? '' : ' · tu n’as pas voté'}
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            {view.question.options.map((option, index) => (
              <PollOption
                key={option.id}
                index={index}
                text={option.id === view.myVote ? `${option.text} (ton vote)` : option.text}
                state={option.id === view.myVote ? 'chosen' : 'idle'}
                percent={percents.get(option.id) ?? 0}
              />
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-gray-400">
            {isDone
              ? 'Merci pour tes votes ! Les résultats arrivent…'
              : remainingSec !== null && remainingSec > 0
                ? `Suite dans ~${remainingSec}s`
                : ''}
          </p>
        </div>
      </div>
    );
  }

  return <ScreenTransition screenKey={screenKey}>{screen}</ScreenTransition>;
}
