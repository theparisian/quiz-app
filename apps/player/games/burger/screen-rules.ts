import { TIMER_URGENT_THRESHOLD_SEC } from '@quiz-app/design-tokens';
import { BURGER_CUES, type BurgerScreenView } from '@quiz-app/validation';
import type { ScreenGameRules, SfxPlan } from '../types';

/**
 * Règles d'écran du burger : départ de la course, dernières secondes et fin se déduisent de la
 * vue ; un burger terminé (cue `player_finished`) fait sonner l'écran.
 */
export const burgerScreenRules: ScreenGameRules<BurgerScreenView> = {
  // Le compte à rebours est dessiné par le jeu (consignes + burger éclaté).
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
    return { slot: 'lastSeconds', delayMs, key: 'burger-build' };
  },

  sfxForCue: (cue) => (cue === BURGER_CUES.playerFinished ? 'playerAnswered' : null),
};
