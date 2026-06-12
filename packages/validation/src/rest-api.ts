import { z } from 'zod';

export const playerJoinStateSnapshotSchema = z.object({
  sessionState: z.string(),
  currentQuestionPosition: z.number().int(),
  totalQuestions: z.number().int(),
  canAnswerCurrentQuestion: z.boolean(),
  timerRemainingMs: z.number().int().optional(),
  showFinalImmediately: z.boolean().optional(),
});

export const pseudoSuggestionsResponseSchema = z.object({
  suggestions: z.tuple([z.string(), z.string(), z.string()]),
});

export type PlayerJoinStateSnapshot = z.infer<typeof playerJoinStateSnapshotSchema>;
export type PseudoSuggestionsResponse = z.infer<typeof pseudoSuggestionsResponseSchema>;
