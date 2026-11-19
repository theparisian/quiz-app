import type { BurgerConsoleView } from '@quiz-app/validation';
import type { ConsoleGameRules } from '../types';

const PHASE_LABEL: Record<BurgerConsoleView['phase'], string> = {
  countdown: 'départ',
  build: 'course en cours',
  results: 'résultats',
  done: 'terminé',
};

/** Règles console du burger. */
export const burgerConsoleRules: ConsoleGameRules<BurgerConsoleView> = {
  progressLabel: (view) => `Burger — ${PHASE_LABEL[view.phase]}`,

  // Départ → course, course → résultats, résultats → fin. Rien après la fin.
  canForceAdvance: (view) => view.phase !== 'done',

  // Les points ne sont attribués qu'à la fin de la course (classement de `round:ended`).
  scoreboard: () => null,
};
