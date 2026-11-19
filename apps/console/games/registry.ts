import dynamic from 'next/dynamic';
import { QUIZ_ENGINE_KEY } from '@quiz-app/validation';
import type { GameRenderer } from './types';

/**
 * Rendu console de chaque moteur (`round.engineKey` → composant chargé à la demande).
 * Ajouter un moteur : une ligne ici, son schéma de vue dans `view-schemas.ts` et ses règles
 * console dans `console-rules.ts`.
 */
export const GAME_RENDERERS: Record<string, GameRenderer> = {
  [QUIZ_ENGINE_KEY]: dynamic(() => import('./quiz'), { loading: () => null }),
};

export function getGameRenderer(engineKey: string): GameRenderer | null {
  return GAME_RENDERERS[engineKey] ?? null;
}
