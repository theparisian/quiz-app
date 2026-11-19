import { z } from 'zod';
import { sessionPrizesDisplaySchema } from './prizes.js';
import { resolvedQuizAudioSchema } from './audio.js';

// ─── Generic ──────────────────────────────────────────────

export const pingSchema = z.object({
  timestamp: z.string().datetime(),
});

export const pongSchema = z.object({
  timestamp: z.string().datetime(),
  serverTime: z.string().datetime(),
});

export type PingPayload = z.infer<typeof pingSchema>;
export type PongPayload = z.infer<typeof pongSchema>;

// ─── Client → Server: Mobile (joueurs) ───────────────────

/** Jeton long de session encodé dans le QR code (nanoid(20) côté API). */
export const sessionJoinTokenSchema = z.string().min(10).max(32);

/** Rejoindre par code à 4 chiffres OU par jeton du QR : exactement l'un des deux. */
export const playerJoinPayloadSchema = z
  .object({
    pseudo: z.string().min(2).max(30),
    sessionSlugShort: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    joinToken: sessionJoinTokenSchema.optional(),
    pseudoSource: z.enum(['SUGGESTED', 'CUSTOM']).optional(),
    avatarId: z.string().min(1).optional(),
  })
  .refine((d) => (d.sessionSlugShort === undefined) !== (d.joinToken === undefined), {
    message: 'Provide exactly one of sessionSlugShort or joinToken',
    path: ['joinToken'],
  });

export const playerResumePayloadSchema = z.object({
  resumeToken: z.string().min(1),
  sessionId: z.string().min(1),
});

export type PlayerJoinPayload = z.infer<typeof playerJoinPayloadSchema>;
export type PlayerResumePayload = z.infer<typeof playerResumePayloadSchema>;

// ─── Client → Server: Player (NUC) ───────────────────────

export const nucJoinPayloadSchema = z.object({
  nucUid: z.string().min(1),
  authKey: z.string().min(1),
  sessionId: z.string().min(1),
});

export const nucResumePayloadSchema = z.object({
  nucUid: z.string().min(1),
  sessionId: z.string().min(1).optional(),
});

export type NucJoinPayload = z.infer<typeof nucJoinPayloadSchema>;
export type NucResumePayload = z.infer<typeof nucResumePayloadSchema>;

// ─── Client → Server: Console ─────────────────────────────

export const consoleJoinPayloadSchema = z.object({
  sessionId: z.string().min(1),
});

export const consoleResumePayloadSchema = z.object({
  sessionId: z.string().min(1),
});

export const consoleAbortPayloadSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type ConsoleJoinPayload = z.infer<typeof consoleJoinPayloadSchema>;
export type ConsoleResumePayload = z.infer<typeof consoleResumePayloadSchema>;
export type ConsoleAbortPayload = z.infer<typeof consoleAbortPayloadSchema>;

// ─── Client → Server: Admin ────────────────────────────────

export const adminWatchCinemaPayloadSchema = z.object({
  cinemaSlug: z.string().min(1),
});

export type AdminWatchCinemaPayload = z.infer<typeof adminWatchCinemaPayloadSchema>;

// ─── Server → Client: Session events ─────────────────────

export const sessionStateChangedSchema = z.object({
  sessionId: z.string(),
  oldState: z.string(),
  newState: z.string(),
});

export const sessionStartedSchema = z.object({
  sessionId: z.string(),
  audio: resolvedQuizAudioSchema.optional(),
});

/**
 * Habillage d'écran et sons de la manche qui commence (B5), émis avant son `round:started` à
 * partir de la manche 2 : quiz de la manche s'il en a un, sinon celui de la première manche.
 * Même forme que `session:started` (`quiz` = fonds et branding, `audio` = sons résolus).
 */
export const sessionThemeChangedSchema = z.object({
  quiz: z.object({
    backgroundMediaUrl: z.string().nullable(),
    backgroundMediaType: z.string().nullable(),
    backgroundOverlayOpacity: z.number(),
    lobbyBackgroundMediaUrl: z.string().nullable(),
    lobbyBackgroundMediaType: z.string().nullable(),
    lobbyBackgroundOverlayOpacity: z.number(),
    brandingJson: z.unknown(),
  }),
  audio: resolvedQuizAudioSchema,
});
export type SessionThemeChangedPayload = z.infer<typeof sessionThemeChangedSchema>;

export const sessionLobbyTimerUpdateSchema = z.object({
  remainingMs: z.number().int(),
});

export const sessionPausedSchema = z.object({
  sessionId: z.string(),
});

export const sessionResumedSchema = z.object({
  sessionId: z.string(),
});

export const sessionAudioMutedSchema = z.object({
  muted: z.boolean(),
});

export const sessionEndedSchema = z.object({
  finalScoreboard: z.array(
    z.object({
      playerId: z.string(),
      pseudo: z.string(),
      avatarUrl: z.string().nullable().optional(),
      scoreTotal: z.number().int(),
      rank: z.number().int(),
    }),
  ),
  winnerPlayerId: z.string().nullable(),
  prizeAvailabilityByRank: z
    .object({
      rank1: z.boolean().optional(),
      rank2: z.boolean().optional(),
      rank3: z.boolean().optional(),
    })
    .optional(),
  prizes: sessionPrizesDisplaySchema.optional(),
});

export const sessionAbortedSchema = z.object({
  reason: z.string().nullable(),
});

// ─── Manches (protocole commun à tous les moteurs) ───────

/** Sponsor tel qu'il s'affiche au public (badge « Présenté par », carton d'ouverture). */
export const sponsorDisplaySchema = z.object({
  name: z.string(),
  logoUrl: z.string().nullable(),
  brandColorPrimary: z.string().nullable(),
});
export type SponsorDisplay = z.infer<typeof sponsorDisplaySchema>;

/**
 * Sponsor de la séance (C4), affiché au lobby et sur l'écran final du joueur : celui de la
 * première manche sponsorisée (`kind = sponsored` avec un sponsor), null sinon. Clé
 * `sessionSponsor` des snapshots écran et mobile et des réponses by-code / by-token.
 */
export const sessionSponsorSchema = sponsorDisplaySchema.nullable();
export type SessionSponsor = z.infer<typeof sessionSponsorSchema>;

/** Manche annoncée par `round:started` et portée par `session:state_snapshot.round`. */
export const roundInfoSchema = z.object({
  roundId: z.string(),
  /** Position de la manche dans la séance, à partir de 1. */
  position: z.number().int().positive(),
  totalRounds: z.number().int().positive(),
  engineKey: z.string(),
  game: z.object({
    slug: z.string(),
    title: z.string(),
    kind: z.enum(['internal', 'sponsored']),
    sponsor: sponsorDisplaySchema.nullable(),
  }),
});
export type RoundInfo = z.infer<typeof roundInfoSchema>;

/**
 * Sponsor à montrer au public pendant une manche (C4) : seulement pour un jeu `sponsored`
 * qui a un sponsor (même règle que le catalogue des cinémas, C1). Jamais pour une manche
 * non sponsorisée.
 */
export function displayedRoundSponsor(
  round: Pick<RoundInfo, 'game'> | null | undefined,
): SponsorDisplay | null {
  if (!round || round.game.kind !== 'sponsored') return null;
  return round.game.sponsor ?? null;
}

export const roundStartedSchema = roundInfoSchema;
export type RoundStartedPayload = RoundInfo;

export const roundScoreboardEntrySchema = z.object({
  playerId: z.string(),
  pseudo: z.string(),
  avatarUrl: z.string().nullable(),
  scoreTotal: z.number().int(),
  scoreThisRound: z.number().int(),
});

/** Fin de manche, vers les trois audiences ; classement trié par score total décroissant. */
export const roundEndedSchema = z.object({
  roundId: z.string(),
  position: z.number().int().positive(),
  totalRounds: z.number().int().positive(),
  scoreboard: z.array(roundScoreboardEntrySchema),
});
export type RoundEndedPayload = z.infer<typeof roundEndedSchema>;

/**
 * Vue complète d'un moteur pour une audience (`view` : schéma du moteur, voir `games/<clé>`).
 * `seq` croît strictement par manche et par destinataire : ignorer un `seq` <= au dernier
 * appliqué. `serverNow` (ISO) sert à calculer le décalage d'horloge.
 */
export const gameStateSchema = z.object({
  roundId: z.string(),
  engineKey: z.string(),
  seq: z.number().int().positive(),
  serverNow: z.string().datetime(),
  view: z.unknown(),
});
export type GameStatePayload = z.infer<typeof gameStateSchema>;

/** Signal éphémère (son, animation). Ne porte jamais d'état : le perdre ne change rien. */
export const gameCueSchema = z.object({
  roundId: z.string(),
  cue: z.string(),
  data: z.unknown().optional(),
});
export type GameCuePayload = z.infer<typeof gameCueSchema>;

/** Mobile → serveur, avec accusé. Le joueur est celui du socket. */
export const gameActionPayloadSchema = z.object({
  roundId: z.string().regex(/^\d+$/),
  type: z.string().min(1).max(50),
  payload: z.unknown(),
});
export type GameActionPayload = z.infer<typeof gameActionPayloadSchema>;

export const gameActionAckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
export type GameActionAck = z.infer<typeof gameActionAckSchema>;

/** Champs de manche de tout `session:state_snapshot` (règle 5). */
export const snapshotRoundFieldsSchema = z.object({
  round: roundInfoSchema.nullable(),
  gameView: z.unknown(),
  /** `seq` de la dernière vue émise vers ce destinataire (0 si aucune). */
  gameSeq: z.number().int().nonnegative(),
  /** Entracte entre deux manches (B5) : le `round:ended` de la manche terminée, sinon null. */
  roundEnded: roundEndedSchema.nullable().optional(),
});
export type SnapshotRoundFields = z.infer<typeof snapshotRoundFieldsSchema>;

// ─── Server → Client: Player events ──────────────────────

export const playerJoinedSchema = z.object({
  playerId: z.string(),
  pseudo: z.string(),
  avatarUrl: z.string().nullable().optional(),
  joinedAt: z.string().datetime(),
});

export const playerLeftSchema = z.object({
  playerId: z.string(),
});

// ─── Client → Server: NUC discovery (PR5c) ──────────────

export const nucJoinScreenPayloadSchema = z
  .object({
    nucUid: z.string().min(1).optional(),
    nucId: z.string().min(1).optional(),
  })
  .refine((d) => !!(d.nucUid ?? d.nucId), { message: 'nucUid required' });

export const nucJoinSessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
});

export type NucJoinScreenPayload = z.infer<typeof nucJoinScreenPayloadSchema>;
export type NucJoinSessionPayload = z.infer<typeof nucJoinSessionPayloadSchema>;

/**
 * Preuve de diffusion (C3) : l'écran signale, une fois par manche, que le rendu de la manche est
 * monté et visible. Accusé facultatif : `{ ok: true }` ou `{ ok: false, code, message }`.
 */
export const nucRoundDisplayedPayloadSchema = z.object({
  roundId: z.string().regex(/^\d{1,20}$/),
});
export type NucRoundDisplayedPayload = z.infer<typeof nucRoundDisplayedPayloadSchema>;

// ─── Server → Client: NUC discovery (PR5c) ──────────────

export const screenSessionStartedSchema = z.object({
  sessionId: z.string(),
  slugShort: z.string(),
  joinToken: z.string().nullable(),
});

export const nucJoinScreenResponseSchema = z.object({
  ok: z.boolean(),
  screenId: z.string(),
  currentSession: z
    .object({
      sessionId: z.string(),
      slugShort: z.string(),
      joinToken: z.string().nullable(),
      state: z.string(),
    })
    .nullable(),
});

export type ScreenSessionStartedPayload = z.infer<typeof screenSessionStartedSchema>;
export type NucJoinScreenResponse = z.infer<typeof nucJoinScreenResponseSchema>;

// ─── Client → Server: Mobile rejoin (PR5c) ──────────────

export const playerRejoinRoomPayloadSchema = z.object({
  sessionId: z.string().min(1),
  playerId: z.string().min(1),
  resumeToken: z.string().min(1),
});

export type PlayerRejoinRoomPayload = z.infer<typeof playerRejoinRoomPayloadSchema>;

// ─── Server → Client: Error ──────────────────────────────

export const socketErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const nucStatusChangedSchema = z.object({
  nucId: z.string(),
  screenId: z.string(),
  status: z.enum(['online', 'offline', 'error', 'provisioning']),
  reason: z.string().optional(),
});

// ─── Type exports ─────────────────────────────────────────

export type SessionStateChangedPayload = z.infer<typeof sessionStateChangedSchema>;
export type SessionStartedPayload = z.infer<typeof sessionStartedSchema>;
export type SessionLobbyTimerUpdatePayload = z.infer<typeof sessionLobbyTimerUpdateSchema>;
export type SessionPausedPayload = z.infer<typeof sessionPausedSchema>;
export type SessionResumedPayload = z.infer<typeof sessionResumedSchema>;
export type SessionAudioMutedPayload = z.infer<typeof sessionAudioMutedSchema>;
export type SessionEndedPayload = z.infer<typeof sessionEndedSchema>;
export type SessionAbortedPayload = z.infer<typeof sessionAbortedSchema>;
export type PlayerJoinedPayload = z.infer<typeof playerJoinedSchema>;
export type PlayerLeftPayload = z.infer<typeof playerLeftSchema>;
export type SocketErrorPayload = z.infer<typeof socketErrorSchema>;
export type NucStatusChangedPayload = z.infer<typeof nucStatusChangedSchema>;
