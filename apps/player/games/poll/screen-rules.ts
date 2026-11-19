import { TIMER_URGENT_THRESHOLD_SEC } from '@quiz-app/design-tokens';
import type { PollScreenView } from '@quiz-app/validation';
import type { ScreenGameRules, SfxPlan } from '../types';

/**
 * Règles d'écran du sondage : tous ses sons se déduisent de la vue (le moteur n'émet aucun cue).
 * Mêmes slots que le quiz : ouverture d'une question, dernières secondes, résultats.
 */
export const pollScreenRules: ScreenGameRules<PollScreenView> = {
  // Pas de compte à rebours : le jeu remplace le lobby dès la première question.
  showsLobby: () => false,

  stageKey: (view) => `${view.phase}:${view.questionIndex}`,

  sfxOnEnter(view): SfxPlan[] {
    if (view.phase === 'question') return [{ slot: 'questionStart', delayMs: 0 }];
    if (view.phase === 'results') return [{ slot: 'questionEnd', delayMs: 0 }];
    return [];
  },

  timedSfx(view, clockOffsetMs, localNow) {
    if (view.phase !== 'question' || view.pausedRemainingMs != null || !view.endsAt) return null;
    const endsAt = Date.parse(view.endsAt);
    if (!Number.isFinite(endsAt)) return null;
    const delayMs = endsAt - TIMER_URGENT_THRESHOLD_SEC * 1000 - (localNow + clockOffsetMs);
    if (delayMs <= 0) return null;
    return { slot: 'lastSeconds', delayMs, key: `poll-question:${view.questionIndex}` };
  },

  sfxForCue: () => null,
};
