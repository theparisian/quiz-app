import { TIMER_URGENT_THRESHOLD_SEC } from '@quiz-app/design-tokens';
import { TOWER_CUES, type TowerScreenView } from '@quiz-app/validation';
import type { ScreenGameRules, SfxPlan } from '../types';

/**
 * Règles d'écran de la tour de livres : départ, dernières secondes et fin se déduisent de la
 * vue ; une tour qui s'effondre (cue `tower_collapsed`) fait sonner l'écran.
 */
export const towerScreenRules: ScreenGameRules<TowerScreenView> = {
  // Le compte à rebours est dessiné par le jeu (consignes + tour qui oscille).
  showsLobby: () => false,

  stageKey: (view) => view.phase,

  sfxOnEnter(view): SfxPlan[] {
    if (view.phase === 'build') return [{ slot: 'questionStart', delayMs: 0 }];
    if (view.phase === 'results') return [{ slot: 'questionEnd', delayMs: 0 }];
    return [];
  },

  timedSfx(view, clockOffsetMs, localNow) {
    if (view.phase !== 'build' || view.pausedRemainingMs != null || !view.endsAt) return null;
    const endsAt = Date.parse(view.endsAt);
    if (!Number.isFinite(endsAt)) return null;
    const delayMs = endsAt - TIMER_URGENT_THRESHOLD_SEC * 1000 - (localNow + clockOffsetMs);
    if (delayMs <= 0) return null;
    return { slot: 'lastSeconds', delayMs, key: 'tower-build' };
  },

  sfxForCue: (cue) => (cue === TOWER_CUES.collapsed ? 'playerAnswered' : null),
};
