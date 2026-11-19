import { create } from 'zustand';
import {
  gameStateSchema,
  roundEndedSchema,
  roundInfoSchema,
  type RoundEndedPayload,
  type RoundInfo,
  type SessionPrizesDisplay,
} from '@quiz-app/validation';
import type {
  SessionStateChangedPayload,
  SessionLobbyTimerUpdatePayload,
  SessionAudioMutedPayload,
  SessionEndedPayload,
  SessionAbortedPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
} from '@quiz-app/validation/socket-events';
import { pushClockSample } from '@quiz-app/ui';
import { getGameViewSchema } from '@/games/view-schemas';
import { getConsoleRules } from '@/games/console-rules';
import type { ConsoleScoreEntry } from '@/games/types';
import { reportGameIssue } from '@/lib/report-issue';

/*
 * Quiz complet de la séance, chargé par `GET /api/sessions/:id/full` (authentifié). Il donne le
 * titre et la couverture de l'en-tête, et les bonnes réponses que la console montre pendant la
 * question (aucune vue ne les porte avant la révélation). Ce n'est pas l'état de la partie :
 * celui-ci vient des vues (`gameView`).
 */
export interface QuestionFull {
  id: string;
  position: number;
  text: string;
  imageUrl: string | null;
  timeLimitSeconds: number;
  pointsMax: number;
  pointsFloor: number;
  explanation: string | null;
  answers: AnswerFull[];
}

export interface AnswerFull {
  id: string;
  position: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizFull {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  questions: QuestionFull[];
}

/** Manche de la séance et son contenu console (`GET /:id/full`, B5). */
export interface RoundFull {
  roundId: string;
  position: number;
  state: string;
  game: { slug: string; title: string; engineKey: string; kind: string };
  /** Quiz complet (bonnes réponses comprises) si le jeu est un quiz, sinon null. */
  content: QuizFull | null;
}

export interface PlayerLive {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
  scoreTotal: number;
  status: string;
}

type SessionState = 'lobby' | 'running' | 'paused' | 'ended' | 'aborted';

export type LiveConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface RoundFields {
  /** Manche active (`round:started` ou snapshot), null hors manche. */
  round: RoundInfo | null;
  /** Dernière vue complète appliquée, validée par le schéma console du moteur (null si aucune). */
  gameView: unknown;
  /** La dernière vue reçue était invalide (ou le moteur inconnu) : rendu de repli. */
  gameViewInvalid: boolean;
  /** `seq` de la dernière vue appliquée : tout `game:state` de `seq <= gameSeq` est ignoré. */
  gameSeq: number;
  /** Classement de fin de manche (`round:ended`). */
  roundScoreboard: RoundEndedPayload | null;
}

export interface LiveSessionState extends RoundFields {
  sessionId: string | null;
  slugShort: string | null;
  state: SessionState | null;
  totalPlayers: number;
  lobbyRemainingMs: number | null;

  /** Quiz de la première manche (`GET /:id/full`) : titre et couverture de l'en-tête. */
  quiz: QuizFull | null;
  /** Manches et leur contenu authentifié (`GET /:id/full`), voir plus haut. */
  rounds: RoundFull[];

  audioMuted: boolean;

  players: PlayerLive[];

  /** `heure serveur - heure locale` (ms), médiane des derniers `serverNow` reçus. */
  clockOffsetMs: number;
  clockSamples: number[];

  finalScoreboard: PlayerLive[] | null;
  winnerPlayerId: string | null;
  abortReason: string | null;

  screenId: string | null;
  screenName: string | null;
  cinemaName: string | null;
  backgroundMusicUrl: string | null;

  prizes: SessionPrizesDisplay | null;
  consolationPrizesClaimed: number;

  connectionStatus: LiveConnectionStatus;

  hydrateFromSession: (session: SessionFullResponse) => void;
  applyEvent: (eventName: string, payload: unknown) => void;
  applySocketSnapshot: (payload: Record<string, unknown>) => void;
  setConnectionStatus: (s: LiveConnectionStatus) => void;
  reset: () => void;
}

export interface SessionFullResponse {
  id: string;
  slugShort: string;
  state: string;
  totalPlayers: number;
  screenId: string;
  screenName: string;
  cinemaName: string;
  backgroundMusicUrl: string | null;
  consolationPrizesClaimed?: number;
  quiz: QuizFull | null;
  rounds?: RoundFull[];
  players: {
    id: string;
    pseudo: string;
    avatarUrl?: string | null;
    scoreTotal: number;
    status: string;
    joinedAt: string;
  }[];
}

const EMPTY_ROUND: RoundFields = {
  round: null,
  gameView: null,
  gameViewInvalid: false,
  gameSeq: 0,
  roundScoreboard: null,
};

const INITIAL: Omit<
  LiveSessionState,
  'hydrateFromSession' | 'applyEvent' | 'applySocketSnapshot' | 'setConnectionStatus' | 'reset'
> = {
  sessionId: null,
  slugShort: null,
  state: null,
  totalPlayers: 0,
  lobbyRemainingMs: null,
  quiz: null,
  rounds: [],
  audioMuted: false,
  players: [],
  ...EMPTY_ROUND,
  clockOffsetMs: 0,
  clockSamples: [],
  finalScoreboard: null,
  winnerPlayerId: null,
  abortReason: null,
  screenId: null,
  screenName: null,
  cinemaName: null,
  backgroundMusicUrl: null,
  prizes: null,
  consolationPrizesClaimed: 0,
  connectionStatus: 'disconnected',
};

/** Une vue invalide n'est signalée qu'une fois par manche et par raison (pas de rafale). */
const reportedInvalidRounds = new Set<string>();

function reportInvalidView(round: RoundInfo, reason: string, extra: Record<string, unknown>) {
  const key = `${round.roundId}:${round.engineKey}:${reason}`;
  if (reportedInvalidRounds.has(key)) return;
  reportedInvalidRounds.add(key);
  reportGameIssue('console: invalid game view', {
    reason,
    engineKey: round.engineKey,
    roundId: round.roundId,
    ...extra,
  });
}

/** Valide une vue avec le schéma console du moteur ; invalide → repli, jamais d'erreur. */
function validateView(
  round: RoundInfo,
  view: unknown,
  seq: number,
): Pick<RoundFields, 'gameView' | 'gameViewInvalid'> {
  const schema = getGameViewSchema(round.engineKey);
  if (!schema) {
    reportInvalidView(round, 'unknown_engine', { seq });
    return { gameView: null, gameViewInvalid: true };
  }
  const parsed = schema.safeParse(view);
  if (!parsed.success) {
    reportInvalidView(round, 'schema_mismatch', {
      seq,
      issues: (parsed.error?.issues ?? [])
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return { gameView: null, gameViewInvalid: true };
  }
  // On garde l'objet reçu (le schéma ne transforme rien) : une vue est complète.
  return { gameView: view, gameViewInvalid: false };
}

/** Champs de manche d'un snapshot (`round`, `gameView`, `gameSeq`, règle 5). */
function roundFieldsFromSnapshot(snap: Record<string, unknown>): RoundFields {
  const parsedRound = roundInfoSchema.safeParse(snap.round);
  if (!parsedRound.success) {
    // Entracte entre deux manches : le classement de la manche terminée (B5).
    const ended = roundEndedSchema.safeParse(snap.roundEnded);
    return { ...EMPTY_ROUND, roundScoreboard: ended.success ? ended.data : null };
  }
  const round = parsedRound.data;
  const gameSeq =
    typeof snap.gameSeq === 'number' && Number.isInteger(snap.gameSeq) && snap.gameSeq >= 0
      ? snap.gameSeq
      : 0;
  const view =
    snap.gameView == null
      ? { gameView: null, gameViewInvalid: false }
      : validateView(round, snap.gameView, gameSeq);
  return { round, ...view, gameSeq, roundScoreboard: null };
}

/**
 * Scores à jour d'un classement (révélation, fin de manche) reportés sur la liste des joueurs.
 * Un joueur absent du classement garde sa ligne ; un joueur inconnu est ajouté.
 */
function mergeScores(players: PlayerLive[], board: ConsoleScoreEntry[]): PlayerLive[] {
  const byId = new Map(board.map((b) => [b.playerId, b]));
  const merged = players.map((p) => {
    const b = byId.get(p.playerId);
    if (!b) return p;
    byId.delete(p.playerId);
    return { ...p, pseudo: b.pseudo, avatarUrl: b.avatarUrl, scoreTotal: b.scoreTotal };
  });
  for (const b of byId.values()) {
    merged.push({
      playerId: b.playerId,
      pseudo: b.pseudo,
      avatarUrl: b.avatarUrl,
      scoreTotal: b.scoreTotal,
      status: 'active',
    });
  }
  return merged;
}

/** Classement porté par une vue valide (règle console du moteur), sinon null. */
function viewScoreboard(
  round: RoundInfo,
  fields: Pick<RoundFields, 'gameView' | 'gameViewInvalid'>,
) {
  if (fields.gameViewInvalid || fields.gameView == null) return null;
  return getConsoleRules(round.engineKey)?.scoreboard(fields.gameView) ?? null;
}

export const useLiveSessionStore = create<LiveSessionState>((set, get) => ({
  ...INITIAL,

  hydrateFromSession: (session) => {
    set({
      sessionId: session.id,
      slugShort: session.slugShort,
      state: session.state as SessionState,
      totalPlayers: session.totalPlayers,
      quiz: session.quiz,
      rounds: session.rounds ?? [],
      screenId: session.screenId,
      screenName: session.screenName,
      cinemaName: session.cinemaName,
      backgroundMusicUrl: session.backgroundMusicUrl,
      consolationPrizesClaimed: session.consolationPrizesClaimed ?? 0,
      players: session.players.map((p) => ({
        playerId: p.id,
        pseudo: p.pseudo,
        avatarUrl: p.avatarUrl ?? null,
        scoreTotal: p.scoreTotal,
        status: p.status,
      })),
    });
  },

  setConnectionStatus: (s) => set({ connectionStatus: s }),

  applySocketSnapshot: (p) => {
    const sess = p.session as
      | {
          sessionId: string;
          slugShort: string;
          state: string;
          totalPlayers: number;
          audioMuted: boolean;
        }
      | undefined;
    if (!sess) return;

    const playersRaw = p.players as
      | {
          playerId: string;
          pseudo: string;
          avatarUrl?: string | null;
          scoreTotal: number;
          joinedAt: string;
        }[]
      | undefined;

    const fs = p.finalScoreboard as
      | {
          playerId: string;
          pseudo: string;
          avatarUrl?: string | null;
          scoreTotal: number;
          rank: number;
        }[]
      | undefined;

    // Le snapshot remplace tout l'état de jeu (règle 5) ; les `game:state` suivants de
    // `seq <= gameSeq` seront ignorés.
    set({
      sessionId: sess.sessionId,
      slugShort: sess.slugShort,
      state: (fs ? 'ended' : sess.state) as SessionState,
      totalPlayers: sess.totalPlayers,
      lobbyRemainingMs:
        sess.state === 'lobby' ? ((p.lobbyTimerRemainingMs as number | undefined) ?? null) : null,
      audioMuted: sess.audioMuted,
      prizes: (p.prizes as SessionPrizesDisplay | undefined) ?? null,
      players:
        playersRaw?.map((pl) => ({
          playerId: pl.playerId,
          pseudo: pl.pseudo,
          avatarUrl: pl.avatarUrl ?? null,
          scoreTotal: pl.scoreTotal,
          status: 'active',
        })) ?? get().players,
      ...roundFieldsFromSnapshot(p),
      ...(fs
        ? {
            finalScoreboard: fs.map((s) => ({
              playerId: s.playerId,
              pseudo: s.pseudo,
              avatarUrl: s.avatarUrl ?? null,
              scoreTotal: s.scoreTotal,
              status: 'active',
            })),
            winnerPlayerId: null,
          }
        : {}),
    });
  },

  applyEvent: (eventName, payload) => {
    switch (eventName) {
      case 'session:state_changed': {
        const p = payload as SessionStateChangedPayload;
        set({ state: p.newState as SessionState });
        break;
      }
      case 'session:started': {
        set({ state: 'running', lobbyRemainingMs: null });
        break;
      }
      case 'session:lobby_timer_update': {
        const p = payload as SessionLobbyTimerUpdatePayload;
        set({ lobbyRemainingMs: p.remainingMs });
        break;
      }
      case 'round:started': {
        const parsed = roundInfoSchema.safeParse(payload);
        if (!parsed.success) return;
        // Nouvelle manche : la vue précédente et son seq n'ont plus de sens.
        if (get().round?.roundId === parsed.data.roundId) {
          set({ round: parsed.data });
        } else {
          set({ ...EMPTY_ROUND, round: parsed.data });
        }
        break;
      }
      case 'game:state': {
        const parsed = gameStateSchema.safeParse(payload);
        if (!parsed.success) return;
        const env = parsed.data;
        const state = get();
        const clock = pushClockSample(state.clockSamples, env.serverNow);
        const round = state.round;
        // Autre manche, ou vue ancienne arrivée en retard : ignorée (règle 2).
        if (!round || env.roundId !== round.roundId || env.seq <= state.gameSeq) {
          set({ clockSamples: clock.samples, clockOffsetMs: clock.offsetMs });
          return;
        }
        const view = validateView(round, env.view, env.seq);
        const board = viewScoreboard(round, view);
        set({
          ...view,
          gameSeq: env.seq,
          clockSamples: clock.samples,
          clockOffsetMs: clock.offsetMs,
          ...(board ? { players: mergeScores(state.players, board) } : {}),
        });
        break;
      }
      case 'round:ended': {
        const parsed = roundEndedSchema.safeParse(payload);
        if (!parsed.success) return;
        set({
          roundScoreboard: parsed.data,
          players: mergeScores(get().players, parsed.data.scoreboard),
        });
        break;
      }
      case 'session:paused': {
        set({ state: 'paused' });
        break;
      }
      case 'session:resumed': {
        set({ state: 'running' });
        break;
      }
      case 'session:audio_muted': {
        const p = payload as SessionAudioMutedPayload;
        set({ audioMuted: p.muted });
        break;
      }
      case 'session:ended': {
        const p = payload as SessionEndedPayload;
        set({
          state: 'ended',
          finalScoreboard: p.finalScoreboard.map((s) => ({
            playerId: s.playerId,
            pseudo: s.pseudo,
            avatarUrl: s.avatarUrl ?? null,
            scoreTotal: s.scoreTotal,
            status: 'active',
          })),
          winnerPlayerId: p.winnerPlayerId,
          prizes: p.prizes ?? get().prizes,
        });
        break;
      }
      case 'session:aborted': {
        const p = payload as SessionAbortedPayload;
        set({ state: 'aborted', abortReason: p.reason, lobbyRemainingMs: null });
        break;
      }
      case 'player:joined': {
        const p = payload as PlayerJoinedPayload;
        set({
          players: [
            ...get().players,
            {
              playerId: p.playerId,
              pseudo: p.pseudo,
              avatarUrl: p.avatarUrl ?? null,
              scoreTotal: 0,
              status: 'active',
            },
          ],
          totalPlayers: get().totalPlayers + 1,
        });
        break;
      }
      case 'player:left': {
        const p = payload as PlayerLeftPayload;
        set({
          players: get().players.filter((pl) => pl.playerId !== p.playerId),
          totalPlayers: Math.max(0, get().totalPlayers - 1),
        });
        break;
      }
    }
  },

  reset: () => {
    reportedInvalidRounds.clear();
    set({ ...INITIAL, clockSamples: [], players: [] });
  },
}));

/** Progression affichée dans l'en-tête (« Question 2 / 10 » pour le quiz), ou null. */
export function selectProgressLabel(
  s: Pick<LiveSessionState, 'round' | 'gameView' | 'gameViewInvalid'>,
): string | null {
  if (!s.round || s.gameViewInvalid || s.gameView == null) return null;
  return getConsoleRules(s.round.engineKey)?.progressLabel(s.gameView) ?? null;
}

/**
 * Le bouton « Forcer la fin » a un effet sur la vue courante. Manche affichée en repli (vue
 * invalide, moteur inconnu) : laissé actif, le serveur décide (`force-advance` est générique).
 */
export function selectCanForceAdvance(
  s: Pick<LiveSessionState, 'round' | 'gameView' | 'gameViewInvalid'>,
): boolean {
  if (!s.round) return false;
  const rules = getConsoleRules(s.round.engineKey);
  if (s.gameViewInvalid || !rules) return true;
  if (s.gameView == null) return false;
  return rules.canForceAdvance(s.gameView);
}

/**
 * Contenu console de la manche active (bonnes réponses du quiz de CETTE manche, B5). Séance
 * sans manche connue (données anciennes) : le quiz de la séance.
 */
export function selectRoundContent(
  s: Pick<LiveSessionState, 'round' | 'rounds' | 'quiz'>,
): QuizFull | null {
  if (!s.round) return null;
  const match = s.rounds.find((r) => r.roundId === s.round!.roundId);
  if (match) return match.content;
  return s.rounds.length === 0 ? s.quiz : null;
}

/**
 * Entracte entre deux manches : la manche affichée est terminée (`round:ended`) et une autre
 * suit. Renvoie le classement de la manche terminée, sinon null.
 */
export function selectInterlude(
  s: Pick<LiveSessionState, 'round' | 'roundScoreboard'>,
): RoundEndedPayload | null {
  const board = s.roundScoreboard;
  if (!board || board.position >= board.totalRounds) return null;
  if (s.round && s.round.roundId !== board.roundId) return null;
  return board;
}

/** Une manche suit celle en cours (ou l'entracte) : « Passer à la manche suivante » a un sens. */
export function selectHasNextRound(
  s: Pick<LiveSessionState, 'round' | 'roundScoreboard'>,
): boolean {
  if (selectInterlude(s)) return true;
  return !!s.round && s.round.position < s.round.totalRounds;
}

/**
 * Manche affichée dans l'en-tête : « Manche 2/3 — <titre> » (manche en cours, ou la dernière
 * terminée pendant l'entracte), ou null hors manche.
 */
export function selectRoundLabel(
  s: Pick<LiveSessionState, 'round' | 'roundScoreboard' | 'rounds'>,
): string | null {
  if (s.round) {
    return `Manche ${s.round.position}/${s.round.totalRounds} — ${s.round.game.title}`;
  }
  const board = s.roundScoreboard;
  if (!board) return null;
  const title = s.rounds.find((r) => r.roundId === board.roundId)?.game.title;
  return `Manche ${board.position}/${board.totalRounds}${title ? ` — ${title}` : ''}`;
}
