import { create } from 'zustand';
import type {
  SessionStateChangedPayload,
  SessionStartedPayload,
  SessionQuestionStartedPayload,
  SessionTimerUpdatePayload,
  SessionAnswerSubmittedCountPayload,
  SessionQuestionEndedPayload,
  SessionNextQuestionInPayload,
  SessionAudioMutedPayload,
  SessionEndedPayload,
  SessionAbortedPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
} from '@quiz-app/validation/socket-events';

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
  questions: QuestionFull[];
}

export interface PlayerLive {
  playerId: string;
  pseudo: string;
  scoreTotal: number;
  status: string;
}

type SessionState = 'lobby' | 'running' | 'paused' | 'ended' | 'aborted';

export type LiveConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface LiveSessionState {
  sessionId: string | null;
  slugShort: string | null;
  state: SessionState | null;
  totalQuestions: number;
  totalPlayers: number;

  quiz: QuizFull | null;

  currentQuestionPosition: number | null;
  currentQuestion: QuestionFull | null;
  questionStartedAt: number | null;
  questionTimeLimitMs: number;
  remainingMs: number;
  answersSubmittedCount: number;

  audioMuted: boolean;

  players: PlayerLive[];

  showingResults: boolean;
  lastQuestionResults: {
    correctAnswerId: string;
    scoreboard: PlayerLive[];
  } | null;
  nextQuestionInMs: number | null;

  finalScoreboard: PlayerLive[] | null;
  winnerPlayerId: string | null;
  abortReason: string | null;

  screenId: string | null;
  screenName: string | null;
  cinemaName: string | null;
  backgroundMusicUrl: string | null;

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
  currentQuestionPosition: number | null;
  totalPlayers: number;
  totalQuestions: number;
  screenId: string;
  screenName: string;
  cinemaName: string;
  backgroundMusicUrl: string | null;
  quiz: QuizFull;
  players: { id: string; pseudo: string; scoreTotal: number; status: string; joinedAt: string }[];
}

const INITIAL: Omit<
  LiveSessionState,
  'hydrateFromSession' | 'applyEvent' | 'applySocketSnapshot' | 'setConnectionStatus' | 'reset'
> = {
  sessionId: null,
  slugShort: null,
  state: null,
  totalQuestions: 0,
  totalPlayers: 0,
  quiz: null,
  currentQuestionPosition: null,
  currentQuestion: null,
  questionStartedAt: null,
  questionTimeLimitMs: 0,
  remainingMs: 0,
  answersSubmittedCount: 0,
  audioMuted: false,
  players: [],
  showingResults: false,
  lastQuestionResults: null,
  nextQuestionInMs: null,
  finalScoreboard: null,
  winnerPlayerId: null,
  abortReason: null,
  screenId: null,
  screenName: null,
  cinemaName: null,
  backgroundMusicUrl: null,
  connectionStatus: 'disconnected',
};

export const useLiveSessionStore = create<LiveSessionState>((set, get) => ({
  ...INITIAL,

  hydrateFromSession: (session) => {
    set({
      sessionId: session.id,
      slugShort: session.slugShort,
      state: session.state as SessionState,
      totalQuestions: session.totalQuestions,
      totalPlayers: session.totalPlayers,
      quiz: session.quiz,
      screenId: session.screenId,
      screenName: session.screenName,
      cinemaName: session.cinemaName,
      backgroundMusicUrl: session.backgroundMusicUrl,
      players: session.players.map((p) => ({
        playerId: p.id,
        pseudo: p.pseudo,
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
          totalQuestions: number;
          totalPlayers: number;
          audioMuted: boolean;
        }
      | undefined;
    const quiz = p.quiz as QuizFull | undefined;
    if (!sess || !quiz) return;

    const playersRaw = p.players as
      | { playerId: string; pseudo: string; scoreTotal: number; joinedAt: string }[]
      | undefined;

    set({
      sessionId: sess.sessionId,
      slugShort: sess.slugShort,
      state: sess.state as SessionState,
      totalQuestions: sess.totalQuestions,
      totalPlayers: sess.totalPlayers,
      audioMuted: sess.audioMuted,
      quiz,
      players:
        playersRaw?.map((pl) => ({
          playerId: pl.playerId,
          pseudo: pl.pseudo,
          scoreTotal: pl.scoreTotal,
          status: 'active',
        })) ?? get().players,
    });

    const cq = p.currentQuestion as
      | {
          position: number;
          timeLimitMs: number;
          remainingMs: number;
        }
      | undefined;

    if (cq) {
      const question = quiz.questions.find((q) => q.position === cq.position) ?? null;
      const tlm = cq.timeLimitMs;
      const rem = cq.remainingMs;
      set({
        currentQuestionPosition: cq.position,
        currentQuestion: question,
        questionStartedAt: Date.now() - (tlm - rem),
        questionTimeLimitMs: tlm,
        remainingMs: rem,
        showingResults: false,
        lastQuestionResults: null,
        nextQuestionInMs: null,
        answersSubmittedCount: get().answersSubmittedCount,
      });
    }

    const lr = p.lastResults as
      | {
          correctAnswerId: string;
          scoreboard: { playerId: string; pseudo: string; scoreTotal: number }[];
          explanation: string | null;
          nextQuestionInMs: number;
        }
      | undefined;

    if (lr) {
      set({
        showingResults: true,
        lastQuestionResults: {
          correctAnswerId: lr.correctAnswerId,
          scoreboard: lr.scoreboard.map((s) => ({
            playerId: s.playerId,
            pseudo: s.pseudo,
            scoreTotal: s.scoreTotal,
            status: 'active',
          })),
        },
        nextQuestionInMs: lr.nextQuestionInMs,
        remainingMs: 0,
      });
    }

    const fs = p.finalScoreboard as
      | { playerId: string; pseudo: string; scoreTotal: number; rank: number }[]
      | undefined;

    if (fs) {
      set({
        state: 'ended',
        finalScoreboard: fs.map((s) => ({
          playerId: s.playerId,
          pseudo: s.pseudo,
          scoreTotal: s.scoreTotal,
          status: 'active',
        })),
        winnerPlayerId: null,
        showingResults: false,
      });
      return;
    }

    if (!cq && !lr && sess.state === 'lobby') {
      set({
        currentQuestionPosition: null,
        currentQuestion: null,
        questionStartedAt: null,
        questionTimeLimitMs: 0,
        remainingMs: 0,
        showingResults: false,
        lastQuestionResults: null,
        nextQuestionInMs: null,
      });
    }
  },

  applyEvent: (eventName, payload) => {
    switch (eventName) {
      case 'session:state_changed': {
        const p = payload as SessionStateChangedPayload;
        set({ state: p.newState as SessionState });
        break;
      }
      case 'session:started': {
        const p = payload as SessionStartedPayload;
        set({ state: 'running', totalQuestions: p.totalQuestions });
        break;
      }
      case 'session:question_started': {
        const p = payload as SessionQuestionStartedPayload;
        const question =
          get().quiz?.questions.find((q) => q.position === p.questionPosition) ?? null;
        set({
          currentQuestionPosition: p.questionPosition,
          currentQuestion: question,
          questionStartedAt: Date.now(),
          questionTimeLimitMs: p.timeLimitMs,
          remainingMs: p.timeLimitMs,
          answersSubmittedCount: 0,
          showingResults: false,
          lastQuestionResults: null,
          nextQuestionInMs: null,
        });
        break;
      }
      case 'session:timer_update': {
        const p = payload as SessionTimerUpdatePayload;
        set({ remainingMs: p.remainingMs });
        break;
      }
      case 'session:answer_submitted_count': {
        const p = payload as SessionAnswerSubmittedCountPayload;
        set({ answersSubmittedCount: p.count, totalPlayers: p.total });
        break;
      }
      case 'session:question_ended': {
        const p = payload as SessionQuestionEndedPayload;
        const scoreboard = p.scoreboard.map((s) => ({
          playerId: s.playerId,
          pseudo: s.pseudo,
          scoreTotal: s.scoreTotal,
          status: 'active',
        }));
        set({
          showingResults: true,
          lastQuestionResults: {
            correctAnswerId: p.correctAnswerId ?? '',
            scoreboard,
          },
          players: scoreboard,
          remainingMs: 0,
        });
        break;
      }
      case 'session:next_question_in': {
        const p = payload as SessionNextQuestionInPayload;
        set({ nextQuestionInMs: p.ms });
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
            scoreTotal: s.scoreTotal,
            status: 'active',
          })),
          winnerPlayerId: p.winnerPlayerId,
          showingResults: false,
        });
        break;
      }
      case 'session:aborted': {
        const p = payload as SessionAbortedPayload;
        set({ state: 'aborted', abortReason: p.reason });
        break;
      }
      case 'player:joined': {
        const p = payload as PlayerJoinedPayload;
        set({
          players: [
            ...get().players,
            { playerId: p.playerId, pseudo: p.pseudo, scoreTotal: 0, status: 'active' },
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

  reset: () => set(INITIAL),
}));
