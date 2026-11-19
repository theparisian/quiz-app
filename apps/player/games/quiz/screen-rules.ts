import {
  ANSWER_POSITIONS,
  TIMER_URGENT_THRESHOLD_SEC,
  answerRevealDelayMs,
  type AnswerPosition,
} from '@quiz-app/design-tokens';
import { QUIZ_CUES, quizPlayerAnsweredCueSchema, type QuizScreenView } from '@quiz-app/validation';
import type { ScreenGameRules, SfxPlan } from '../types';

/**
 * Règles d'écran du quiz : tous ses sons sauf `playerAnswered` se déduisent de la vue
 * (changement de phase, échéance `endsAt`), pas des cues `question_opened`, `last_seconds`
 * et `question_closed` (qui ne doivent pas les rejouer).
 */
export const quizScreenRules: ScreenGameRules<QuizScreenView> = {
  // Compte à rebours d'avant la première question : l'écran garde le lobby, comme avant.
  showsLobby: (view) => view.phase === 'countdown',

  stageKey: (view) => `${view.phase}:${view.questionIndex}`,

  sfxOnEnter(view): SfxPlan[] {
    if (view.phase === 'question') {
      // Ouverture de la question, puis une note par réponse au rythme de leur apparition.
      const reveals = ANSWER_POSITIONS.slice(0, view.question.answers.length).map(
        (position, index): SfxPlan => ({
          slot: 'answerReveal',
          delayMs: answerRevealDelayMs(position as AnswerPosition, index),
        }),
      );
      return [{ slot: 'questionStart', delayMs: 0 }, ...reveals];
    }
    if (view.phase === 'reveal') return [{ slot: 'questionEnd', delayMs: 0 }];
    return [];
  },

  timedSfx(view, clockOffsetMs, localNow) {
    // Dernières secondes : calé sur le même repère que l'animation du timer (endsAt corrigé).
    if (view.phase !== 'question' || view.pausedRemainingMs != null || !view.endsAt) return null;
    const endsAt = Date.parse(view.endsAt);
    if (!Number.isFinite(endsAt)) return null;
    const fireAt = endsAt - TIMER_URGENT_THRESHOLD_SEC * 1000;
    const delayMs = fireAt - (localNow + clockOffsetMs);
    if (delayMs <= 0) return null;
    return { slot: 'lastSeconds', delayMs, key: `question:${view.questionIndex}` };
  },

  sfxForCue(cue, data) {
    if (cue !== QUIZ_CUES.playerAnswered) return null;
    const parsed = quizPlayerAnsweredCueSchema.safeParse(data);
    // Comme avant : un son par pseudo affiché (pas de flash sans pseudo).
    return parsed.success && parsed.data.pseudo ? 'playerAnswered' : null;
  },
};
