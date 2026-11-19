import {
  POLL_ENGINE_KEY,
  QUIZ_ENGINE_KEY,
  pollScreenViewSchema,
  quizScreenViewSchema,
} from '@quiz-app/validation';
import type { GameViewSchema } from './types';

/**
 * Schémas des vues écran par moteur, lus par le store pour valider `game:state.view`.
 * Séparé de `registry.ts` (composants `next/dynamic`) pour que le store reste testable hors
 * navigateur. Ajouter un moteur : une ligne ici, dans `screen-rules.ts` et dans `registry.ts`.
 */
export const GAME_VIEW_SCHEMAS: Record<string, GameViewSchema> = {
  [QUIZ_ENGINE_KEY]: quizScreenViewSchema,
  [POLL_ENGINE_KEY]: pollScreenViewSchema,
};

export function getGameViewSchema(engineKey: string): GameViewSchema | null {
  return GAME_VIEW_SCHEMAS[engineKey] ?? null;
}
