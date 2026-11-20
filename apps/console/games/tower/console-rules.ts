import type { TowerConsoleView } from '@quiz-app/validation';
import type { ConsoleGameRules } from '../types';

const PHASE_LABEL: Record<TowerConsoleView['phase'], string> = {
  countdown: 'départ',
  build: 'construction en cours',
  results: 'résultats',
  done: 'terminé',
};

/** Règles console de la tour de livres. */
export const towerConsoleRules: ConsoleGameRules<TowerConsoleView> = {
  progressLabel: (view) => `Tour de livres — ${PHASE_LABEL[view.phase]}`,

  // Départ → construction, construction → résultats, résultats → fin. Rien après la fin.
  canForceAdvance: (view) => view.phase !== 'done',

  // Les points ne sont attribués qu'à la fin de la construction (classement de `round:ended`).
  scoreboard: () => null,
};
