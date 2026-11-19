import { create } from 'zustand';
import {
  gameStateSchema,
  roundEndedSchema,
  roundInfoSchema,
  type RoundEndedPayload,
  type RoundInfo,
  type SessionPrizesDisplay,
} from '@quiz-app/validation';
import { pushClockSample } from '@quiz-app/ui';
import { getGameViewSchema } from '@/games/view-schemas';
import { reportGameIssue } from '@/lib/report-issue';

/**
 * Écran de plateforme. `game` = la manche en cours, rendue par `<GameStage />` d'après
 * `round.engineKey` et `gameView` ; tout le reste est hors moteur.
 */
export type PlayerUiState =
  | 'lobby'
  | 'game'
  | 'paused'
  | 'round_end'
  | 'final_results'
  | 'aborted'
  | 'kicked';

export type PlayerConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export type FinalScoreboardEntry = {
  playerId: string;
  pseudo: string;
  avatarUrl?: string | null;
  scoreTotal: number;
  rank: number;
};

interface PlayerState {
  playerId: string | null;
  pseudo: string | null;
  avatarUrl: string | null;
  resumeToken: string | null;
  sessionId: string | null;
  slugShort: string | null;

  cinemaName: string | null;
  quizTitle: string | null;
  brandingJson: Record<string, unknown> | null;

  uiState: PlayerUiState;
  state: string | null;
  totalPlayers: number;

  // ─── Manche (protocole commun à tous les moteurs) ───
  /** Manche active (`round:started` ou snapshot), null hors manche. */
  round: RoundInfo | null;
  /** Dernière vue complète appliquée, validée par le schéma du moteur (null si aucune). */
  gameView: unknown;
  /** La dernière vue reçue était invalide (ou le moteur inconnu) : rendu de repli. */
  gameViewInvalid: boolean;
  /** `seq` de la dernière vue appliquée : tout `game:state` de `seq <= gameSeq` est ignoré. */
  gameSeq: number;
  /** `heure serveur - heure locale` (ms), médiane des derniers `serverNow` reçus. */
  clockOffsetMs: number;
  clockSamples: number[];
  /** Classement de fin de manche (`round:ended`). */
  roundScoreboard: RoundEndedPayload | null;

  scoreTotal: number;
  currentRank: number | null;

  finalRank: number | null;
  finalScoreboard: FinalScoreboardEntry[] | null;
  prizeAvailabilityByRank: { rank1?: boolean; rank2?: boolean; rank3?: boolean } | null;
  prizes: SessionPrizesDisplay | null;
  /**
   * Arrivé pendant la partie (affiché sur l'écran final). Depuis l'accusé de join, puis
   * `player.joinedLate` du snapshot (un rechargement de page le conserve).
   */
  joinedLate: boolean;

  players: { playerId: string; pseudo: string; avatarUrl?: string | null }[];

  connectionStatus: PlayerConnectionStatus;

  hydrate: (data: {
    playerId: string;
    pseudo: string;
    avatarUrl?: string | null;
    resumeToken: string;
    sessionId: string;
    slugShort: string;
    cinemaName?: string;
    quizTitle?: string;
    brandingJson?: Record<string, unknown> | null;
    scoreTotal?: number;
    joinedQuestionPosition?: number | null;
    stateSnapshot?: Record<string, unknown> | null;
  }) => void;
  applyEvent: (event: string, payload: unknown) => void;
  applySnapshot: (snap: Record<string, unknown>) => void;
  /** `player:resume` refusé avec `PLAYER_KICKED` (ou joueur exclu en cours de partie). */
  markKicked: () => void;
  setConnectionStatus: (s: PlayerConnectionStatus) => void;
  reset: () => void;
}

type RoundFields = Pick<
  PlayerState,
  'round' | 'gameView' | 'gameViewInvalid' | 'gameSeq' | 'roundScoreboard'
>;

const EMPTY_ROUND: RoundFields = {
  round: null,
  gameView: null,
  gameViewInvalid: false,
  gameSeq: 0,
  roundScoreboard: null,
};

/** Une vue invalide n'est signalée qu'une fois par manche (pas de rafale Sentry). */
const reportedInvalidRounds = new Set<string>();

function reportInvalidView(round: RoundInfo, reason: string, extra: Record<string, unknown>) {
  const key = `${round.roundId}:${round.engineKey}:${reason}`;
  if (reportedInvalidRounds.has(key)) return;
  reportedInvalidRounds.add(key);
  reportGameIssue('mobile: invalid game view', {
    reason,
    engineKey: round.engineKey,
    roundId: round.roundId,
    ...extra,
  });
}

/** Valide une vue avec le schéma du moteur de la manche. */
function validateView(
  round: RoundInfo,
  view: unknown,
  seq: number,
): Pick<PlayerState, 'gameView' | 'gameViewInvalid'> {
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
  if (!parsedRound.success) return { ...EMPTY_ROUND };
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

function hasGame(s: Pick<PlayerState, 'gameView' | 'gameViewInvalid'>): boolean {
  return s.gameView != null || s.gameViewInvalid;
}

/** États terminaux : plus aucun événement de jeu ne les quitte (sauf un nouveau snapshot). */
function isTerminal(ui: PlayerUiState): boolean {
  return ui === 'final_results' || ui === 'aborted' || ui === 'kicked';
}

const INITIAL = {
  playerId: null,
  pseudo: null,
  avatarUrl: null,
  resumeToken: null,
  sessionId: null,
  slugShort: null,
  cinemaName: null,
  quizTitle: null,
  brandingJson: null,
  uiState: 'lobby' as PlayerUiState,
  state: null,
  totalPlayers: 0,
  ...EMPTY_ROUND,
  clockOffsetMs: 0,
  clockSamples: [] as number[],
  scoreTotal: 0,
  currentRank: null,
  finalRank: null,
  finalScoreboard: null,
  prizeAvailabilityByRank: null,
  prizes: null,
  joinedLate: false,
  players: [] as PlayerState['players'],
  connectionStatus: 'disconnected' as PlayerConnectionStatus,
} satisfies Partial<PlayerState>;

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...INITIAL,

  hydrate: (data) => {
    const snapshot = data.stateSnapshot ?? null;
    const roundFields = snapshot ? roundFieldsFromSnapshot(snapshot) : { ...EMPTY_ROUND };
    const sessionState = (snapshot?.sessionState as string | undefined) ?? null;
    let uiState: PlayerUiState = 'lobby';
    if (sessionState === 'paused') uiState = 'paused';
    else if (hasGame(roundFields)) uiState = 'game';

    set({
      playerId: data.playerId,
      pseudo: data.pseudo,
      avatarUrl: data.avatarUrl ?? null,
      resumeToken: data.resumeToken,
      sessionId: data.sessionId,
      slugShort: data.slugShort,
      cinemaName: data.cinemaName ?? null,
      quizTitle: data.quizTitle ?? null,
      brandingJson: data.brandingJson ?? null,
      scoreTotal: data.scoreTotal ?? 0,
      joinedLate: data.joinedQuestionPosition != null,
      uiState,
      state: sessionState,
      ...roundFields,
      finalRank: null,
      finalScoreboard: null,
    });
    try {
      localStorage.setItem('quiz_resume_token', data.resumeToken);
      localStorage.setItem('quiz_player_id', data.playerId);
      localStorage.setItem('quiz_session_id', data.sessionId);
    } catch {
      // Stockage indisponible (navigation privée) : le resume échouera, rien d'autre à faire.
    }
  },

  setConnectionStatus: (s) => set({ connectionStatus: s }),

  markKicked: () => set({ uiState: 'kicked', ...EMPTY_ROUND }),

  applySnapshot: (snap) => {
    if (get().uiState === 'kicked') return;
    const player = snap.player as
      | {
          playerId: string;
          pseudo: string;
          avatarUrl?: string | null;
          scoreTotal: number;
          currentRank: number | null;
          joinedLate?: boolean;
        }
      | undefined;
    const session = snap.session as
      | { sessionId: string; slugShort: string; state: string; totalPlayers: number }
      | undefined;
    if (!player || !session) return;

    const base = {
      playerId: player.playerId,
      pseudo: player.pseudo,
      avatarUrl: player.avatarUrl ?? get().avatarUrl,
      scoreTotal: player.scoreTotal,
      currentRank: player.currentRank,
      // Absent d'un ancien snapshot : on garde la valeur connue (accusé de join).
      joinedLate: typeof player.joinedLate === 'boolean' ? player.joinedLate : get().joinedLate,
      sessionId: session.sessionId,
      slugShort: session.slugShort,
      state: session.state,
      totalPlayers: session.totalPlayers,
      ...roundFieldsFromSnapshot(snap),
    };

    const finalResults = snap.finalResults as
      | { rank: number; finalScoreboard: FinalScoreboardEntry[] }
      | undefined;

    switch (session.state) {
      case 'lobby':
        set({
          ...base,
          uiState: 'lobby',
          prizes: (snap.prizes as SessionPrizesDisplay | undefined) ?? null,
        });
        return;
      case 'aborted':
        set({ ...base, uiState: 'aborted' });
        return;
      case 'ended':
        if (finalResults) {
          set({
            ...base,
            uiState: 'final_results',
            finalRank: finalResults.rank,
            finalScoreboard: finalResults.finalScoreboard,
            prizeAvailabilityByRank:
              (snap.prizeAvailabilityByRank as PlayerState['prizeAvailabilityByRank']) ?? null,
            prizes: (snap.prizes as SessionPrizesDisplay | undefined) ?? null,
          });
          return;
        }
        set({ ...base, uiState: 'lobby' });
        return;
      case 'paused':
        set({ ...base, uiState: 'paused' });
        return;
      default:
        set({ ...base, uiState: hasGame(base) ? 'game' : 'lobby' });
    }
  },

  applyEvent: (event, payload) => {
    const state = get();
    if (state.uiState === 'kicked') return;
    const p = (payload ?? {}) as Record<string, unknown>;

    switch (event) {
      case 'session:state_changed':
        set({ state: p.newState as string });
        break;

      case 'player:joined':
        set({
          players: [
            ...state.players,
            {
              playerId: p.playerId as string,
              pseudo: p.pseudo as string,
              avatarUrl: (p.avatarUrl as string | null) ?? null,
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
        // Nouvelle manche : la vue précédente et son seq n'ont plus de sens.
        if (state.round?.roundId === parsed.data.roundId) {
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
        const clock = pushClockSample(state.clockSamples, env.serverNow);
        const round = state.round;
        // Autre manche, ou vue ancienne arrivée en retard : ignorée (règle 2).
        if (!round || env.roundId !== round.roundId || env.seq <= state.gameSeq) {
          set({ clockSamples: clock.samples, clockOffsetMs: clock.offsetMs });
          return;
        }
        const view = validateView(round, env.view, env.seq);
        const uiState: PlayerUiState =
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

      case 'round:ended': {
        const parsed = roundEndedSchema.safeParse(payload);
        if (!parsed.success) return;
        const board = parsed.data;
        const myIdx = board.scoreboard.findIndex((e) => e.playerId === state.playerId);
        const mine = myIdx >= 0 ? board.scoreboard[myIdx] : undefined;
        const isLastRound = board.position >= board.totalRounds;
        set({
          roundScoreboard: board,
          scoreTotal: mine?.scoreTotal ?? state.scoreTotal,
          currentRank: mine ? myIdx + 1 : state.currentRank,
          // Dernière manche : `session:ended` suit aussitôt, l'écran final prend la place
          // (pas d'écran intermédiaire affiché quelques millisecondes).
          ...(isLastRound || isTerminal(state.uiState) || state.uiState === 'paused'
            ? {}
            : { uiState: 'round_end' as const }),
        });
        break;
      }

      case 'session:paused':
        if (isTerminal(state.uiState)) return;
        set({ uiState: 'paused' });
        break;

      case 'session:resumed':
        if (state.uiState !== 'paused') return;
        set({ uiState: hasGame(state) ? 'game' : state.roundScoreboard ? 'round_end' : 'lobby' });
        break;

      case 'session:ended': {
        const finalScoreboard = (p.finalScoreboard ?? []) as FinalScoreboardEntry[];
        const myFinal = finalScoreboard.find((e) => e.playerId === state.playerId);
        const prizeAvailabilityByRank = (p.prizeAvailabilityByRank ??
          null) as PlayerState['prizeAvailabilityByRank'];
        set({
          uiState: 'final_results',
          finalScoreboard,
          finalRank: myFinal?.rank ?? null,
          scoreTotal: myFinal?.scoreTotal ?? state.scoreTotal,
          prizeAvailabilityByRank,
          prizes: (p.prizes as SessionPrizesDisplay | undefined) ?? null,
        });
        break;
      }

      case 'session:aborted':
        set({ uiState: 'aborted' });
        break;
    }
  },

  reset: () => {
    reportedInvalidRounds.clear();
    set({ ...INITIAL, clockSamples: [], players: [] });
  },
}));
