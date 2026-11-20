import {
  BURGER_ENGINE_KEY,
  TOWER_ENGINE_KEY,
  towerConsoleViewSchema,
  POLL_ENGINE_KEY,
  QUIZ_ENGINE_KEY,
  burgerConsoleViewSchema,
  pollConsoleViewSchema,
  quizConsoleViewSchema,
} from '@quiz-app/validation';
import type { GameViewSchema } from './types';

/**
 * Schémas des vues console par moteur, lus par le store pour valider `game:state.view`.
 * Séparé de `registry.ts` (composants `next/dynamic`) pour que le store reste testable hors
 * navigateur. Ajouter un moteur : une ligne ici, dans `console-rules.ts` et dans `registry.ts`.
 */
export const GAME_VIEW_SCHEMAS: Record<string, GameViewSchema> = {
  [QUIZ_ENGINE_KEY]: quizConsoleViewSchema,
  [POLL_ENGINE_KEY]: pollConsoleViewSchema,
  [BURGER_ENGINE_KEY]: burgerConsoleViewSchema,
  [TOWER_ENGINE_KEY]: towerConsoleViewSchema,
};

export function getGameViewSchema(engineKey: string): GameViewSchema | null {
  return GAME_VIEW_SCHEMAS[engineKey] ?? null;
}
