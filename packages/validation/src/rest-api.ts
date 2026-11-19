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

// ─── /api/games (super_admin) ────────────────────────────

/** Slug d'un jeu : minuscules, chiffres et tirets (unique pour tous les moteurs). */
export const gameSlugFormatSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * POST /api/games : création d'un jeu hors quiz (B6 : moteur `poll`). `configJson` est validé par
 * le schéma du moteur (ex. `pollConfigSchema`). Les jeux quiz sont créés par l'éditeur de quiz.
 * Sans `slug`, il est tiré du titre.
 */
export const createGameBodySchema = z.object({
  engineKey: z.string().min(1).max(50),
  title: z.string().trim().min(2).max(255),
  slug: gameSlugFormatSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  configJson: z.unknown(),
});
export type CreateGameBody = z.infer<typeof createGameBodySchema>;

/**
 * PATCH /api/games/:slug : seule route de modification d'un jeu (convention 6). B6 : titre,
 * description et contenu (`configJson`, validé par le schéma du moteur). Étendue en C1.
 */
export const updateGameBodySchema = z
  .object({
    title: z.string().trim().min(2).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    configJson: z.unknown().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateGameBody = z.infer<typeof updateGameBodySchema>;

/** GET /api/games (B6 : filtre par moteur ; C1 ajoute les autres filtres). */
export const listGamesQuerySchema = z.object({
  engineKey: z.string().min(1).max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListGamesQuery = z.infer<typeof listGamesQuerySchema>;
