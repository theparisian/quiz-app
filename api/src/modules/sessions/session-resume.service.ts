import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { shapeQuizBackgroundPayload } from '../quizzes/quiz-background.js';
import {
  getOrchestrator,
  getResultsDisplayMs,
  type RunningSessionState,
} from './session-orchestrator.service.js';
import { getLobbyTimerRemainingMs } from './lobby-timer.service.js';
import {
  resolvePrizeConfig,
  resolveEligiblePrizeForPlayer,
} from '../prizes/prize-config.service.js';
import { resolvePrizesPayload } from '../prizes/prize-display.service.js';

function resultsPhaseRemainingMs(mem: RunningSessionState): number {
  const start = mem.resultsPhaseStartedAt;
  if (start == null) return getResultsDisplayMs();
  return Math.max(0, getResultsDisplayMs() - (Date.now() - start));
}

/** remainingMs question courante (spec PR6) — mémoire orchestrator + état DB session. */
function questionRemainingMsFromMem(
  sessionState: string,
  mem: RunningSessionState,
  timeLimitMs: number,
): number {
  const started = mem.currentQuestionStartedAt;
  if (!started || timeLimitMs <= 0) return 0;
  if (sessionState === 'paused' && mem.currentQuestionPausedAt) {
    return Math.max(0, timeLimitMs - (mem.currentQuestionPausedAt - started));
  }
  return Math.max(0, timeLimitMs - (Date.now() - started));
}

async function activePlayersRanked(sessionId: bigint) {
  return prisma.player.findMany({
    where: { sessionId, status: 'active' },
    orderBy: [{ scoreTotal: 'desc' }, { joinedAt: 'asc' }],
  });
}

async function lastAnsweredQuestionPosition(playerId: bigint, quizId: bigint): Promise<number> {
  const rows = await prisma.playerAnswer.findMany({
    where: {
      playerId,
      chosenAnswerId: { not: null },
      question: { quizId },
    },
    select: { question: { select: { position: true } } },
  });
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.question.position));
}

async function countMissedPlayerAnswers(playerId: bigint, quizId: bigint) {
  return prisma.playerAnswer.count({
    where: { playerId, chosenAnswerId: null, question: { quizId } },
  });
}

async function loadSessionFull(sessionId: bigint) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            include: { answers: true },
            orderBy: { position: 'asc' },
          },
        },
      },
      screen: { include: { cinema: true } },
    },
  });
  if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  return session;
}

function resolveJoinedQuestionPosition(
  session: { currentQuestionPosition: number | null; state: string },
  mem: RunningSessionState | undefined,
): number {
  const dbPos = session.currentQuestionPosition ?? 0;
  if (dbPos > 0) return dbPos;
  if (mem && mem.currentQuestionIndex >= 0 && mem.currentQuestionIndex < mem.questions.length) {
    return mem.questions[mem.currentQuestionIndex]!.position;
  }
  return 0;
}

function isLateJoinerOnCurrentQuestion(
  joinedQuestionPosition: number | null,
  questionPosition: number,
): boolean {
  return joinedQuestionPosition != null && joinedQuestionPosition === questionPosition;
}

export async function buildPlayerJoinSnapshot(
  sessionId: bigint,
  playerId: bigint,
): Promise<Record<string, unknown>> {
  const session = await loadSessionFull(sessionId);
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.sessionId !== sessionId) {
    throw new AppError('Session mismatch', 403, 'SESSION_MISMATCH');
  }

  const totalQuestions = session.quiz.questions.length;
  const mem = getOrchestrator().getRunningState(sessionId);
  const currentQuestionPosition = resolveJoinedQuestionPosition(session, mem);

  const base = {
    sessionState: session.state,
    currentQuestionPosition,
    totalQuestions,
    canAnswerCurrentQuestion: false as const,
  };

  if (session.state === 'paused' && mem) {
    return base;
  }

  if (!mem) {
    return base;
  }

  if (
    !mem.questionEnded &&
    mem.currentQuestionStartedAt &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    return {
      ...base,
      timerRemainingMs: questionRemainingMsFromMem(
        session.state,
        mem,
        mem.currentQuestionTimeLimitMs,
      ),
    };
  }

  if (
    mem.questionEnded &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    const hasNext = mem.currentQuestionIndex + 1 < mem.questions.length;
    if (!hasNext) {
      return {
        ...base,
        showFinalImmediately: true,
        timerRemainingMs: resultsPhaseRemainingMs(mem),
      };
    }
    return {
      ...base,
      timerRemainingMs: resultsPhaseRemainingMs(mem),
    };
  }

  return base;
}

export async function buildMobilePlayerStateSnapshot(
  playerId: bigint,
  sessionId: bigint,
): Promise<Record<string, unknown>> {
  const session = await loadSessionFull(sessionId);
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.sessionId !== sessionId) {
    throw new AppError('Session mismatch', 403, 'SESSION_MISMATCH');
  }

  const ranked = await activePlayersRanked(sessionId);
  const rankIdx = ranked.findIndex((p) => p.id === playerId);
  const currentRank =
    session.state !== 'running' && session.state !== 'paused'
      ? null
      : rankIdx >= 0
        ? rankIdx + 1
        : null;

  const totalActive = ranked.length;
  const mem = getOrchestrator().getRunningState(sessionId);

  const base = {
    player: {
      playerId: player.id.toString(),
      pseudo: player.pseudo,
      scoreTotal: player.scoreTotal,
      currentRank: session.state === 'running' || session.state === 'paused' ? currentRank : null,
      joinedQuestionPosition: player.joinedQuestionPosition,
    },
    session: {
      sessionId: session.id.toString(),
      slugShort: session.slugShort,
      state: session.state,
      totalQuestions: session.quiz.questions.length,
      totalPlayers: totalActive,
      audioMuted: session.audioMuted,
    },
  };

  if (session.state === 'lobby') {
    const prizes = await resolvePrizesPayload(sessionId);
    return prizes ? { ...base, prizes } : { ...base };
  }

  if (session.state === 'aborted') {
    return { ...base };
  }

  if (session.state === 'ended') {
    const r = player.rankFinal;
    const board = ranked.map((p, i) => ({
      playerId: p.id.toString(),
      pseudo: p.pseudo,
      scoreTotal: p.scoreTotal,
      rank: i + 1,
    }));
    const prizeAvailabilityByRank: Record<string, boolean> = {};
    for (const rank of [1, 2, 3] as const) {
      const cfg = await resolvePrizeConfig(sessionId, rank);
      prizeAvailabilityByRank[`rank${rank}`] = cfg !== null;
    }
    const eligible = await resolveEligiblePrizeForPlayer(sessionId, r ?? rankIdx + 1);
    const prizes = await resolvePrizesPayload(sessionId);
    return {
      ...base,
      finalResults: {
        rank: r ?? rankIdx + 1,
        finalScoreboard: board,
        eligibleForPrize: eligible !== null,
      },
      prizeAvailabilityByRank,
      ...(prizes ? { prizes } : {}),
    };
  }

  const missedFromNull = await countMissedPlayerAnswers(playerId, session.quizId);
  const lastAnswered = await lastAnsweredQuestionPosition(playerId, session.quizId);
  const dbQPos = session.currentQuestionPosition ?? 0;
  const gapMissed = Math.max(0, dbQPos - lastAnswered - 1);
  const missedDisplay =
    session.state === 'running' || session.state === 'paused'
      ? Math.max(missedFromNull, gapMissed)
      : missedFromNull;

  const out: Record<string, unknown> = { ...base };

  if (missedDisplay > 0 && (session.state === 'running' || session.state === 'paused')) {
    out.missedQuestions = { count: missedDisplay };
  }

  if (
    mem &&
    !mem.questionEnded &&
    mem.currentQuestionStartedAt &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    const q = mem.questions[mem.currentQuestionIndex]!;
    const lockedForLateJoiner = isLateJoinerOnCurrentQuestion(
      player.joinedQuestionPosition,
      q.position,
    );

    if (lockedForLateJoiner) {
      out.lateJoinWait = {
        timerRemainingMs: questionRemainingMsFromMem(
          session.state,
          mem,
          mem.currentQuestionTimeLimitMs,
        ),
      };
    } else {
      const pa = await prisma.playerAnswer.findUnique({
        where: {
          playerId_questionId: { playerId, questionId: q.id },
        },
      });
      let alreadyPosition: string | null = null;
      if (pa?.chosenAnswerId) {
        const ans = q.answers.find((a) => a.id === pa.chosenAnswerId);
        alreadyPosition = ans ? ans.position : null;
      }

      out.currentQuestion = {
        position: q.position,
        questionId: q.id.toString(),
        text: q.text,
        imageUrl: q.imageUrl,
        answers: q.answers.map((a) => ({
          id: a.id.toString(),
          position: a.position as 'A' | 'B' | 'C' | 'D',
          text: a.text,
        })),
        timeLimitMs: mem.currentQuestionTimeLimitMs,
        remainingMs: questionRemainingMsFromMem(session.state, mem, mem.currentQuestionTimeLimitMs),
        alreadyAnsweredPosition: alreadyPosition,
      };
    }
  }

  if (
    mem &&
    mem.questionEnded &&
    mem.currentQuestionStartedAt === null &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    const q = mem.questions[mem.currentQuestionIndex]!;
    const hasNext = mem.currentQuestionIndex + 1 < mem.questions.length;
    const lockedForLateJoiner = isLateJoinerOnCurrentQuestion(
      player.joinedQuestionPosition,
      q.position,
    );

    if (lockedForLateJoiner && !hasNext) {
      const board = ranked.map((p, i) => ({
        playerId: p.id.toString(),
        pseudo: p.pseudo,
        scoreTotal: p.scoreTotal,
        rank: i + 1,
      }));
      out.finalResults = {
        rank: rankIdx >= 0 ? rankIdx + 1 : ranked.length,
        finalScoreboard: board,
        eligibleForPrize: false,
      };
    } else if (lockedForLateJoiner && hasNext) {
      out.lateJoinWait = {
        timerRemainingMs: resultsPhaseRemainingMs(mem),
      };
    } else {
      const correct = q.answers.find((a) => a.isCorrect);
      const pa = await prisma.playerAnswer.findUnique({
        where: { playerId_questionId: { playerId, questionId: q.id } },
      });
      const isCorrect = !!(pa?.chosenAnswerId && correct && pa.chosenAnswerId === correct.id);
      out.showingResults = {
        correctAnswerId: correct?.id.toString() ?? '',
        pointsAwarded: pa?.pointsAwarded ?? 0,
        isCorrect,
        nextQuestionInMs: resultsPhaseRemainingMs(mem),
      };
    }
  }

  return out;
}

export async function buildNucStateSnapshot(params: {
  nucId: bigint;
  screenId: bigint;
  sessionId: bigint | null;
}): Promise<Record<string, unknown>> {
  const nuc = await prisma.nuc.findUnique({
    where: { id: params.nucId },
    include: { screen: { include: { cinema: true } } },
  });
  if (!nuc) throw new AppError('NUC not found', 404, 'NUC_NOT_FOUND');

  const cinema = nuc.screen.cinema;
  const nucBlock = {
    nucId: nuc.id.toString(),
    screenId: nuc.screenId.toString(),
    cinemaSlug: cinema.slug,
    cinemaName: cinema.name,
    cinemaLogoUrl: cinema.logoUrl,
    backgroundMusicUrl: cinema.backgroundMusicUrl,
  };

  if (!params.sessionId) {
    return {
      nuc: nucBlock,
      session: null,
      audioMuted: false,
    };
  }

  const session = await loadSessionFull(params.sessionId);
  if (session.screenId !== params.screenId) {
    throw new AppError('Session not on this screen', 403, 'SESSION_SCREEN_MISMATCH');
  }

  const players = await prisma.player.findMany({
    where: { sessionId: session.id, status: 'active' },
    orderBy: { joinedAt: 'asc' },
    select: { id: true, pseudo: true, scoreTotal: true, joinedAt: true },
  });

  const ranked = await activePlayersRanked(session.id);
  const mem = getOrchestrator().getRunningState(session.id);

  const scoreboard = ranked.slice(0, 5).map((p) => ({
    playerId: p.id.toString(),
    pseudo: p.pseudo,
    scoreTotal: p.scoreTotal,
  }));

  const fullBoard = ranked.map((p, i) => ({
    playerId: p.id.toString(),
    pseudo: p.pseudo,
    scoreTotal: p.scoreTotal,
    rank: i + 1,
  }));

  const baseSession = {
    sessionId: session.id.toString(),
    slugShort: session.slugShort,
    state: session.state,
    totalQuestions: session.quiz.questions.length,
    totalPlayers: players.length,
    audioMuted: session.audioMuted,
  };

  const out: Record<string, unknown> = {
    nuc: nucBlock,
    session: baseSession,
    audioMuted: session.audioMuted,
    quiz: shapeQuizBackgroundPayload(session.quiz),
    players: players.map((p) => ({
      playerId: p.id.toString(),
      pseudo: p.pseudo,
      scoreTotal: p.scoreTotal,
      joinedAt: p.joinedAt.toISOString(),
    })),
    scoreboard,
  };

  if (session.state === 'lobby') {
    const lobbyTimerRemainingMs = getLobbyTimerRemainingMs(session.id);
    if (lobbyTimerRemainingMs !== null) {
      out.lobbyTimerRemainingMs = lobbyTimerRemainingMs;
    }
    const prizes = await resolvePrizesPayload(session.id);
    return prizes ? { ...out, prizes } : out;
  }

  if (session.state === 'ended') {
    const top3 = fullBoard.slice(0, 3);
    out.finalScoreboard = fullBoard;
    out.scoreboard = top3.map((e) => ({
      playerId: e.playerId,
      pseudo: e.pseudo,
      scoreTotal: e.scoreTotal,
    }));
    const prizes = await resolvePrizesPayload(session.id);
    if (prizes) out.prizes = prizes;
    return out;
  }

  if (session.state === 'aborted') {
    return out;
  }

  if (
    mem &&
    !mem.questionEnded &&
    mem.currentQuestionStartedAt &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    const q = mem.questions[mem.currentQuestionIndex]!;
    out.currentQuestion = {
      position: q.position,
      questionId: q.id.toString(),
      text: q.text,
      imageUrl: q.imageUrl,
      answers: q.answers.map((a) => ({
        position: a.position,
        text: a.text,
      })),
      timeLimitMs: mem.currentQuestionTimeLimitMs,
      remainingMs: questionRemainingMsFromMem(session.state, mem, mem.currentQuestionTimeLimitMs),
    };
  }

  if (
    mem &&
    mem.questionEnded &&
    mem.currentQuestionStartedAt === null &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    const q = mem.questions[mem.currentQuestionIndex]!;
    const correct = q.answers.find((a) => a.isCorrect);
    const lastRows = await prisma.playerAnswer.findMany({
      where: {
        questionId: q.id,
        playerId: { in: ranked.map((p) => p.id) },
      },
      include: { player: { select: { id: true, pseudo: true } } },
    });
    const sb = lastRows
      .map((r) => ({
        playerId: r.playerId.toString(),
        pseudo: r.player.pseudo,
        scoreTotal: ranked.find((x) => x.id === r.playerId)?.scoreTotal ?? 0,
        scoreThisQuestion: r.pointsAwarded,
      }))
      .sort((a, b) => b.scoreTotal - a.scoreTotal)
      .slice(0, 5);
    out.lastResults = {
      correctAnswerId: correct?.id.toString() ?? '',
      scoreboard: sb,
      explanation: q.explanation,
      nextQuestionInMs:
        mem.currentQuestionIndex + 1 < mem.questions.length ? resultsPhaseRemainingMs(mem) : 0,
    };
  }

  return out;
}

export async function buildConsoleStateSnapshot(
  sessionId: bigint,
): Promise<Record<string, unknown>> {
  const session = await loadSessionFull(sessionId);
  const players = await prisma.player.findMany({
    where: { sessionId: session.id, status: 'active' },
    orderBy: [{ scoreTotal: 'desc' }, { joinedAt: 'asc' }],
    select: { id: true, pseudo: true, scoreTotal: true, joinedAt: true },
  });

  const mem = getOrchestrator().getRunningState(session.id);

  const quiz = {
    id: session.quiz.id.toString(),
    slug: session.quiz.slug,
    title: session.quiz.title,
    questions: session.quiz.questions.map((q) => ({
      id: q.id.toString(),
      position: q.position,
      text: q.text,
      imageUrl: q.imageUrl,
      timeLimitSeconds: q.timeLimitSeconds,
      pointsMax: q.pointsMax,
      pointsFloor: q.pointsFloor,
      explanation: q.explanation,
      answers: q.answers.map((a) => ({
        id: a.id.toString(),
        position: String(a.position),
        text: a.text,
        isCorrect: a.isCorrect,
      })),
    })),
  };

  const base: Record<string, unknown> = {
    session: {
      sessionId: session.id.toString(),
      slugShort: session.slugShort,
      state: session.state,
      totalQuestions: session.quiz.questions.length,
      totalPlayers: players.length,
      audioMuted: session.audioMuted,
    },
    ...(session.state === 'lobby'
      ? (() => {
          const remaining = getLobbyTimerRemainingMs(session.id);
          return remaining !== null ? { lobbyTimerRemainingMs: remaining } : {};
        })()
      : {}),
    quiz,
    players: players.map((p) => ({
      playerId: p.id.toString(),
      pseudo: p.pseudo,
      scoreTotal: p.scoreTotal,
      joinedAt: p.joinedAt.toISOString(),
    })),
    scoreboard: players.slice(0, 5).map((p) => ({
      playerId: p.id.toString(),
      pseudo: p.pseudo,
      scoreTotal: p.scoreTotal,
    })),
  };

  if (
    mem &&
    !mem.questionEnded &&
    mem.currentQuestionStartedAt &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    const q = mem.questions[mem.currentQuestionIndex]!;
    base.currentQuestion = {
      position: q.position,
      questionId: q.id.toString(),
      text: q.text,
      imageUrl: q.imageUrl,
      answers: q.answers.map((a) => ({
        position: a.position,
        text: a.text,
        isCorrect: a.isCorrect,
      })),
      timeLimitMs: mem.currentQuestionTimeLimitMs,
      remainingMs: questionRemainingMsFromMem(session.state, mem, mem.currentQuestionTimeLimitMs),
    };
  }

  if (
    mem &&
    mem.questionEnded &&
    mem.currentQuestionStartedAt === null &&
    mem.currentQuestionIndex >= 0 &&
    mem.currentQuestionIndex < mem.questions.length
  ) {
    const q = mem.questions[mem.currentQuestionIndex]!;
    const correct = q.answers.find((a) => a.isCorrect);
    base.lastResults = {
      correctAnswerId: correct?.id.toString() ?? '',
      scoreboard: players.slice(0, 5).map((p) => ({
        playerId: p.id.toString(),
        pseudo: p.pseudo,
        scoreTotal: p.scoreTotal,
      })),
      explanation: q.explanation,
      nextQuestionInMs:
        mem.currentQuestionIndex + 1 < mem.questions.length ? resultsPhaseRemainingMs(mem) : 0,
    };
  }

  if (session.state === 'ended') {
    base.finalScoreboard = players.map((p, i) => ({
      playerId: p.id.toString(),
      pseudo: p.pseudo,
      scoreTotal: p.scoreTotal,
      rank: i + 1,
    }));
  }

  const prizes = await resolvePrizesPayload(sessionId);
  if (prizes) base.prizes = prizes;

  return base;
}
