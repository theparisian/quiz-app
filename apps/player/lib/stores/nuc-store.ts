import { create } from 'zustand';
import {
  readAnswerDisplayStyle,
  readLateJoinQrEnabled,
  readLobbyPrizesEnabled,
  type AnswerDisplayStyle,
} from '@quiz-app/design-tokens';
import {
  gameCueSchema,
  gameStateSchema,
  roundEndedSchema,
  roundInfoSchema,
  type ResolvedQuizAudio,
  type RoundEndedPayload,
  type RoundInfo,
  type SessionPrizesDisplay,
} from '@quiz-app/validation';
import { pushClockSample } from '@quiz-app/ui';
import { getGameViewSchema } from '@/games/view-schemas';
import { getScreenRules } from '@/games/screen-rules';
import { publishGameCue } from '@/lib/game-cues';
import { reportGameIssue } from '@/lib/report-issue';

/**
 * État de plateforme de l'écran. `game` = la manche en cours, rendue par `<GameStage />`
 * d'après `round.engineKey` et `gameView` ; tout le reste est hors moteur. La pause est un
 * calque (`isPaused`) au-dessus de l'état courant.
 */
export type NucUiState = 'idle' | 'lobby' | 'game' | 'round_end' | 'final_results' | 'aborted';

/** Ce que l'écran affiche réellement (voir `selectScreenDisplay`). */
export type NucDisplay = NucUiState;

export type NucConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface ScoreEntry {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
  scoreTotal: number;
}

interface FinalEntry {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
  scoreTotal: number;
  rank: number;
}

interface PlayerInfo {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
  joinedAt: string;
}

type QuizBackgroundMediaType = 'image' | 'video';

interface QuizBackgroundState {
  quizBackgroundMediaUrl: string | null;
  quizBackgroundMediaType: QuizBackgroundMediaType | null;
  quizBackgroundOverlayOpacity: number;
  lobbyBackgroundMediaUrl: string | null;
  lobbyBackgroundMediaType: QuizBackgroundMediaType | null;
  lobbyBackgroundOverlayOpacity: number;
  quizAnswerDisplayStyle: AnswerDisplayStyle;
  lateJoinQrEnabled: boolean;
  lobbyPrizesEnabled: boolean;
}

interface RoundFields {
  /** Manche active (`round:started` ou snapshot), null hors manche. */
  round: RoundInfo | null;
  /** Dernière vue complète appliquée, validée par le schéma du moteur (null si aucune). */
  gameView: unknown;
  /** La dernière vue reçue était invalide (ou le moteur inconnu) : rendu de repli. */
  gameViewInvalid: boolean;
  /** `seq` de la dernière vue appliquée : tout `game:state` de `seq <= gameSeq` est ignoré. */
  gameSeq: number;
  /** Classement de fin de manche (`round:ended`). */
  roundScoreboard: RoundEndedPayload | null;
}

interface NucState extends QuizBackgroundState, RoundFields {
  nucId: string | null;
  screenId: string | null;
  cinemaSlug: string | null;
  cinemaName: string | null;
  cinemaLogoUrl: string | null;
  backgroundMusicUrl: string | null;

  uiState: NucUiState;
  isPaused: boolean;
  audioMuted: boolean;

  sessionId: string | null;
  slugShort: string | null;
  /** Jeton long encodé dans le QR code (null pour une session antérieure à sa création). */
  joinToken: string | null;

  players: PlayerInfo[];
  totalPlayers: number;
  lobbyRemainingMs: number | null;
  /** Classement de plateforme du snapshot (5 premiers, 3 en fin). */
  scoreboard: ScoreEntry[];

  audio: ResolvedQuizAudio | null;

  /** `heure serveur - heure locale` (ms), médiane des derniers `serverNow` reçus. */
  clockOffsetMs: number;
  clockSamples: number[];

  finalScoreboard: FinalEntry[] | null;
  winnerPlayerId: string | null;
  prizes: SessionPrizesDisplay | null;
  abortReason: string | null;

  connectionStatus: NucConnectionStatus;

  setNucContext: (ctx: {
    nucId: string;
    screenId: string;
    cinemaSlug: string;
    cinemaName?: string;
    cinemaLogoUrl?: string | null;
    backgroundMusicUrl?: string | null;
  }) => void;
  setSessionContext: (ctx: {
    sessionId: string;
    slugShort: string;
    joinToken?: string | null;
  }) => void;
  applyEvent: (event: string, payload: unknown) => void;
  applySnapshot: (snap: Record<string, unknown>) => void;
  setConnectionStatus: (s: NucConnectionStatus) => void;
  reset: () => void;
}

const emptyQuizBackground: QuizBackgroundState = {
  quizBackgroundMediaUrl: null,
  quizBackgroundMediaType: null,
  quizBackgroundOverlayOpacity: 0,
  lobbyBackgroundMediaUrl: null,
  lobbyBackgroundMediaType: null,
  lobbyBackgroundOverlayOpacity: 0,
  quizAnswerDisplayStyle: 'multicolor',
  lateJoinQrEnabled: false,
  lobbyPrizesEnabled: false,
};

const EMPTY_ROUND: RoundFields = {
  round: null,
  gameView: null,
  gameViewInvalid: false,
  gameSeq: 0,
  roundScoreboard: null,
};

function readPrizes(snap: Record<string, unknown>): SessionPrizesDisplay | null {
  return (snap.prizes as SessionPrizesDisplay | undefined) ?? null;
}

function readAudio(payload: Record<string, unknown>): ResolvedQuizAudio | null {
  return (payload.audio as ResolvedQuizAudio | undefined) ?? null;
}

function readQuizBackground(payload: Record<string, unknown>): QuizBackgroundState {
  const quiz = payload.quiz as
    | {
        backgroundMediaUrl?: string | null;
        backgroundMediaType?: QuizBackgroundMediaType | null;
        backgroundOverlayOpacity?: number;
        lobbyBackgroundMediaUrl?: string | null;
        lobbyBackgroundMediaType?: QuizBackgroundMediaType | null;
        lobbyBackgroundOverlayOpacity?: number;
        brandingJson?: unknown;
      }
    | undefined;
  if (!quiz) return emptyQuizBackground;
  const type = quiz.backgroundMediaType;
  const lobbyType = quiz.lobbyBackgroundMediaType;
  return {
    quizBackgroundMediaUrl: quiz.backgroundMediaUrl ?? null,
    quizBackgroundMediaType: type === 'image' || type === 'video' ? type : null,
    quizBackgroundOverlayOpacity: quiz.backgroundOverlayOpacity ?? 0,
    lobbyBackgroundMediaUrl: quiz.lobbyBackgroundMediaUrl ?? null,
    lobbyBackgroundMediaType: lobbyType === 'image' || lobbyType === 'video' ? lobbyType : null,
    lobbyBackgroundOverlayOpacity: quiz.lobbyBackgroundOverlayOpacity ?? 0,
    quizAnswerDisplayStyle: readAnswerDisplayStyle(quiz.brandingJson),
    lateJoinQrEnabled: readLateJoinQrEnabled(quiz.brandingJson),
    lobbyPrizesEnabled: readLobbyPrizesEnabled(quiz.brandingJson),
  };
}

/** Une vue invalide n'est signalée qu'une fois par manche et par raison (pas de rafale). */
const reportedInvalidRounds = new Set<string>();

function reportInvalidView(round: RoundInfo, reason: string, extra: Record<string, unknown>) {
  const key = `${round.roundId}:${round.engineKey}:${reason}`;
  if (reportedInvalidRounds.has(key)) return;
  reportedInvalidRounds.add(key);
  reportGameIssue('screen: invalid game view', {
    reason,
    engineKey: round.engineKey,
    roundId: round.roundId,
    ...extra,
  });
}

/** Valide une vue avec le schéma du moteur de la manche ; invalide → repli, jamais d'erreur. */
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

function hasGame(s: Pick<RoundFields, 'gameView' | 'gameViewInvalid'>): boolean {
  return s.gameView != null || s.gameViewInvalid;
}

/** États terminaux : plus aucun événement de jeu ne les quitte (sauf un snapshot ou un reset). */
function isTerminal(ui: NucUiState): boolean {
  return ui === 'final_results' || ui === 'aborted' || ui === 'idle';
}

/**
 * Ce que l'écran affiche : `uiState`, sauf une vue de jeu qui laisse le lobby à l'écran (règle
 * du moteur, ex. compte à rebours d'avant la première question du quiz). Sert à la page et au
 * directeur audio (musique), pour qu'ils ne divergent jamais.
 */
export function selectScreenDisplay(
  s: Pick<NucState, 'uiState' | 'round' | 'gameView' | 'gameViewInvalid' | 'roundScoreboard'>,
): NucDisplay {
  if (s.uiState !== 'game') return s.uiState;
  if (s.gameViewInvalid || s.gameView == null || !s.round) return 'game';
  const rules = getScreenRules(s.round.engineKey);
  if (!rules?.showsLobby(s.gameView)) return 'game';
  // Le lobby n'appartient qu'à la première manche ; ensuite le classement de la manche
  // précédente reste affiché jusqu'au jeu (B5).
  if (s.round.position > 1) return s.roundScoreboard ? 'round_end' : 'game';
  return 'lobby';
}

const initialState = {
  nucId: null as string | null,
  screenId: null as string | null,
  cinemaSlug: null as string | null,
  cinemaName: null as string | null,
  cinemaLogoUrl: null as string | null,
  backgroundMusicUrl: null as string | null,

  uiState: 'idle' as NucUiState,
  isPaused: false,
  audioMuted: false,

  sessionId: null as string | null,
  slugShort: null as string | null,
  joinToken: null as string | null,

  players: [] as PlayerInfo[],
  totalPlayers: 0,
  lobbyRemainingMs: null as number | null,
  scoreboard: [] as ScoreEntry[],

  audio: null as ResolvedQuizAudio | null,

  ...EMPTY_ROUND,
  clockOffsetMs: 0,
  clockSamples: [] as number[],

  finalScoreboard: null as FinalEntry[] | null,
  winnerPlayerId: null as string | null,
  prizes: null as SessionPrizesDisplay | null,
  abortReason: null as string | null,
  connectionStatus: 'disconnected' as NucConnectionStatus,

  ...emptyQuizBackground,
};

export const useNucStore = create<NucState>((set, get) => ({
  ...initialState,

  setNucContext: (ctx) =>
    set({
      nucId: ctx.nucId,
      screenId: ctx.screenId,
      cinemaSlug: ctx.cinemaSlug,
      cinemaName: ctx.cinemaName ?? null,
      cinemaLogoUrl: ctx.cinemaLogoUrl ?? null,
      backgroundMusicUrl: ctx.backgroundMusicUrl ?? null,
    }),

  setSessionContext: (ctx) =>
    set({
      sessionId: ctx.sessionId,
      slugShort: ctx.slugShort,
      joinToken: ctx.joinToken ?? null,
      uiState: 'lobby',
      players: [],
      totalPlayers: 0,
      lobbyRemainingMs: null,
      isPaused: false,
      ...EMPTY_ROUND,
    }),

  setConnectionStatus: (s) => set({ connectionStatus: s }),

  applySnapshot: (snap) => {
    const nuc = snap.nuc as
      | {
          nucId: string;
          screenId: string;
          cinemaSlug: string;
          cinemaName: string;
          cinemaLogoUrl: string | null;
          backgroundMusicUrl: string | null;
        }
      | undefined;

    if (nuc) {
      get().setNucContext({
        nucId: nuc.nucId,
        screenId: nuc.screenId,
        cinemaSlug: nuc.cinemaSlug,
        cinemaName: nuc.cinemaName,
        cinemaLogoUrl: nuc.cinemaLogoUrl,
        backgroundMusicUrl: nuc.backgroundMusicUrl,
      });
    }

    const session = snap.session as
      | {
          sessionId: string;
          slugShort: string;
          joinToken?: string | null;
          state: string;
          totalPlayers: number;
        }
      | null
      | undefined;

    const audioMuted = (snap.audioMuted as boolean | undefined) ?? false;

    if (session === null || session === undefined) {
      set({
        sessionId: null,
        slugShort: null,
        joinToken: null,
        uiState: 'idle',
        isPaused: false,
        audioMuted,
        totalPlayers: 0,
        lobbyRemainingMs: null,
        players: [],
        scoreboard: [],
        finalScoreboard: null,
        prizes: null,
        audio: null,
        ...EMPTY_ROUND,
        ...emptyQuizBackground,
      });
      return;
    }

    const roundFields = roundFieldsFromSnapshot(snap);
    const base = {
      sessionId: session.sessionId,
      slugShort: session.slugShort,
      joinToken: session.joinToken ?? null,
      totalPlayers: session.totalPlayers,
      lobbyRemainingMs: null as number | null,
      audioMuted,
      players: (snap.players as PlayerInfo[] | undefined) ?? [],
      scoreboard: (snap.scoreboard as ScoreEntry[] | undefined) ?? [],
      isPaused: session.state === 'paused',
      audio: readAudio(snap),
      ...readQuizBackground(snap),
      ...roundFields,
    };

    switch (session.state) {
      case 'lobby':
        set({
          ...base,
          uiState: 'lobby',
          lobbyRemainingMs: (snap.lobbyTimerRemainingMs as number | undefined) ?? null,
          finalScoreboard: null,
          winnerPlayerId: null,
          prizes: readPrizes(snap),
        });
        return;
      case 'aborted':
        set({ ...base, uiState: 'aborted', abortReason: null });
        return;
      case 'ended':
        set({
          ...base,
          uiState: 'final_results',
          finalScoreboard: (snap.finalScoreboard as FinalEntry[] | undefined) ?? null,
          winnerPlayerId: null,
          prizes: readPrizes(snap),
        });
        return;
      default:
        // running / paused : la manche en cours, le classement de l'entracte entre deux
        // manches, ou le lobby tant qu'aucune vue n'existe.
        set({
          ...base,
          uiState: hasGame(roundFields)
            ? 'game'
            : roundFields.roundScoreboard
              ? 'round_end'
              : 'lobby',
        });
    }
  },

  applyEvent: (event, payload) => {
    const state = get();
    const p = (payload ?? {}) as Record<string, unknown>;

    switch (event) {
      case 'session:started':
        set({
          uiState: 'lobby',
          lobbyRemainingMs: null,
          audio: readAudio(p) ?? state.audio,
          ...readQuizBackground(p),
        });
        break;

      case 'session:theme_changed':
        // Manche suivante (B5) : habillage et sons de son jeu, sans changer l'écran affiché.
        set({ audio: readAudio(p) ?? state.audio, ...readQuizBackground(p) });
        break;

      case 'session:lobby_timer_update':
        set({ lobbyRemainingMs: p.remainingMs as number });
        break;

      case 'player:joined':
        set({
          players: [
            ...state.players,
            {
              playerId: p.playerId as string,
              pseudo: p.pseudo as string,
              avatarUrl: (p.avatarUrl as string | null) ?? null,
              joinedAt: p.joinedAt as string,
            },
          ],
          totalPlayers: state.totalPlayers + 1,
        });
        break;

      case 'player:left':
        set({
          players: state.players.filter((pl) => pl.playerId !== (p.playerId as string)),
          totalPlayers: Math.max(0, state.totalPlayers - 1),
        });
        break;

      case 'round:started': {
        const parsed = roundInfoSchema.safeParse(payload);
        if (!parsed.success) return;
        // Nouvelle manche : la vue précédente et son seq n'ont plus de sens. Le classement de la
        // manche précédente reste affiché pendant le compte à rebours (`selectScreenDisplay`).
        if (state.round?.roundId === parsed.data.roundId) {
          set({ round: parsed.data });
        } else {
          set({ ...EMPTY_ROUND, round: parsed.data, roundScoreboard: state.roundScoreboard });
        }
        break;
      }

      case 'game:state': {
        const parsed = gameStateSchema.safeParse(payload);
        if (!parsed.success) return;
        const env = parsed.data;
        const clock = pushClockSample(state.clockSamples, env.serverNow);
        const round = state.round;
        // Autre manche, ou vue ancienne arrivée en retard : ignorée (règle 2).
        if (!round || env.roundId !== round.roundId || env.seq <= state.gameSeq) {
          set({ clockSamples: clock.samples, clockOffsetMs: clock.offsetMs });
          return;
        }
        const view = validateView(round, env.view, env.seq);
        const uiState: NucUiState =
          state.uiState === 'lobby' || state.uiState === 'round_end' ? 'game' : state.uiState;
        set({
          ...view,
          gameSeq: env.seq,
          clockSamples: clock.samples,
          clockOffsetMs: clock.offsetMs,
          uiState,
        });
        break;
      }

      case 'game:cue': {
        // Éphémère : jamais dans le store, seulement relayé s'il concerne la manche active.
        const parsed = gameCueSchema.safeParse(payload);
        const round = state.round;
        if (!parsed.success || !round || parsed.data.roundId !== round.roundId) return;
        if (isTerminal(state.uiState)) return;
        publishGameCue({
          roundId: round.roundId,
          engineKey: round.engineKey,
          cue: parsed.data.cue,
          data: parsed.data.data,
        });
        break;
      }

      case 'round:ended': {
        const parsed = roundEndedSchema.safeParse(payload);
        if (!parsed.success) return;
        const board = parsed.data;
        const isLastRound = board.position >= board.totalRounds;
        set({
          roundScoreboard: board,
          // Dernière manche : `session:ended` suit aussitôt et l'écran final prend la place
          // directement (pas d'écran intermédiaire affiché quelques millisecondes).
          ...(isLastRound || isTerminal(state.uiState) ? {} : { uiState: 'round_end' as const }),
        });
        break;
      }

      case 'session:paused':
        set({ isPaused: true });
        break;

      case 'session:resumed':
        set({ isPaused: false });
        break;

      case 'session:audio_muted':
        set({ audioMuted: p.muted as boolean });
        break;

      case 'session:ended': {
        const finalScoreboard = p.finalScoreboard as FinalEntry[];
        set({
          uiState: 'final_results',
          finalScoreboard,
          winnerPlayerId: (p.winnerPlayerId as string | null) ?? null,
          prizes: (p.prizes as SessionPrizesDisplay | undefined) ?? null,
          isPaused: false,
        });
        break;
      }

      case 'session:aborted':
        set({
          uiState: 'aborted',
          abortReason: (p.reason as string | null) ?? null,
          isPaused: false,
        });
        break;
    }
  },

  reset: () => {
    reportedInvalidRounds.clear();
    set({
      ...initialState,
      clockSamples: [],
      players: [],
      nucId: get().nucId,
      screenId: get().screenId,
      cinemaSlug: get().cinemaSlug,
      cinemaName: get().cinemaName,
      cinemaLogoUrl: get().cinemaLogoUrl,
      backgroundMusicUrl: get().backgroundMusicUrl,
      connectionStatus: 'disconnected',
    });
  },
}));
