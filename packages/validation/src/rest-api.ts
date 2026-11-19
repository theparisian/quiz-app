import { z } from 'zod';
import { sessionPrizesDisplaySchema } from './prizes.js';
import { resolvedQuizAudioSchema } from './audio.js';

export const pseudoSuggestionsResponseSchema = z.object({
  suggestions: z.tuple([z.string(), z.string(), z.string()]),
});

/** GET /health/active-sessions — garde du déploiement (scripts/deploy.sh). */
export const activeSessionsHealthResponseSchema = z.object({
  running: z.number().int().nonnegative(),
  paused: z.number().int().nonnegative(),
  lobbyWithPlayers: z.number().int().nonnegative(),
  blocking: z.number().int().nonnegative(),
});

export type ActiveSessionsHealthResponse = z.infer<typeof activeSessionsHealthResponseSchema>;

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
    audio: resolvedQuizAudioSchema.optional(),
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
