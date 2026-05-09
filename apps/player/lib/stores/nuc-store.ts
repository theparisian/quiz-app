import { create } from 'zustand';

export type NucUiState =
  | 'idle'
  | 'lobby'
  | 'question'
  | 'question_results'
  | 'final_results'
  | 'aborted';

export type NucConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface ScoreEntry {
  playerId: string;
  pseudo: string;
  scoreTotal: number;
  scoreThisQuestion: number;
}

interface FinalEntry {
  playerId: string;
  pseudo: string;
  scoreTotal: number;
  rank: number;
}

interface PlayerInfo {
  playerId: string;
  pseudo: string;
  joinedAt: string;
}

interface AnswerInfo {
  id: string;
  position: string;
  text: string;
}

interface NucState {
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
  totalQuestions: number;
  currentQuestionPosition: number | null;
  currentQuestion: {
    id: string;
    text: string;
    imageUrl: string | null;
    answers: AnswerInfo[];
  } | null;
  questionStartedAt: number | null;
  questionTimeLimitMs: number;
  remainingMs: number;
  answersSubmittedCount: number;
  answersTotal: number;

  players: PlayerInfo[];
  totalPlayers: number;
  scoreboard: ScoreEntry[];
  previousScoreboard: ScoreEntry[];

  lastResults: {
    correctAnswerId: string | null;
    explanationText: string | null;
    scoreboard: ScoreEntry[];
  } | null;
  nextQuestionInMs: number | null;

  finalScoreboard: FinalEntry[] | null;
  winnerPlayerId: string | null;
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
  setSessionContext: (ctx: { sessionId: string; slugShort: string }) => void;
  applyEvent: (event: string, payload: Record<string, unknown>) => void;
  applySnapshot: (snap: Record<string, unknown>) => void;
  setConnectionStatus: (s: NucConnectionStatus) => void;
  reset: () => void;
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
  totalQuestions: 0,
  currentQuestionPosition: null as number | null,
  currentQuestion: null as NucState['currentQuestion'],
  questionStartedAt: null as number | null,
  questionTimeLimitMs: 20000,
  remainingMs: 0,
  answersSubmittedCount: 0,
  answersTotal: 0,

  players: [] as PlayerInfo[],
  totalPlayers: 0,
  scoreboard: [] as ScoreEntry[],
  previousScoreboard: [] as ScoreEntry[],

  lastResults: null as NucState['lastResults'],
  nextQuestionInMs: null as number | null,

  finalScoreboard: null as FinalEntry[] | null,
  winnerPlayerId: null as string | null,
  abortReason: null as string | null,
  connectionStatus: 'disconnected' as NucConnectionStatus,
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
      uiState: 'lobby',
      players: [],
      totalPlayers: 0,
      isPaused: false,
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
          state: string;
          totalQuestions: number;
          totalPlayers: number;
        }
      | null
      | undefined;

    const audioMuted = (snap.audioMuted as boolean | undefined) ?? false;

    if (session === null || session === undefined) {
      set({
        sessionId: null,
        slugShort: null,
        uiState: 'idle',
        isPaused: false,
        audioMuted,
        totalQuestions: 0,
        totalPlayers: 0,
        players: [],
        scoreboard: [],
        currentQuestion: null,
        finalScoreboard: null,
        lastResults: null,
      });
      return;
    }

    const players = (snap.players as PlayerInfo[]) ?? [];

    const base = {
      sessionId: session.sessionId,
      slugShort: session.slugShort,
      totalQuestions: session.totalQuestions,
      totalPlayers: session.totalPlayers,
      audioMuted,
      players,
      isPaused: session.state === 'paused',
    };

    if (session.state === 'lobby') {
      set({
        ...base,
        uiState: 'lobby',
        scoreboard: (snap.scoreboard as ScoreEntry[]) ?? [],
        currentQuestion: null,
        lastResults: null,
        finalScoreboard: null,
        winnerPlayerId: null,
      });
      return;
    }

    if (session.state === 'aborted') {
      set({
        ...base,
        uiState: 'aborted',
        abortReason: null,
        scoreboard: (snap.scoreboard as ScoreEntry[]) ?? [],
      });
      return;
    }

    if (session.state === 'ended') {
      set({
        ...base,
        uiState: 'final_results',
        finalScoreboard: (snap.finalScoreboard as FinalEntry[]) ?? null,
        winnerPlayerId: null,
        scoreboard: (snap.scoreboard as ScoreEntry[]) ?? [],
      });
      return;
    }

    const cq = snap.currentQuestion as
      | {
          position: number;
          questionId: string;
          text: string;
          imageUrl: string | null;
          answers: { position: string; text: string }[];
          timeLimitMs: number;
          remainingMs: number;
        }
      | undefined;

    if (cq && (session.state === 'running' || session.state === 'paused')) {
      const tlm = cq.timeLimitMs;
      const rem = cq.remainingMs;
      const startedAt = Date.now() - (tlm - rem);
      const answers: AnswerInfo[] = cq.answers.map((a) => ({
        id: a.position,
        position: a.position,
        text: a.text,
      }));
      set({
        ...base,
        uiState: 'question',
        currentQuestionPosition: cq.position,
        currentQuestion: {
          id: cq.questionId,
          text: cq.text,
          imageUrl: cq.imageUrl,
          answers,
        },
        questionStartedAt: startedAt,
        questionTimeLimitMs: tlm,
        remainingMs: rem,
        scoreboard: (snap.scoreboard as ScoreEntry[]) ?? get().scoreboard,
      });
      return;
    }

    const lr = snap.lastResults as
      | {
          correctAnswerId: string;
          scoreboard: {
            playerId: string;
            pseudo: string;
            scoreTotal: number;
            scoreThisQuestion: number;
          }[];
          explanation: string | null;
          nextQuestionInMs: number;
        }
      | undefined;

    if (lr) {
      const scoreboard: ScoreEntry[] = lr.scoreboard.map((r) => ({
        playerId: r.playerId,
        pseudo: r.pseudo,
        scoreTotal: r.scoreTotal,
        scoreThisQuestion: r.scoreThisQuestion,
      }));
      set({
        ...base,
        uiState: 'question_results',
        lastResults: {
          correctAnswerId: lr.correctAnswerId || null,
          explanationText: lr.explanation,
          scoreboard,
        },
        scoreboard,
        nextQuestionInMs: lr.nextQuestionInMs,
        remainingMs: 0,
        currentQuestion: null,
      });
      return;
    }

    set({
      ...base,
      uiState: 'lobby',
      scoreboard: (snap.scoreboard as ScoreEntry[]) ?? [],
    });
  },

  applyEvent: (event, payload) => {
    const state = get();

    switch (event) {
      case 'session:started':
        set({
          uiState: 'lobby',
          totalQuestions: (payload.totalQuestions as number) ?? 0,
        });
        break;

      case 'session:state_changed': {
        const newState = payload.newState as string;
        if (newState === 'running' && state.uiState === 'lobby') {
          // question will come next
        }
        break;
      }

      case 'player:joined':
        set({
          players: [
            ...state.players,
            {
              playerId: payload.playerId as string,
              pseudo: payload.pseudo as string,
              joinedAt: payload.joinedAt as string,
            },
          ],
          totalPlayers: state.totalPlayers + 1,
        });
        break;

      case 'player:left':
        set({
          players: state.players.filter((p) => p.playerId !== (payload.playerId as string)),
          totalPlayers: Math.max(0, state.totalPlayers - 1),
        });
        break;

      case 'session:question_started':
        set({
          uiState: 'question',
          currentQuestionPosition: payload.questionPosition as number,
          currentQuestion: {
            id: payload.questionId as string,
            text: payload.questionText as string,
            imageUrl: (payload.questionImageUrl as string | null) ?? null,
            answers: payload.answers as AnswerInfo[],
          },
          questionStartedAt: Date.now(),
          questionTimeLimitMs: payload.timeLimitMs as number,
          remainingMs: payload.timeLimitMs as number,
          answersSubmittedCount: 0,
          answersTotal: state.totalPlayers,
          previousScoreboard: state.scoreboard,
        });
        break;

      case 'session:timer_update':
        set({ remainingMs: payload.remainingMs as number });
        break;

      case 'session:answer_submitted_count':
        set({
          answersSubmittedCount: payload.count as number,
          answersTotal: payload.total as number,
        });
        break;

      case 'session:question_ended': {
        const scoreboard = payload.scoreboard as ScoreEntry[];
        set({
          uiState: 'question_results',
          lastResults: {
            correctAnswerId: (payload.correctAnswerId as string | null) ?? null,
            explanationText: (payload.explanationText as string | null) ?? null,
            scoreboard,
          },
          scoreboard,
          remainingMs: 0,
        });
        break;
      }

      case 'session:next_question_in':
        set({ nextQuestionInMs: payload.ms as number });
        break;

      case 'session:paused':
        set({ isPaused: true });
        break;

      case 'session:resumed':
        set({ isPaused: false });
        break;

      case 'session:audio_muted':
        set({ audioMuted: payload.muted as boolean });
        break;

      case 'session:ended': {
        const finalScoreboard = payload.finalScoreboard as FinalEntry[];
        set({
          uiState: 'final_results',
          finalScoreboard,
          winnerPlayerId: (payload.winnerPlayerId as string | null) ?? null,
          isPaused: false,
        });
        break;
      }

      case 'session:aborted':
        set({
          uiState: 'aborted',
          abortReason: (payload.reason as string | null) ?? null,
          isPaused: false,
        });
        break;
    }
  },

  reset: () =>
    set({
      ...initialState,
      nucId: get().nucId,
      screenId: get().screenId,
      cinemaSlug: get().cinemaSlug,
      cinemaName: get().cinemaName,
      cinemaLogoUrl: get().cinemaLogoUrl,
      backgroundMusicUrl: get().backgroundMusicUrl,
      connectionStatus: 'disconnected',
    }),
}));
