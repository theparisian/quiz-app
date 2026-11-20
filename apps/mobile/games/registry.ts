import dynamic from 'next/dynamic';
import {
  BURGER_ENGINE_KEY,
  TOWER_ENGINE_KEY,
  POLL_ENGINE_KEY,
  QUIZ_ENGINE_KEY,
} from '@quiz-app/validation';
import type { GameRenderer } from './types';

/**
 * Rendu mobile de chaque moteur (`round.engineKey` → composant chargé à la demande).
 * Ajouter un moteur : une ligne ici et son schéma de vue dans `view-schemas.ts`.
 */
export const GAME_RENDERERS: Record<string, GameRenderer> = {
  [QUIZ_ENGINE_KEY]: dynamic(() => import('./quiz'), { loading: () => null }),
  [POLL_ENGINE_KEY]: dynamic(() => import('./poll'), { loading: () => null }),
  [BURGER_ENGINE_KEY]: dynamic(() => import('./burger'), { loading: () => null }),
  [TOWER_ENGINE_KEY]: dynamic(() => import('./tower'), { loading: () => null }),
};

export function getGameRenderer(engineKey: string): GameRenderer | null {
  return GAME_RENDERERS[engineKey] ?? null;
}
