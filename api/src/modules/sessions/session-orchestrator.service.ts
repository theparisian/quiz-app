import type { Answer, Prisma, Question } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { computeScore } from '../../shared/scoring/scoring.service.js';
import { shapeQuizBackgroundPayload } from '../quizzes/quiz-background.js';
import { assertTransition } from './session-state.service.js';

export function getResultsDisplayMs(): number {
  return parseInt(process.env.RESULTS_DISPLAY_MS ?? '8000', 10);
}
function getCountdownMs(): number {
  return parseInt(process.env.COUNTDOWN_MS ?? '3000', 10);
}
const TIMER_TOLERANCE_MS = 500;
const TIMER_BROADCAST_INTERVAL_MS = 1000;

interface InMemoryAnswer {
  playerId: bigint;
  answerId: bigint;
  timeToAnswerMs: number;
  receivedAt: number;
}

export interface RunningSessionState {
  sessionId: bigint;
  questions: {
    id: bigint;
    position: number;
    text: string;
    imageUrl: string | null;
    timeLimitSeconds: number;
    pointsMax: number;
    pointsFloor: number;
    explanation: string | null;
    answers: { id: bigint; position: string; text: string; isCorrect: boolean }[];
  }[];
  currentQuestionIndex: number;
  currentQuestionStartedAt: number | null;
  currentQuestionPausedAt: number | null;
  currentQuestionTimeLimitMs: number;
  questionTimerHandle: ReturnType<typeof setTimeout> | null;
  resultsTimerHandle: ReturnType<typeof setTimeout> | null;
  /** Horodatage début affichage résultats (timer next question), pour nextQuestionInMs au resume. */
  resultsPhaseStartedAt: number | null;
  broadcastInterval: ReturnType<typeof setInterval> | null;
  audioMuted: boolean;
  inMemoryAnswers: Map<string, InMemoryAnswer>;
  questionEnded: boolean;
  playerIds: Set<string>;
}

type RehydrateSessionRow = Prisma.SessionGetPayload<{
  include: {
    screen: { select: { cinemaId: true } };
    quiz: {
      include: {
        questions: {
          include: { answers: true };
          orderBy: { position: 'asc' };
        };
      };
    };
  };
}>;

const runningSessions = new Map<string, RunningSessionState>();

let ioInstance: Server | null = null;

export function setIoInstance(io: Server) {
  ioInstance = io;
}

function getIo(): Server {
  if (!ioInstance) throw new Error('Socket.io not initialized');
  return ioInstance;
}

function sessionKey(id: bigint): string {
  return id.toString();
}

function mapQuestionsFromPrisma(
  qs: (Question & { answers: Answer[] })[],
): RunningSessionState['questions'] {
  return qs.map((q) => ({
    id: q.id,
    position: q.position,
    text: q.text,
    imageUrl: q.imageUrl,
    timeLimitSeconds: q.timeLimitSeconds,
    pointsMax: q.pointsMax,
    pointsFloor: q.pointsFloor,
    explanation: q.explanation,
    answers: q.answers.map((a) => ({
      id: a.id,
      position: String(a.position),
      text: a.text,
      isCorrect: a.isCorrect,
    })),
  }));
}

function broadcastToSession(sessionId: bigint, event: string, payload: unknown) {
  const io = getIo();
  const room = `session:${sessionId}`;
  io.of('/player').to(room).emit(event, payload);
  io.of('/mobile').to(room).emit(event, payload);
  io.of('/console').to(room).emit(event, payload);
}

function clearTimers(state: RunningSessionState) {
  if (state.questionTimerHandle) {
    clearTimeout(state.questionTimerHandle);
    state.questionTimerHandle = null;
  }
  if (state.resultsTimerHandle) {
    clearTimeout(state.resultsTimerHandle);
    state.resultsTimerHandle = null;
  }
  if (state.broadcastInterval) {
    clearInterval(state.broadcastInterval);
    state.broadcastInterval = null;
  }
  state.resultsPhaseStartedAt = null;
}

function getRunningState(sessionId: bigint): RunningSessionState {
  const state = runningSessions.get(sessionKey(sessionId));
  if (!state) throw new AppError('Session not active in memory', 404, 'SESSION_NOT_IN_MEMORY');
  return state;
}

async function endQuestionInternal(sessionId: bigint, forced: boolean, reason?: string) {
  const state = getRunningState(sessionId);
  if (state.questionEnded) return;
  state.questionEnded = true;

  clearTimers(state);

  const question = state.questions[state.currentQuestionIndex];
  if (!question) return;

  const correctAnswer = question.answers.find((a) => a.isCorrect);
  const correctAnswerId = correctAnswer?.id ?? null;

  const allPlayerIds = [...state.playerIds];
  const answersMap = state.inMemoryAnswers;
  const totalTimeMs = question.timeLimitSeconds * 1000;

  const playerAnswerRows: {
    playerId: bigint;
    questionId: bigint;
    chosenAnswerId: bigint | null;
    answeredAtServer: Date | null;
    timeToAnswerMs: number | null;
    pointsAwarded: number;
    isCorrect: boolean;
  }[] = [];

  const scoreUpdates: { playerId: bigint; points: number }[] = [];
  const scoreboardEntries: {
    playerId: string;
    pseudo: string;
    scoreTotal: number;
    scoreThisQuestion: number;
  }[] = [];

  const players = await prisma.player.findMany({
    where: { id: { in: allPlayerIds.map(BigInt) }, status: 'active' },
    select: { id: true, pseudo: true, scoreTotal: true },
  });
  const playerMap = new Map(players.map((p) => [p.id.toString(), p]));

  const dbAnswersForQuestion =
    allPlayerIds.length > 0
      ? await prisma.playerAnswer.findMany({
          where: {
            questionId: question.id,
            playerId: { in: allPlayerIds.map((id) => BigInt(id)) },
          },
        })
      : [];
  const dbByPlayer = new Map(dbAnswersForQuestion.map((a) => [a.playerId.toString(), a]));

  for (const pid of allPlayerIds) {
    const mem = answersMap.get(pid);
    const dbRow = dbByPlayer.get(pid);
    const submitted: InMemoryAnswer | undefined =
      mem ??
      (dbRow?.chosenAnswerId
        ? {
            playerId: BigInt(pid),
            answerId: dbRow.chosenAnswerId,
            timeToAnswerMs: dbRow.timeToAnswerMs ?? 0,
            receivedAt: dbRow.answeredAtServer?.getTime() ?? Date.now(),
          }
        : undefined);

    const playerData = playerMap.get(pid);
    if (!playerData) continue;

    if (submitted) {
      const isCorrect = correctAnswerId !== null && submitted.answerId === correctAnswerId;
      const points = computeScore({
        isCorrect,
        timeToAnswerMs: submitted.timeToAnswerMs,
        totalTimeMs,
        pointsMax: question.pointsMax,
        pointsFloor: question.pointsFloor,
      });

      playerAnswerRows.push({
        playerId: submitted.playerId,
        questionId: question.id,
        chosenAnswerId: submitted.answerId,
        answeredAtServer: new Date(submitted.receivedAt),
        timeToAnswerMs: submitted.timeToAnswerMs,
        pointsAwarded: points,
        isCorrect,
      });

      if (points > 0) {
        scoreUpdates.push({ playerId: submitted.playerId, points });
      }

      scoreboardEntries.push({
        playerId: pid,
        pseudo: playerData.pseudo,
        scoreTotal: playerData.scoreTotal + points,
        scoreThisQuestion: points,
      });
    } else {
      playerAnswerRows.push({
        playerId: BigInt(pid),
        questionId: question.id,
        chosenAnswerId: null,
        answeredAtServer: null,
        timeToAnswerMs: null,
        pointsAwarded: 0,
        isCorrect: false,
      });

      scoreboardEntries.push({
        playerId: pid,
        pseudo: playerData.pseudo,
        scoreTotal: playerData.scoreTotal,
        scoreThisQuestion: 0,
      });
    }
  }

  // `questionId` seul supprimerait les réponses de toutes les sessions partageant ce quiz (même question DB).
  if (allPlayerIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.playerAnswer.deleteMany({
        where: {
          questionId: question.id,
          playerId: { in: allPlayerIds.map((id) => BigInt(id)) },
        },
      });
      if (playerAnswerRows.length > 0) {
        await tx.playerAnswer.createMany({
          data: playerAnswerRows,
        });
      }
    });
  }

  for (const update of scoreUpdates) {
    await prisma.player.update({
      where: { id: update.playerId },
      data: { scoreTotal: { increment: update.points } },
    });
  }

  scoreboardEntries.sort((a, b) => b.scoreTotal - a.scoreTotal);

  state.currentQuestionStartedAt = null;
  state.currentQuestionPausedAt = null;
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      currentQuestionStartedAt: null,
      currentQuestionPausedAt: null,
    },
  });

  broadcastToSession(sessionId, 'session:question_ended', {
    correctAnswerId: correctAnswerId?.toString() ?? null,
    explanationText: question.explanation,
    scoreboard: scoreboardEntries,
  });

  logger.info(
    {
      sessionId: sessionId.toString(),
      questionPosition: question.position,
      forced,
      reason: reason ?? null,
    },
    'Question ended',
  );

  const hasNext = state.currentQuestionIndex + 1 < state.questions.length;
  if (hasNext) {
    const displayMs = getResultsDisplayMs();
    broadcastToSession(sessionId, 'session:next_question_in', { ms: displayMs });
    state.resultsPhaseStartedAt = Date.now();
    state.resultsTimerHandle = setTimeout(() => {
      void nextQuestionInternal(sessionId);
    }, displayMs);
  } else {
    await endSessionInternal(sessionId);
  }
}

async function nextQuestionInternal(sessionId: bigint) {
  const state = getRunningState(sessionId);
  state.currentQuestionIndex += 1;

  if (state.currentQuestionIndex >= state.questions.length) {
    await endSessionInternal(sessionId);
    return;
  }

  const question = state.questions[state.currentQuestionIndex]!;
  state.currentQuestionStartedAt = Date.now();
  state.currentQuestionPausedAt = null;
  state.currentQuestionTimeLimitMs = question.timeLimitSeconds * 1000;
  state.inMemoryAnswers = new Map();
  state.questionEnded = false;
  state.resultsPhaseStartedAt = null;

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      currentQuestionPosition: question.position,
      currentQuestionStartedAt: new Date(state.currentQuestionStartedAt),
      currentQuestionPausedAt: null,
    },
  });

  broadcastToSession(sessionId, 'session:question_started', {
    questionId: question.id.toString(),
    questionPosition: question.position,
    questionText: question.text,
    questionImageUrl: question.imageUrl,
    answers: question.answers.map((a) => ({
      id: a.id.toString(),
      position: a.position,
      text: a.text,
    })),
    timeLimitMs: state.currentQuestionTimeLimitMs,
    startedAt: new Date(state.currentQuestionStartedAt).toISOString(),
  });

  const totalTimeMs = state.currentQuestionTimeLimitMs + TIMER_TOLERANCE_MS;
  state.questionTimerHandle = setTimeout(() => {
    void endQuestionInternal(sessionId, false);
  }, totalTimeMs);

  state.broadcastInterval = setInterval(() => {
    if (!state.currentQuestionStartedAt || state.currentQuestionPausedAt) return;
    const elapsed = Date.now() - state.currentQuestionStartedAt;
    const remaining = Math.max(0, state.currentQuestionTimeLimitMs - elapsed);
    broadcastToSession(sessionId, 'session:timer_update', { remainingMs: remaining });
    if (remaining <= 0 && state.broadcastInterval) {
      clearInterval(state.broadcastInterval);
      state.broadcastInterval = null;
    }
  }, TIMER_BROADCAST_INTERVAL_MS);

  logger.info(
    { sessionId: sessionId.toString(), questionPosition: question.position },
    'Question started',
  );
}

async function endSessionInternal(sessionId: bigint) {
  const key = sessionKey(sessionId);
  const state = runningSessions.get(key);
  if (state) {
    clearTimers(state);
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { screen: { select: { cinemaId: true } } },
  });
  if (!session) return;

  if (session.state !== 'ended' && session.state !== 'aborted') {
    assertTransition(session.state, 'ended');
  }

  const players = await prisma.player.findMany({
    where: { sessionId, status: 'active' },
    orderBy: [{ scoreTotal: 'desc' }, { joinedAt: 'asc' }],
  });

  let rank = 1;
  for (const p of players) {
    await prisma.player.update({
      where: { id: p.id },
      data: { rankFinal: rank },
    });
    rank++;
  }

  const winnerId = players[0]?.id ?? null;

  const endedAt = new Date();
  const durationMs =
    session.startedAt !== null ? endedAt.getTime() - session.startedAt.getTime() : 0;

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      state: 'ended',
      endedAt,
      winnerPlayerId: winnerId,
      currentQuestionStartedAt: null,
      currentQuestionPausedAt: null,
    },
  });

  const finalScoreboard = players.map((p, i) => ({
    playerId: p.id.toString(),
    pseudo: p.pseudo,
    scoreTotal: p.scoreTotal,
    rank: i + 1,
  }));

  broadcastToSession(sessionId, 'session:ended', {
    finalScoreboard,
    winnerPlayerId: winnerId?.toString() ?? null,
  });

  broadcastToSession(sessionId, 'session:state_changed', {
    sessionId: sessionId.toString(),
    oldState: session.state,
    newState: 'ended',
  });

  runningSessions.delete(key);

  logger.info(
    { sessionId: sessionId.toString(), winnerId: winnerId?.toString() ?? null },
    'Session ended',
  );

  logEvent({
    level: 'info',
    eventType: 'session.ended',
    sessionId,
    cinemaId: session.screen.cinemaId,
    payload: {
      winnerPlayerId: winnerId?.toString() ?? null,
      totalPlayers: players.length,
      durationMs,
    },
  });
}

async function rehydrateForceEndActiveQuestion(session: RehydrateSessionRow) {
  const sessionId = session.id;
  const questions = mapQuestionsFromPrisma(session.quiz.questions);
  const pos = session.currentQuestionPosition;
  const idx = pos == null ? -1 : questions.findIndex((q) => q.position === pos);
  if (idx < 0) {
    logger.error(
      { sessionId: sessionId.toString(), currentQuestionPosition: pos },
      'Rehydrate force-end: cannot resolve current question index',
    );
    logEvent({
      level: 'critical',
      eventType: 'server.boot_recovery_anomaly',
      sessionId,
      cinemaId: session.screen.cinemaId,
      payload: {
        detail: 'rehydrate_force_end_invalid_question_index',
        currentQuestionPosition: pos,
      },
    });
    return;
  }

  const activePlayers = await prisma.player.findMany({
    where: { sessionId, status: 'active' },
    select: { id: true },
  });

  const state: RunningSessionState = {
    sessionId,
    questions,
    currentQuestionIndex: idx,
    currentQuestionStartedAt: session.currentQuestionStartedAt!.getTime(),
    currentQuestionPausedAt: session.currentQuestionPausedAt?.getTime() ?? null,
    currentQuestionTimeLimitMs: questions[idx]!.timeLimitSeconds * 1000,
    questionTimerHandle: null,
    resultsTimerHandle: null,
    resultsPhaseStartedAt: null,
    broadcastInterval: null,
    audioMuted: session.audioMuted,
    inMemoryAnswers: new Map(),
    questionEnded: false,
    playerIds: new Set(activePlayers.map((p) => p.id.toString())),
  };

  runningSessions.set(sessionKey(sessionId), state);
  await endQuestionInternal(sessionId, true, 'server-resume');
}

async function rehydrateBetweenQuestionsOrBeforeFirst(session: RehydrateSessionRow) {
  const sessionId = session.id;
  const questions = mapQuestionsFromPrisma(session.quiz.questions);

  const activePlayers = await prisma.player.findMany({
    where: { sessionId, status: 'active' },
    select: { id: true },
  });

  const pos = session.currentQuestionPosition;
  let currentQuestionIndex: number;
  let questionEnded: boolean;

  if (pos == null) {
    currentQuestionIndex = -1;
    questionEnded = false;
  } else {
    const idx = questions.findIndex((q) => q.position === pos);
    if (idx < 0) {
      logger.error(
        { sessionId: sessionId.toString(), currentQuestionPosition: pos },
        'Rehydrate between questions: invalid current question position',
      );
      logEvent({
        level: 'critical',
        eventType: 'server.boot_recovery_anomaly',
        sessionId,
        cinemaId: session.screen.cinemaId,
        payload: {
          detail: 'rehydrate_between_questions_invalid_position',
          currentQuestionPosition: pos,
        },
      });
      return;
    }
    currentQuestionIndex = idx;
    questionEnded = true;
  }

  const state: RunningSessionState = {
    sessionId,
    questions,
    currentQuestionIndex,
    currentQuestionStartedAt: null,
    currentQuestionPausedAt: null,
    currentQuestionTimeLimitMs: 0,
    questionTimerHandle: null,
    resultsTimerHandle: null,
    resultsPhaseStartedAt: null,
    broadcastInterval: null,
    audioMuted: session.audioMuted,
    inMemoryAnswers: new Map(),
    questionEnded,
    playerIds: new Set(activePlayers.map((p) => p.id.toString())),
  };

  runningSessions.set(sessionKey(sessionId), state);

  if (session.state === 'running') {
    await nextQuestionInternal(sessionId);
  }
}

/** Rebuild in-memory orchestrator for interrupted sessions (replacing markStaleSessionsAborted). */
export async function rehydrateRunningSessions(): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { state: { in: ['running', 'paused'] } },
    include: {
      screen: { select: { cinemaId: true } },
      quiz: {
        include: {
          questions: {
            include: { answers: true },
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  });

  logger.info({ count: sessions.length }, 'Rehydrating sessions on boot');

  for (const session of sessions) {
    try {
      if (session.quiz.questions.length === 0) {
        logger.warn({ sessionId: session.id.toString() }, 'Rehydrate skip: quiz has no questions');
        logEvent({
          level: 'critical',
          eventType: 'server.boot_recovery_anomaly',
          sessionId: session.id,
          cinemaId: session.screen.cinemaId,
          payload: { detail: 'rehydrate_skip_quiz_empty_questions', state: session.state },
        });
        continue;
      }

      if (session.currentQuestionStartedAt) {
        logger.info(
          { sessionId: session.id.toString() },
          'Force-ending question due to server restart',
        );
        if (session.state === 'paused') {
          await prisma.session.update({
            where: { id: session.id },
            data: { state: 'running' },
          });
        }
        await rehydrateForceEndActiveQuestion(session);
        continue;
      }

      await rehydrateBetweenQuestionsOrBeforeFirst(session);
    } catch (err) {
      logger.error({ err, sessionId: session.id.toString() }, 'Rehydrate session failed');
      logEvent({
        level: 'critical',
        eventType: 'server.boot_recovery_anomaly',
        sessionId: session.id,
        cinemaId: session.screen.cinemaId,
        payload: {
          detail: 'rehydrate_exception',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}

export function getOrchestrator() {
  return {
    async start(sessionId: bigint) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          screen: { select: { cinemaId: true } },
          quiz: {
            include: {
              questions: {
                include: { answers: true },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

      assertTransition(session.state, 'running');

      if (session.quiz.questions.length === 0) {
        throw new AppError('Quiz has no questions', 400, 'QUIZ_EMPTY');
      }

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          state: 'running',
          startedAt: new Date(),
          currentQuestionStartedAt: null,
          currentQuestionPausedAt: null,
          audioMuted: false,
        },
      });

      const activePlayers = await prisma.player.findMany({
        where: { sessionId, status: 'active' },
        select: { id: true },
      });

      const state: RunningSessionState = {
        sessionId,
        questions: mapQuestionsFromPrisma(session.quiz.questions),
        currentQuestionIndex: -1,
        currentQuestionStartedAt: null,
        currentQuestionPausedAt: null,
        currentQuestionTimeLimitMs: 0,
        questionTimerHandle: null,
        resultsTimerHandle: null,
        resultsPhaseStartedAt: null,
        broadcastInterval: null,
        audioMuted: false,
        inMemoryAnswers: new Map(),
        questionEnded: false,
        playerIds: new Set(activePlayers.map((p) => p.id.toString())),
      };

      runningSessions.set(sessionKey(sessionId), state);

      broadcastToSession(sessionId, 'session:started', {
        sessionId: sessionId.toString(),
        totalQuestions: state.questions.length,
        quiz: shapeQuizBackgroundPayload(session.quiz),
      });

      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: 'lobby',
        newState: 'running',
      });

      logger.info({ sessionId: sessionId.toString() }, 'Session started');

      logEvent({
        level: 'info',
        eventType: 'session.started',
        sessionId,
        cinemaId: session.screen.cinemaId,
        payload: { totalQuestions: state.questions.length },
      });

      setTimeout(() => {
        void nextQuestionInternal(sessionId);
      }, getCountdownMs());
    },

    async pauseSession(sessionId: bigint) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      assertTransition(session.state, 'paused');

      const state = getRunningState(sessionId);

      if (state.currentQuestionStartedAt && !state.currentQuestionPausedAt) {
        state.currentQuestionPausedAt = Date.now();
      }

      clearTimers(state);

      const pauseAtMs = state.currentQuestionPausedAt;
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          state: 'paused',
          ...(pauseAtMs != null ? { currentQuestionPausedAt: new Date(pauseAtMs) } : {}),
        },
      });

      broadcastToSession(sessionId, 'session:paused', {
        sessionId: sessionId.toString(),
      });
      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: 'running',
        newState: 'paused',
      });

      logger.info({ sessionId: sessionId.toString() }, 'Session paused');
    },

    async resumeSession(sessionId: bigint) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      assertTransition(session.state, 'running');

      const state = getRunningState(sessionId);

      if (state.currentQuestionPausedAt && state.currentQuestionStartedAt) {
        const pauseDuration = Date.now() - state.currentQuestionPausedAt;
        state.currentQuestionStartedAt += pauseDuration;
        state.currentQuestionPausedAt = null;

        if (!state.questionEnded) {
          const elapsed = Date.now() - state.currentQuestionStartedAt;
          const remaining = state.currentQuestionTimeLimitMs + TIMER_TOLERANCE_MS - elapsed;

          if (remaining > 0) {
            state.questionTimerHandle = setTimeout(() => {
              void endQuestionInternal(sessionId, false);
            }, remaining);
          } else {
            void endQuestionInternal(sessionId, false);
          }

          state.broadcastInterval = setInterval(() => {
            if (!state.currentQuestionStartedAt || state.currentQuestionPausedAt) return;
            const el = Date.now() - state.currentQuestionStartedAt;
            const rem = Math.max(0, state.currentQuestionTimeLimitMs - el);
            broadcastToSession(sessionId, 'session:timer_update', { remainingMs: rem });
            if (rem <= 0 && state.broadcastInterval) {
              clearInterval(state.broadcastInterval);
              state.broadcastInterval = null;
            }
          }, TIMER_BROADCAST_INTERVAL_MS);
        }
      }

      if (
        state.questionEnded &&
        state.currentQuestionStartedAt === null &&
        state.currentQuestionIndex >= 0 &&
        state.currentQuestionIndex + 1 < state.questions.length
      ) {
        const displayMs = getResultsDisplayMs();
        broadcastToSession(sessionId, 'session:next_question_in', { ms: displayMs });
        state.resultsPhaseStartedAt = Date.now();
        state.resultsTimerHandle = setTimeout(() => {
          void nextQuestionInternal(sessionId);
        }, displayMs);
      }

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          state: 'running',
          currentQuestionStartedAt:
            state.currentQuestionStartedAt != null
              ? new Date(state.currentQuestionStartedAt)
              : null,
          currentQuestionPausedAt: null,
        },
      });

      broadcastToSession(sessionId, 'session:resumed', {
        sessionId: sessionId.toString(),
      });
      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: 'paused',
        newState: 'running',
      });

      logger.info({ sessionId: sessionId.toString() }, 'Session resumed');
    },

    async forceEndQuestion(sessionId: bigint) {
      const st = getRunningState(sessionId);
      if (st.questionEnded) return;
      await endQuestionInternal(sessionId, true);
    },

    async abortSession(sessionId: bigint, reason?: string) {
      const key = sessionKey(sessionId);
      const state = runningSessions.get(key);
      if (state) {
        clearTimers(state);
        runningSessions.delete(key);
      }

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { screen: { select: { cinemaId: true } } },
      });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

      assertTransition(session.state, 'aborted');

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          state: 'aborted',
          endedAt: new Date(),
          currentQuestionStartedAt: null,
          currentQuestionPausedAt: null,
        },
      });

      broadcastToSession(sessionId, 'session:aborted', { reason: reason ?? null });
      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: session.state,
        newState: 'aborted',
      });

      logger.info(
        { sessionId: sessionId.toString(), reason: reason ?? null },
        'Session aborted via orchestrator',
      );

      logEvent({
        level: 'error',
        eventType: 'session.aborted',
        sessionId,
        cinemaId: session.screen.cinemaId,
        payload: { reason: reason ?? null },
      });
    },

    async toggleMute(sessionId: bigint): Promise<boolean> {
      const state = getRunningState(sessionId);
      state.audioMuted = !state.audioMuted;
      await prisma.session.update({
        where: { id: sessionId },
        data: { audioMuted: state.audioMuted },
      });
      broadcastToSession(sessionId, 'session:audio_muted', { muted: state.audioMuted });
      return state.audioMuted;
    },

    async submitAnswer(input: {
      sessionId: bigint;
      playerId: bigint;
      questionId: bigint;
      answerId: bigint;
    }) {
      const state = getRunningState(input.sessionId);

      if (state.questionEnded) {
        throw new AppError('Question already ended', 409, 'QUESTION_ALREADY_ENDED');
      }

      const currentQuestion = state.questions[state.currentQuestionIndex];
      if (!currentQuestion || currentQuestion.id !== input.questionId) {
        throw new AppError('Wrong question', 400, 'WRONG_QUESTION');
      }

      const answerExists = currentQuestion.answers.some((a) => a.id === input.answerId);
      if (!answerExists) {
        throw new AppError('Invalid answer', 400, 'INVALID_ANSWER');
      }

      const pid = input.playerId.toString();
      if (state.inMemoryAnswers.has(pid)) {
        throw new AppError('Already answered', 409, 'ALREADY_ANSWERED');
      }

      const existingRow = await prisma.playerAnswer.findUnique({
        where: {
          playerId_questionId: {
            playerId: input.playerId,
            questionId: input.questionId,
          },
        },
      });
      if (existingRow) {
        throw new AppError('Already answered', 409, 'ALREADY_ANSWERED');
      }

      const timeToAnswerMs = state.currentQuestionStartedAt
        ? Date.now() - state.currentQuestionStartedAt
        : 0;

      state.inMemoryAnswers.set(pid, {
        playerId: input.playerId,
        answerId: input.answerId,
        timeToAnswerMs,
        receivedAt: Date.now(),
      });

      await prisma.playerAnswer.upsert({
        where: {
          playerId_questionId: {
            playerId: input.playerId,
            questionId: input.questionId,
          },
        },
        create: {
          playerId: input.playerId,
          questionId: input.questionId,
          chosenAnswerId: input.answerId,
          answeredAtServer: new Date(),
          timeToAnswerMs,
          pointsAwarded: 0,
          isCorrect: false,
        },
        update: {
          chosenAnswerId: input.answerId,
          answeredAtServer: new Date(),
          timeToAnswerMs,
          pointsAwarded: 0,
          isCorrect: false,
        },
      });

      broadcastToSession(input.sessionId, 'session:answer_submitted_count', {
        count: state.inMemoryAnswers.size,
        total: state.playerIds.size,
      });

      return { timeToAnswerMs };
    },

    addPlayerToSession(sessionId: bigint, playerId: bigint) {
      const state = runningSessions.get(sessionKey(sessionId));
      if (state) {
        state.playerIds.add(playerId.toString());
      }
    },

    getRunningState(sessionId: bigint): RunningSessionState | undefined {
      return runningSessions.get(sessionKey(sessionId));
    },

    isRunning(sessionId: bigint): boolean {
      return runningSessions.has(sessionKey(sessionId));
    },
  };
}

export type Orchestrator = ReturnType<typeof getOrchestrator>;
