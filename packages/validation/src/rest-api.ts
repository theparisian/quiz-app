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

// ─── Catalogue (C1) ──────────────────────────────────────

export const GAME_KINDS = ['internal', 'sponsored'] as const;
export const gameKindSchema = z.enum(GAME_KINDS);
export type GameKindValue = z.infer<typeof gameKindSchema>;

export const GAME_STATUSES = ['draft', 'published', 'archived'] as const;
export const gameStatusSchema = z.enum(GAME_STATUSES);

/** Audience d'un jeu du catalogue : tous les cinémas, ou ceux de `game_cinema_access`. */
export const GAME_AUDIENCES = ['all_cinemas', 'selected_cinemas'] as const;
export const gameAudienceSchema = z.enum(GAME_AUDIENCES);
export type GameAudienceValue = z.infer<typeof gameAudienceSchema>;

export const GAME_TAGS_MAX = 10;
export const gameTagsSchema = z.array(z.string().trim().min(1).max(40)).max(GAME_TAGS_MAX);

/** Identifiant BigInt sérialisé (chaîne de chiffres). */
const idStringSchema = z.string().regex(/^\d{1,20}$/);

/** Booléen de query string (`true` / `false`). */
const queryBooleanSchema = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * PATCH /api/games/:slug : seule route de modification d'un jeu (convention 6). B6 : titre,
 * description et contenu (`configJson`, validé par le schéma du moteur). C1 : champs du
 * catalogue. Pour un jeu de moteur quiz, le titre, la description, le type, le sponsor, la durée
 * et la couverture viennent du quiz (refusés, 400 GAME_MANAGED_BY_QUIZ).
 */
export const updateGameBodySchema = z
  .object({
    title: z.string().trim().min(2).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    configJson: z.unknown().optional(),
    tagline: z.string().trim().max(160).nullable().optional(),
    rulesText: z.string().max(5000).nullable().optional(),
    kind: gameKindSchema.optional(),
    sponsorId: idStringSchema.nullable().optional(),
    audience: gameAudienceSchema.optional(),
    /** Cinémas autorisés (remplace la liste) ; utilisés quand `audience` = `selected_cinemas`. */
    cinemaIds: z.array(idStringSchema).max(1000).optional(),
    tags: gameTagsSchema.nullable().optional(),
    minPlayers: z.number().int().min(1).max(1000).nullable().optional(),
    durationEstimateSeconds: z.number().int().min(1).max(7200).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateGameBody = z.infer<typeof updateGameBodySchema>;

/** GET /api/games (super_admin) : filtres et pagination. */
export const listGamesQuerySchema = z.object({
  engineKey: z.string().min(1).max(50).optional(),
  kind: gameKindSchema.optional(),
  status: gameStatusSchema.optional(),
  catalogEnabled: queryBooleanSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListGamesQuery = z.infer<typeof listGamesQuerySchema>;

/** GET /api/catalog : jeux disponibles pour un cinéma. */
export const catalogQuerySchema = z.object({
  cinemaSlug: z.string().min(1).max(100),
  kind: gameKindSchema.optional(),
  engineKey: z.string().min(1).max(50).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

/** GET /api/catalog/:slug */
export const catalogDetailQuerySchema = z.object({
  cinemaSlug: z.string().min(1).max(100),
});
export type CatalogDetailQuery = z.infer<typeof catalogDetailQuerySchema>;

/** Jeu du catalogue vu par un cinéma (carte). Jamais de configJson ni de bonne réponse. */
export const catalogGameSchema = z.object({
  slug: z.string(),
  title: z.string(),
  tagline: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  engineKey: z.string(),
  kind: gameKindSchema,
  sponsor: z.object({ name: z.string(), logoUrl: z.string().nullable() }).nullable(),
  durationEstimateSeconds: z.number().int().nullable(),
  tags: z.array(z.string()),
});
export type CatalogGame = z.infer<typeof catalogGameSchema>;

/** Aperçu du contenu d'un jeu : nombre de questions et les 3 premières, texte seul. */
export const catalogContentSummarySchema = z.object({
  questionsCount: z.number().int().nonnegative(),
  sampleQuestions: z.array(z.string()).max(3),
});
export type CatalogContentSummary = z.infer<typeof catalogContentSummarySchema>;

/** Fiche d'un jeu du catalogue. `contentSummary` est null pour un moteur sans aperçu. */
export const catalogGameDetailSchema = catalogGameSchema.extend({
  description: z.string().nullable(),
  rulesText: z.string().nullable(),
  minPlayers: z.number().int().nullable(),
  contentSummary: catalogContentSummarySchema.nullable(),
});
export type CatalogGameDetail = z.infer<typeof catalogGameDetailSchema>;

export const catalogListResponseSchema = z.object({
  items: z.array(catalogGameSchema),
});
export type CatalogListResponse = z.infer<typeof catalogListResponseSchema>;

// ─── Programmation des salles (C2) ───────────────────────

/** Nombre maximal de jeux au programme d'une salle (= manches d'une séance). */
export const MAX_GAMES_PER_SCREEN_PROGRAM = 5;

/** PUT /api/screens/:id/program : remplace le programme (0 à 5 jeux, dans l'ordre). */
export const screenProgramBodySchema = z.object({
  gameSlugs: z.array(z.string().min(1).max(100)).max(MAX_GAMES_PER_SCREEN_PROGRAM),
});
export type ScreenProgramBody = z.infer<typeof screenProgramBodySchema>;

/** Jeu au programme d'une salle. `available` est faux s'il a quitté le catalogue du cinéma. */
export const screenProgramItemSchema = z.object({
  gameSlug: z.string(),
  title: z.string(),
  tagline: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  engineKey: z.string(),
  kind: gameKindSchema,
  /** Nom du sponsor, pour un jeu sponsorisé seulement (même règle que le catalogue). */
  sponsorName: z.string().nullable(),
  durationEstimateSeconds: z.number().int().nullable(),
  available: z.boolean(),
});
export type ScreenProgramItem = z.infer<typeof screenProgramItemSchema>;

/** Une salle et son programme (GET /api/cinemas/:slug/programs, réponse du PUT). */
export const screenProgramSchema = z.object({
  screenId: z.string(),
  name: z.string(),
  capacity: z.number().int().nullable(),
  status: z.string(),
  nuc: z.object({ status: z.string(), lastSeenAt: z.string().nullable() }).nullable(),
  activeSession: z.object({ id: z.string(), state: z.string() }).nullable(),
  items: z.array(screenProgramItemSchema),
});
export type ScreenProgram = z.infer<typeof screenProgramSchema>;

export const cinemaProgramsResponseSchema = z.object({
  items: z.array(screenProgramSchema),
});
export type CinemaProgramsResponse = z.infer<typeof cinemaProgramsResponseSchema>;
