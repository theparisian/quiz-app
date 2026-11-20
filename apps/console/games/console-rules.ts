import {
  BURGER_ENGINE_KEY,
  POLL_ENGINE_KEY,
  QUIZ_ENGINE_KEY,
  TOWER_ENGINE_KEY,
} from '@quiz-app/validation';
import { burgerConsoleRules } from './burger/console-rules';
import { pollConsoleRules } from './poll/console-rules';
import { quizConsoleRules } from './quiz/console-rules';
import { towerConsoleRules } from './tower/console-rules';
import type { ConsoleGameRules } from './types';

/**
 * Règles console par moteur (progression de l'en-tête, bouton « Forcer la fin », scores).
 * Ajouter un moteur : une ligne ici, dans `view-schemas.ts` et dans `registry.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_CONSOLE_RULES: Record<string, ConsoleGameRules<any>> = {
  [QUIZ_ENGINE_KEY]: quizConsoleRules,
  [POLL_ENGINE_KEY]: pollConsoleRules,
  [BURGER_ENGINE_KEY]: burgerConsoleRules,
  [TOWER_ENGINE_KEY]: towerConsoleRules,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConsoleRules(engineKey: string): ConsoleGameRules<any> | null {
  return GAME_CONSOLE_RULES[engineKey] ?? null;
}
