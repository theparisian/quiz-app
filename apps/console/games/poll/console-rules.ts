import type { PollConsoleView } from '@quiz-app/validation';
import type { ConsoleGameRules } from '../types';

/** Règles console du sondage. */
export const pollConsoleRules: ConsoleGameRules<PollConsoleView> = {
  progressLabel: (view) => `Sondage — question ${view.questionIndex + 1} / ${view.totalQuestions}`,

  // Vote en cours : clôt le vote ; résultats : question suivante (ou fin). Rien après la fin.
  canForceAdvance: (view) => view.phase !== 'done',

  // Le sondage n'attribue ses points qu'en fin de manche (classement de `round:ended`).
  scoreboard: () => null,
};
