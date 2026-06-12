import { z } from 'zod';
import { sessionPrizesDisplaySchema } from './prizes.js';

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

export const playerUpdateEmailBodySchema = z.object({
  email: z.string().email(),
  consent: z.literal(true),
});

export type PlayerUpdateEmailBody = z.infer<typeof playerUpdateEmailBodySchema>;

export const nucStateSnapshotSchema = z
  .object({
    session: z
      .object({
        state: z.string(),
      })
      .passthrough()
      .nullable()
      .optional(),
    prizes: sessionPrizesDisplaySchema.optional(),
  })
  .passthrough();

export const mobileStateSnapshotSchema = z
  .object({
    session: z
      .object({
        state: z.string(),
      })
      .passthrough()
      .optional(),
    prizes: sessionPrizesDisplaySchema.optional(),
  })
  .passthrough();

export const consoleStateSnapshotSchema = z
  .object({
    session: z
      .object({
        state: z.string(),
      })
      .passthrough()
      .optional(),
    prizes: sessionPrizesDisplaySchema.optional(),
  })
  .passthrough();
