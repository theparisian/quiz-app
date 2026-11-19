'use client';

import { useState, type ReactNode } from 'react';
import type { QuizMobileView } from '@quiz-app/validation';
import { useCountdown } from '@quiz-app/ui';
import { ScreenTransition } from '@/components/screen-transition';
import type { GameRendererProps } from '../types';
import QuestionScreen, { QUIZ_POSITIONS, type QuizPosition } from './question-screen';
import WaitingOthers from './waiting-others';
import ResultScreen from './result-screen';
import LateWaitScreen from './late-wait-screen';

/** Libellés des refus d'une réponse (codes de `game:action`), en tutoiement. */
function answerErrorMessage(code: string): string {
  switch (code) {
    case 'QUESTION_ALREADY_ENDED':
    case 'WRONG_QUESTION':
    case 'WRONG_ROUND':
    case 'NO_ACTIVE_ROUND':
      return 'Trop tard, la question est terminée.';
    case 'SESSION_PAUSED':
      return 'La partie est en pause, réessaie à la reprise.';
    case 'TIMEOUT':
    case 'NOT_CONNECTED':
      return 'Connexion lente : ta réponse n’est pas partie, réessaie.';
    case 'RATE_LIMITED':
      return 'Doucement ! Réessaie dans un instant.';
    default:
      return 'Ta réponse n’a pas pu être enregistrée, réessaie.';
  }
}

function positionOf(view: QuizMobileView, answerId: string | null): QuizPosition | null {
  if (!answerId || !view.question) return null;
  const pos = view.question.answers.find((a) => a.id === answerId)?.position;
  return (QUIZ_POSITIONS as readonly string[]).includes(pos ?? '') ? (pos as QuizPosition) : null;
}

/**
 * Rendu mobile du quiz : ne dépend que de la vue (aucun accès au store pour l'état de jeu).
 * Le choix d'une réponse est affiché tout de suite (optimiste) ; la vue suivante fait foi.
 */
export default function QuizMobileGame({
  view,
  clockOffsetMs,
  sendAction,
}: GameRendererProps<QuizMobileView>) {
  // Réponse optimiste, valable tant que la vue n'a pas changé (la vue suivante la corrige).
  const [optimistic, setOptimistic] = useState<{ base: QuizMobileView; answerId: string } | null>(
    null,
  );
  const [error, setError] = useState<{ base: QuizMobileView; message: string } | null>(null);
  const remainingMs = useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs);

  const pendingAnswerId = optimistic?.base === view ? optimistic.answerId : null;
  const errorMessage = error?.base === view ? error.message : null;

  function handleAnswer(answerId: string) {
    if (!sendAction || view.phase !== 'question' || pendingAnswerId) return;
    const base = view;
    setOptimistic({ base, answerId });
    setError(null);
    void sendAction('answer', { questionId: view.question.id, answerId }).then((ack) => {
      if (ack.ok) return;
      // Refus : on revient à la vue telle que le serveur la décrit.
      setOptimistic((cur) => (cur?.base === base ? null : cur));
      setError({ base, message: answerErrorMessage(ack.code) });
    });
  }

  let screenKey: string;
  let screen: ReactNode;

  switch (view.phase) {
    case 'countdown':
      screenKey = 'countdown';
      screen = (
        <LateWaitScreen
          remainingMs={remainingMs}
          title="C’est parti !"
          subtitle="La première question arrive…"
          countdownLabel="Première question dans"
        />
      );
      break;

    case 'question': {
      const answerId = view.me.answerId ?? pendingAnswerId;
      if (view.me.locked) {
        screenKey = `late-${view.questionIndex}`;
        screen = <LateWaitScreen remainingMs={remainingMs} />;
      } else if (answerId) {
        screenKey = `waiting-${view.questionIndex}`;
        screen = <WaitingOthers position={positionOf(view, answerId)} />;
      } else {
        screenKey = `question-${view.questionIndex}`;
        screen = (
          <QuestionScreen
            question={view.question}
            totalQuestions={view.totalQuestions}
            onAnswer={handleAnswer}
            errorMessage={errorMessage}
          />
        );
      }
      break;
    }

    case 'reveal': {
      const isLast = view.questionIndex + 1 >= view.totalQuestions;
      if (view.me.result) {
        screenKey = `result-${view.questionIndex}`;
        screen = <ResultScreen result={view.me.result} didNotAnswer={view.me.answerId === null} />;
      } else {
        // Arrivé pendant cette question : pas noté, il attend la suivante.
        screenKey = `late-reveal-${view.questionIndex}`;
        screen = isLast ? (
          <LateWaitScreen
            remainingMs={null}
            subtitle="Les résultats arrivent…"
            countdownLabel={null}
          />
        ) : (
          <LateWaitScreen remainingMs={remainingMs} />
        );
      }
      break;
    }

    case 'done':
    default:
      screenKey = 'done';
      screen = (
        <LateWaitScreen
          remainingMs={null}
          title="Partie terminée !"
          subtitle="Les résultats arrivent…"
          countdownLabel={null}
        />
      );
  }

  return <ScreenTransition screenKey={screenKey}>{screen}</ScreenTransition>;
}
