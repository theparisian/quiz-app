import type { QuizConsoleView } from '@quiz-app/validation';
import type { QuizFull } from '@/lib/stores/live-session-store';
import type { ConsoleGameRules } from '../types';

/**
 * Réponses à surligner en vert dans la console. En révélation : `correctAnswerId` de la vue.
 * Pendant la question, la vue ne la porte pas (confidentialité) : on la prend dans le quiz
 * complet chargé par `GET /api/sessions/:id/full` (authentifié), comme avant le protocole.
 */
export function quizHighlightedAnswerIds(
  view: QuizConsoleView,
  content: QuizFull | null,
): string[] {
  if (view.question === null) return [];
  const revealedId = view.phase === 'reveal' ? view.correctAnswerId : null;
  if (revealedId) return [revealedId];
  const full = content?.questions.find((q) => q.id === view.question?.id);
  return full?.answers.filter((a) => a.isCorrect).map((a) => a.id) ?? [];
}

/** Règles console du quiz. */
export const quizConsoleRules: ConsoleGameRules<QuizConsoleView> = {
  progressLabel: (view) =>
    `Question ${view.questionIndex >= 0 ? view.questionIndex + 1 : '–'} / ${view.totalQuestions}`,

  // Le moteur ne clôt qu'une question ouverte (compte à rebours et révélation : sans effet).
  canForceAdvance: (view) => view.phase === 'question',

  // Classement complet de la console à chaque révélation : scores à jour de la liste.
  scoreboard: (view) =>
    view.phase === 'reveal'
      ? view.scoreboard.map((s) => ({
          playerId: s.playerId,
          pseudo: s.pseudo,
          avatarUrl: s.avatarUrl,
          scoreTotal: s.scoreTotal,
        }))
      : null,
};
