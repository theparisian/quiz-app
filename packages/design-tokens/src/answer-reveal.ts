export const ANSWER_POSITIONS = ['A', 'B', 'C', 'D'] as const;

export type AnswerPosition = (typeof ANSWER_POSITIONS)[number];

/** Délai entre l'apparition de chaque réponse (écran + mobile). */
export const ANSWER_REVEAL_STAGGER_MS = 1000;

/** Durée de l'animation d'apparition d'une réponse. */
export const ANSWER_REVEAL_DURATION_MS = 500;

export function answerRevealDelayMs(
  position: AnswerPosition,
  index = 0,
  staggerDelayMs = ANSWER_REVEAL_STAGGER_MS,
): number {
  const staggerIndex = ANSWER_POSITIONS.indexOf(position);
  return (staggerIndex >= 0 ? staggerIndex : index) * staggerDelayMs;
}
