import { z } from 'zod';
import { sessionPrizesDisplaySchema } from './prizes.js';

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

export const playerJoinPayloadSchema = z.object({
  pseudo: z.string().min(2).max(30),
  sessionSlugShort: z.string().regex(/^\d{4}$/),
  pseudoSource: z.enum(['SUGGESTED', 'CUSTOM']).optional(),
});

export const playerSubmitAnswerPayloadSchema = z.object({
  questionId: z.string().min(1),
  answerId: z.string().min(1),
});

export const playerResumePayloadSchema = z.object({
  resumeToken: z.string().min(1),
  sessionId: z.string().min(1),
});

export type PlayerJoinPayload = z.infer<typeof playerJoinPayloadSchema>;
export type PlayerSubmitAnswerPayload = z.infer<typeof playerSubmitAnswerPayloadSchema>;
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
  totalQuestions: z.number().int(),
});

export const sessionQuestionStartedSchema = z.object({
  questionId: z.string(),
  questionPosition: z.number().int(),
  questionText: z.string(),
  questionImageUrl: z.string().nullable(),
  answers: z.array(
    z.object({
      id: z.string(),
      position: z.string(),
      text: z.string(),
    }),
  ),
  timeLimitMs: z.number().int(),
  startedAt: z.string().datetime(),
});

export const sessionTimerUpdateSchema = z.object({
  remainingMs: z.number().int(),
});

export const sessionLobbyTimerUpdateSchema = z.object({
  remainingMs: z.number().int(),
});

export const sessionAnswerSubmittedCountSchema = z.object({
  count: z.number().int(),
  total: z.number().int(),
});

export const sessionQuestionEndedSchema = z.object({
  correctAnswerId: z.string().nullable(),
  explanationText: z.string().nullable(),
  scoreboard: z.array(
    z.object({
      playerId: z.string(),
      pseudo: z.string(),
      scoreTotal: z.number().int(),
      scoreThisQuestion: z.number().int(),
    }),
  ),
});

export const sessionNextQuestionInSchema = z.object({
  ms: z.number().int(),
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

// ─── Server → Client: Player events ──────────────────────

export const playerJoinedSchema = z.object({
  playerId: z.string(),
  pseudo: z.string(),
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

// ─── Server → Client: NUC discovery (PR5c) ──────────────

export const screenSessionStartedSchema = z.object({
  sessionId: z.string(),
  slugShort: z.string(),
});

export const nucJoinScreenResponseSchema = z.object({
  ok: z.boolean(),
  screenId: z.string(),
  currentSession: z
    .object({
      sessionId: z.string(),
      slugShort: z.string(),
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
export type SessionQuestionStartedPayload = z.infer<typeof sessionQuestionStartedSchema>;
export type SessionTimerUpdatePayload = z.infer<typeof sessionTimerUpdateSchema>;
export type SessionLobbyTimerUpdatePayload = z.infer<typeof sessionLobbyTimerUpdateSchema>;
export type SessionAnswerSubmittedCountPayload = z.infer<typeof sessionAnswerSubmittedCountSchema>;
export type SessionQuestionEndedPayload = z.infer<typeof sessionQuestionEndedSchema>;
export type SessionNextQuestionInPayload = z.infer<typeof sessionNextQuestionInSchema>;
export type SessionPausedPayload = z.infer<typeof sessionPausedSchema>;
export type SessionResumedPayload = z.infer<typeof sessionResumedSchema>;
export type SessionAudioMutedPayload = z.infer<typeof sessionAudioMutedSchema>;
export type SessionEndedPayload = z.infer<typeof sessionEndedSchema>;
export type SessionAbortedPayload = z.infer<typeof sessionAbortedSchema>;
export type PlayerJoinedPayload = z.infer<typeof playerJoinedSchema>;
export type PlayerLeftPayload = z.infer<typeof playerLeftSchema>;
export type SocketErrorPayload = z.infer<typeof socketErrorSchema>;
export type NucStatusChangedPayload = z.infer<typeof nucStatusChangedSchema>;
