'use client';

import type { QuizConsoleView } from '@quiz-app/validation';
import type { QuizFull } from '@/lib/stores/live-session-store';
import type { GameRendererProps } from '../types';
import { quizHighlightedAnswerIds } from './console-rules';
import { QuestionPreview } from './question-preview';
import { TimerBar } from './timer-bar';

/**
 * Quiz dans la console : question courante, bonnes réponses, compteur de réponses et barre de
 * temps. Ne dépend que de la vue, plus du quiz complet chargé par `GET /api/sessions/:id/full`
 * (la vue ne contient la bonne réponse qu'en révélation ; la console la montre dès la question).
 */
export default function QuizConsole({
  view,
  clockOffsetMs,
  content,
}: GameRendererProps<QuizConsoleView, QuizFull>) {
  // Compte à rebours d'avant la première question et fin : rien à montrer (comme avant).
  if (view.phase === 'countdown' || view.phase === 'done') return null;

  return (
    <>
      <QuestionPreview
        question={view.question}
        correctAnswerIds={quizHighlightedAnswerIds(view, content)}
        answeredCount={view.answeredCount}
        totalPlayers={view.totalPlayers}
        explanation={view.phase === 'reveal' ? view.explanation : null}
      />
      <TimerBar
        endsAt={view.phase === 'question' ? view.endsAt : null}
        pausedRemainingMs={view.phase === 'question' ? view.pausedRemainingMs : 0}
        clockOffsetMs={clockOffsetMs}
        timeLimitMs={view.question.timeLimitMs}
      />
    </>
  );
}
