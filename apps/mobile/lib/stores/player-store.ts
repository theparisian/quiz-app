import { create } from 'zustand';
import type { SessionPrizesDisplay } from '@quiz-app/validation';

export type PlayerUiState =
  | 'lobby'
  | 'late_wait'
  | 'question_active'
  | 'waiting_others'
  | 'question_results'
  | 'paused'
  | 'final_results'
  | 'aborted';

export type PlayerConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface PlayerState {
  playerId: string | null;
  pseudo: string | null;
  resumeToken: string | null;
  sessionId: string | null;
  slugShort: string | null;

  cinemaName: string | null;
  quizTitle: string | null;
  brandingJson: Record<string, unknown> | null;

  uiState: PlayerUiState;
  state: string | null;
  totalQuestions: number;
  totalPlayers: number;

  currentQuestionPosition: number | null;
  currentQuestionId: string | null;
  questionStartedAt: number | null;
  questionTimeLimitMs: number;
  answerMap: Record<string, string>; // position -> answerId

  selectedAnswerId: string | null;
  selectedAnswerPosition: 'A' | 'B' | 'C' | 'D' | null;

  scoreTotal: number;
  currentRank: number | null;
  lastQuestionResult: {
    isCorrect: boolean;
    pointsAwarded: number;
    correctAnswerId: string | null;
  } | null;

  finalRank: number | null;
  finalScoreboard: { playerId: string; pseudo: string; scoreTotal: number; rank: number }[] | null;
  prizeAvailabilityByRank: { rank1?: boolean; rank2?: boolean; rank3?: boolean } | null;
  prizes: SessionPrizesDisplay | null;
  joinedQuestionPosition: number | null;
  lateWaitTimerMs: number | null;

  players: { playerId: string; pseudo: string }[];

  connectionStatus: PlayerConnectionStatus;

  hydrate: (data: {
    playerId: string;
    pseudo: string;
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
  selectAnswer: (answerId: string, position: 'A' | 'B' | 'C' | 'D') => void;
  applyEvent: (event: string, payload: Record<string, unknown>) => void;
  applySnapshot: (snap: Record<string, unknown>) => void;
  setConnectionStatus: (s: PlayerConnectionStatus) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  playerId: null,
  pseudo: null,
  resumeToken: null,
  sessionId: null,
  slugShort: null,

  cinemaName: null,
  quizTitle: null,
  brandingJson: null,

  uiState: 'lobby',
  state: null,
  totalQuestions: 0,
  totalPlayers: 0,

  currentQuestionPosition: null,
  currentQuestionId: null,
  questionStartedAt: null,
  questionTimeLimitMs: 20000,
  answerMap: {},

  selectedAnswerId: null,
  selectedAnswerPosition: null,

  scoreTotal: 0,
  currentRank: null,
  lastQuestionResult: null,

  finalRank: null,
  finalScoreboard: null,
  prizeAvailabilityByRank: null,
  prizes: null,
  joinedQuestionPosition: null,
  lateWaitTimerMs: null,

  players: [],

  connectionStatus: 'disconnected',

  hydrate: (data) => {
    const snapshot = data.stateSnapshot;
    const joinedQuestionPosition = data.joinedQuestionPosition ?? null;
    let uiState: PlayerUiState = 'lobby';
    let lateWaitTimerMs: number | null = null;
    let finalRank: number | null = null;
    const finalScoreboard: PlayerState['finalScoreboard'] = null;

    if (snapshot) {
      if (snapshot.showFinalImmediately === true) {
        uiState = 'final_results';
        finalRank = null;
      } else if (snapshot.canAnswerCurrentQuestion === false) {
        uiState = 'late_wait';
        lateWaitTimerMs = (snapshot.timerRemainingMs as number | undefined) ?? null;
      }
    }

    set({
      playerId: data.playerId,
      pseudo: data.pseudo,
      resumeToken: data.resumeToken,
      sessionId: data.sessionId,
      slugShort: data.slugShort,
      cinemaName: data.cinemaName ?? null,
      quizTitle: data.quizTitle ?? null,
      brandingJson: data.brandingJson ?? null,
      scoreTotal: data.scoreTotal ?? 0,
      joinedQuestionPosition,
      uiState,
      lateWaitTimerMs,
      finalRank,
      finalScoreboard,
      state: (snapshot?.sessionState as string | undefined) ?? null,
      totalQuestions: (snapshot?.totalQuestions as number | undefined) ?? 0,
    });
    localStorage.setItem('quiz_resume_token', data.resumeToken);
    localStorage.setItem('quiz_player_id', data.playerId);
    localStorage.setItem('quiz_session_id', data.sessionId);
  },

  selectAnswer: (answerId, position) => {
    set({
      selectedAnswerId: answerId,
      selectedAnswerPosition: position,
      uiState: 'waiting_others',
    });
  },

  setConnectionStatus: (s) => set({ connectionStatus: s }),

  applySnapshot: (snap) => {
    const player = snap.player as
      | {
          playerId: string;
          pseudo: string;
          scoreTotal: number;
          currentRank: number | null;
          joinedQuestionPosition?: number | null;
        }
      | undefined;
    const session = snap.session as
      | {
          sessionId: string;
          slugShort: string;
          state: string;
          totalQuestions: number;
          totalPlayers: number;
        }
      | undefined;
    if (!player || !session) return;

    const base = {
      playerId: player.playerId,
      pseudo: player.pseudo,
      scoreTotal: player.scoreTotal,
      currentRank: player.currentRank,
      sessionId: session.sessionId,
      slugShort: session.slugShort,
      state: session.state,
      totalQuestions: session.totalQuestions,
      totalPlayers: session.totalPlayers,
      joinedQuestionPosition: player.joinedQuestionPosition ?? null,
    };

    const lateJoinWait = snap.lateJoinWait as { timerRemainingMs?: number } | undefined;
    if (lateJoinWait) {
      set({
        ...base,
        uiState: 'late_wait',
        lateWaitTimerMs: lateJoinWait.timerRemainingMs ?? null,
      });
      return;
    }

    const finalResults = snap.finalResults as
      | {
          rank: number;
          finalScoreboard: {
            playerId: string;
            pseudo: string;
            scoreTotal: number;
            rank: number;
          }[];
        }
      | undefined;

    if (session.state === 'lobby') {
      set({
        ...base,
        uiState: 'lobby',
        prizes: (snap.prizes as SessionPrizesDisplay | undefined) ?? null,
        currentQuestionPosition: null,
        currentQuestionId: null,
        questionStartedAt: null,
        answerMap: {},
        selectedAnswerId: null,
        selectedAnswerPosition: null,
        lastQuestionResult: null,
      });
      return;
    }

    if (session.state === 'aborted') {
      set({ ...base, uiState: 'aborted' });
      return;
    }

    if (session.state === 'ended' && finalResults) {
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

    const showingResults = snap.showingResults as
      | {
          correctAnswerId: string;
          pointsAwarded: number;
          isCorrect: boolean;
          nextQuestionInMs: number;
        }
      | undefined;

    if (showingResults) {
      set({
        ...base,
        uiState: 'question_results',
        lastQuestionResult: {
          isCorrect: showingResults.isCorrect,
          pointsAwarded: showingResults.pointsAwarded,
          correctAnswerId: showingResults.correctAnswerId || null,
        },
      });
      return;
    }

    const cq = snap.currentQuestion as
      | {
          position: number;
          questionId: string;
          timeLimitMs: number;
          remainingMs: number;
          alreadyAnsweredPosition: string | null;
          answers: { id: string; position: string; text: string }[];
        }
      | undefined;

    if (cq && (session.state === 'running' || session.state === 'paused')) {
      const aMap: Record<string, string> = {};
      for (const a of cq.answers) {
        aMap[a.position] = a.id;
      }
      const tlm = cq.timeLimitMs;
      const rem = cq.remainingMs;
      const startedAt = Date.now() - (tlm - rem);
      const pos = cq.alreadyAnsweredPosition;

      if (session.state === 'paused') {
        if (pos) {
          set({
            ...base,
            uiState: 'paused',
            currentQuestionPosition: cq.position,
            currentQuestionId: cq.questionId,
            questionTimeLimitMs: tlm,
            questionStartedAt: startedAt,
            answerMap: aMap,
            selectedAnswerId: aMap[pos] ?? null,
            selectedAnswerPosition: (pos as 'A' | 'B' | 'C' | 'D') ?? null,
          });
        } else {
          set({
            ...base,
            uiState: 'paused',
            currentQuestionPosition: cq.position,
            currentQuestionId: cq.questionId,
            questionTimeLimitMs: tlm,
            questionStartedAt: startedAt,
            answerMap: aMap,
            selectedAnswerId: null,
            selectedAnswerPosition: null,
          });
        }
        return;
      }

      if (pos) {
        set({
          ...base,
          uiState: 'waiting_others',
          currentQuestionPosition: cq.position,
          currentQuestionId: cq.questionId,
          questionTimeLimitMs: tlm,
          questionStartedAt: startedAt,
          answerMap: aMap,
          selectedAnswerId: aMap[pos] ?? null,
          selectedAnswerPosition: pos as 'A' | 'B' | 'C' | 'D',
        });
      } else {
        set({
          ...base,
          uiState: 'question_active',
          currentQuestionPosition: cq.position,
          currentQuestionId: cq.questionId,
          questionTimeLimitMs: tlm,
          questionStartedAt: startedAt,
          answerMap: aMap,
          selectedAnswerId: null,
          selectedAnswerPosition: null,
          lastQuestionResult: null,
        });
      }
      return;
    }

    set({ ...base, uiState: 'lobby' });
  },

  applyEvent: (event, payload) => {
    const state = get();

    switch (event) {
      case 'session:state_changed':
        set({ state: payload.newState as string });
        break;

      case 'session:started':
        set({ totalQuestions: (payload.totalQuestions as number) ?? 0 });
        break;

      case 'player:joined':
        set({
          players: [
            ...state.players,
            { playerId: payload.playerId as string, pseudo: payload.pseudo as string },
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

      case 'session:question_started': {
        const answers = payload.answers as { id: string; position: string; text: string }[];
        const aMap: Record<string, string> = {};
        for (const a of answers) {
          aMap[a.position] = a.id;
        }
        set({
          uiState: 'question_active',
          currentQuestionPosition: payload.questionPosition as number,
          currentQuestionId: payload.questionId as string,
          questionStartedAt: Date.now(),
          questionTimeLimitMs: payload.timeLimitMs as number,
          answerMap: aMap,
          selectedAnswerId: null,
          selectedAnswerPosition: null,
          lastQuestionResult: null,
          lateWaitTimerMs: null,
        });
        break;
      }

      case 'session:question_ended': {
        const scoreboard = payload.scoreboard as {
          playerId: string;
          pseudo: string;
          scoreTotal: number;
          scoreThisQuestion: number;
        }[];
        const myEntry = scoreboard.find((e) => e.playerId === state.playerId);
        const correctAnswerId = (payload.correctAnswerId as string | null) ?? null;

        const myRank = scoreboard.findIndex((e) => e.playerId === state.playerId) + 1;
        const wasCorrect =
          state.selectedAnswerId !== null && state.selectedAnswerId === correctAnswerId;
        const didNotAnswer = state.selectedAnswerId === null;

        set({
          uiState: 'question_results',
          scoreTotal: myEntry?.scoreTotal ?? state.scoreTotal,
          currentRank: myRank > 0 ? myRank : null,
          lastQuestionResult: {
            isCorrect: wasCorrect,
            pointsAwarded: myEntry?.scoreThisQuestion ?? 0,
            correctAnswerId,
          },
        });

        if (didNotAnswer) {
          set({
            lastQuestionResult: {
              isCorrect: false,
              pointsAwarded: 0,
              correctAnswerId,
            },
          });
        }
        break;
      }

      case 'session:paused':
        set({ uiState: 'paused' });
        break;

      case 'session:resumed': {
        const wasState = state.selectedAnswerId ? 'waiting_others' : 'question_active';
        if (state.currentQuestionId) {
          set({ uiState: wasState });
        }
        break;
      }

      case 'session:ended': {
        const finalScoreboard = payload.finalScoreboard as {
          playerId: string;
          pseudo: string;
          scoreTotal: number;
          rank: number;
        }[];
        const myFinal = finalScoreboard.find((e) => e.playerId === state.playerId);
        const prizeAvailabilityByRank = (payload.prizeAvailabilityByRank ?? null) as {
          rank1?: boolean;
          rank2?: boolean;
          rank3?: boolean;
        } | null;
        set({
          uiState: 'final_results',
          finalScoreboard,
          finalRank: myFinal?.rank ?? null,
          scoreTotal: myFinal?.scoreTotal ?? state.scoreTotal,
          prizeAvailabilityByRank,
          prizes: (payload.prizes as SessionPrizesDisplay | undefined) ?? null,
        });
        break;
      }

      case 'session:aborted':
        set({ uiState: 'aborted' });
        break;
    }
  },

  reset: () =>
    set({
      playerId: null,
      pseudo: null,
      resumeToken: null,
      sessionId: null,
      slugShort: null,
      cinemaName: null,
      quizTitle: null,
      brandingJson: null,
      uiState: 'lobby',
      state: null,
      totalQuestions: 0,
      totalPlayers: 0,
      currentQuestionPosition: null,
      currentQuestionId: null,
      questionStartedAt: null,
      questionTimeLimitMs: 20000,
      answerMap: {},
      selectedAnswerId: null,
      selectedAnswerPosition: null,
      scoreTotal: 0,
      currentRank: null,
      lastQuestionResult: null,
      finalRank: null,
      finalScoreboard: null,
      prizeAvailabilityByRank: null,
      prizes: null,
      joinedQuestionPosition: null,
      lateWaitTimerMs: null,
      players: [],
      connectionStatus: 'disconnected',
    }),
}));
