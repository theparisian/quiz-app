import { QUIZ_ENGINE_KEY } from '@quiz-app/validation';
import { quizScreenRules } from './quiz/screen-rules';
import type { ScreenGameRules } from './types';

/**
 * Règles d'écran par moteur (lobby conservé, sons dérivés de la vue, sons des cues).
 * Ajouter un moteur : une ligne ici, dans `view-schemas.ts` et dans `registry.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_SCREEN_RULES: Record<string, ScreenGameRules<any>> = {
  [QUIZ_ENGINE_KEY]: quizScreenRules,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getScreenRules(engineKey: string): ScreenGameRules<any> | null {
  return GAME_SCREEN_RULES[engineKey] ?? null;
}
