import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import pino from 'pino';
import { prisma } from '../src/shared/db/index.js';
import { computeScore } from '../src/shared/scoring/scoring.service.js';
import { quizEngine } from '../src/modules/games/engines/quiz/quiz.engine.js';
import type {
  GameRound,
  RoundContext,
  RoundPlayerMeta,
  ScoreAward,
} from '../src/modules/games/engine.types.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';

/**
 * Moteur quiz seul : faux RoundContext, horloge et minuteurs simulés. Le moteur lit ses
 * questions et écrit player_answers en base ; tout le reste passe par le contexte.
 */

const COUNTDOWN_MS = 3000;
const RESULTS_MS = 8000;
const TIME_LIMIT_MS = 2000;
const TOLERANCE_MS = 500;

interface FakeTimer {
  id: number;
  at: number;
  fn: () => void;
}

function createFakeContext(players: Map<string, RoundPlayerMeta>) {
  let now = 1_700_000_000_000;
  let nextTimerId = 1;
  const timers: FakeTimer[] = [];
  const events: { event: string; payload: Record<string, unknown>; screenOnly: boolean }[] = [];
  const awards: ScoreAward[] = [];
  const totals = new Map<string, number>([...players.keys()].map((id) => [id, 0]));
  const persisted: unknown[] = [];
  const progress: (number | null)[] = [];
  let finishCalls = 0;

  const ctx: RoundContext = {
    sessionId: 1n,
    roundId: 1n,
    players: {
      ids: () => [...players.keys()],
      has: (id) => players.has(id),
      meta: (id) => players.get(id),
    },
    emitState: () => {},
    emitCue: () => {},
    async award(entries) {
      for (const e of entries) {
        awards.push(e);
        const key = e.playerId.toString();
        totals.set(key, (totals.get(key) ?? 0) + e.points);
      }
    },
    async scores() {
      return new Map([...players.keys()].map((id) => [id, totals.get(id) ?? 0]));
    },
    async persistState(json) {
      persisted.push(json);
    },
    async reportProgress(step) {
      progress.push(step);
    },
    async finish() {
      finishCalls += 1;
    },
    now: () => now,
    setTimer(ms, fn) {
      const timer = { id: nextTimerId++, at: now + ms, fn };
      timers.push(timer);
      return () => {
        const i = timers.indexOf(timer);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    log: pino({ level: 'silent' }),
    legacy: {
      broadcast: (event, payload) =>
        events.push({ event, payload: payload as Record<string, unknown>, screenOnly: false }),
      toScreen: (event, payload) =>
        events.push({ event, payload: payload as Record<string, unknown>, screenOnly: true }),
    },
  };

  /** Avance l'horloge simulée en déclenchant, dans l'ordre, les minuteurs échus. */
  function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = target;
  }

  return {
    ctx,
    advance,
    events,
    awards,
    totals,
    persisted,
    progress,
    timers,
    finishCalls: () => finishCalls,
    count: (event: string) => events.filter((e) => e.event === event).length,
    last: (event: string) => [...events].reverse().find((e) => e.event === event)?.payload,
  };
}

async function waitFor(cond: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor timeout');
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

describe('quiz engine (fake RoundContext, simulated clock)', () => {
  let quizId: bigint;
  let playerIds: bigint[];
  let questions: { id: bigint; correct: bigint; wrong: bigint }[];
  let round: GameRound | null;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    process.env.COUNTDOWN_MS = String(COUNTDOWN_MS);
    process.env.RESULTS_DISPLAY_MS = String(RESULTS_MS);
    round = null;

    const admin = await prisma.user.create({
      data: { email: `qe-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    const quiz = await prisma.quiz.create({
      data: {
        slug: `qe-${Date.now()}`,
        title: 'Engine Quiz',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    quizId = quiz.id;
    questions = [];
    for (let i = 1; i <= 2; i++) {
      const q = await prisma.question.create({
        data: {
          quizId: quiz.id,
          position: i,
          text: `Question ${i}?`,
          explanation: `Explication ${i}`,
          timeLimitSeconds: TIME_LIMIT_MS / 1000,
          pointsMax: 1000,
          pointsFloor: 100,
          answers: {
            create: [
              { position: 'A', text: 'Correct', isCorrect: true },
              { position: 'B', text: 'Wrong', isCorrect: false },
            ],
          },
        },
        include: { answers: true },
      });
      questions.push({
        id: q.id,
        correct: q.answers.find((a) => a.isCorrect)!.id,
        wrong: q.answers.find((a) => !a.isCorrect)!.id,
      });
    }

    const infra = await minimalCinemaAndScreen();
    const session = await prisma.session.create({
      data: {
        slugShort: `${Math.floor(Math.random() * 9000) + 1000}`,
        quizId,
        screenId: infra.screenId,
      },
    });
    playerIds = [];
    for (const pseudo of ['Alice', 'Bob', 'Late']) {
      const p = await prisma.player.create({
        data: { sessionId: session.id, pseudo, resumeToken: `qe-${pseudo}-${Date.now()}` },
      });
      playerIds.push(p.id);
    }
  });

  afterEach(() => {
    round?.dispose();
  });

  function answer(r: GameRound, playerId: bigint, questionId: bigint, answerId: bigint) {
    return r.onAction(playerId, { type: 'answer', payload: { questionId, answerId } });
  }

  it('full sequence: same scores as the scoring rule, late joiner locked, finish() once', async () => {
    const [alice, bob, late] = playerIds as [bigint, bigint, bigint];
    const players = new Map<string, RoundPlayerMeta>([
      [alice.toString(), { pseudo: 'Alice', avatarUrl: null, joinedDuringRound: false }],
      [bob.toString(), { pseudo: 'Bob', avatarUrl: 'bob.png', joinedDuringRound: false }],
    ]);
    const f = createFakeContext(players);
    const r = await quizEngine.createRound(f.ctx, { id: 1n, configJson: null, quizId });
    round = r;

    await r.start();
    expect(f.count('session:question_started')).toBe(0);

    // Compte à rebours, puis question 1.
    f.advance(COUNTDOWN_MS);
    await waitFor(() => f.count('session:question_started') === 1);
    const q1 = f.last('session:question_started')!;
    expect(q1.questionId).toBe(questions[0]!.id.toString());
    expect(JSON.stringify(q1)).not.toContain('isCorrect');
    expect(f.progress).toEqual([1]);

    f.advance(1200);
    const resAlice = (await answer(r, alice, questions[0]!.id, questions[0]!.correct)) as {
      timeToAnswerMs: number;
    };
    expect(resAlice.timeToAnswerMs).toBe(1200);
    await expect(answer(r, alice, questions[0]!.id, questions[0]!.wrong)).rejects.toMatchObject({
      code: 'ALREADY_ANSWERED',
    });
    // Cue écran : pseudo, jamais la réponse choisie.
    const cue = f.events.find((e) => e.event === 'session:player_answered')!;
    expect(cue.screenOnly).toBe(true);
    expect(JSON.stringify(cue.payload)).not.toContain(questions[0]!.correct.toString());

    // Pause : réponses refusées, le temps ne s'écoule pas.
    await r.pause();
    await expect(answer(r, bob, questions[0]!.id, questions[0]!.wrong)).rejects.toMatchObject({
      code: 'SESSION_PAUSED',
    });
    f.advance(60_000);
    expect(f.count('session:question_ended')).toBe(0);
    await r.resume();

    f.advance(300);
    await answer(r, bob, questions[0]!.id, questions[0]!.wrong);

    // Clôture de Q1 à l'échéance (temps limite + tolérance, pause exclue).
    f.advance(TIME_LIMIT_MS + TOLERANCE_MS);
    await waitFor(() => f.count('session:question_ended') === 1);
    const ended1 = f.last('session:question_ended')!;
    expect(ended1.correctAnswerId).toBe(questions[0]!.correct.toString());
    const expectedAlice1 = computeScore({
      isCorrect: true,
      timeToAnswerMs: 1200,
      totalTimeMs: TIME_LIMIT_MS,
      pointsMax: 1000,
      pointsFloor: 100,
    });
    expect(expectedAlice1).toBe(400);
    expect(ended1.scoreboard).toEqual([
      {
        playerId: alice.toString(),
        pseudo: 'Alice',
        avatarUrl: null,
        scoreTotal: expectedAlice1,
        scoreThisQuestion: expectedAlice1,
      },
      {
        playerId: bob.toString(),
        pseudo: 'Bob',
        avatarUrl: 'bob.png',
        scoreTotal: 0,
        scoreThisQuestion: 0,
      },
    ]);
    expect(f.last('session:answer_submitted_count')).toEqual({ count: 2, total: 2 });
    expect(f.last('session:next_question_in')).toEqual({ ms: RESULTS_MS });

    // Question 2 ; un retardataire arrive pendant la question : il attend la suivante.
    f.advance(RESULTS_MS);
    await waitFor(() => f.count('session:question_started') === 2);
    players.set(late.toString(), { pseudo: 'Late', avatarUrl: null, joinedDuringRound: true });
    r.onPlayerJoined(late, { rejoin: false });
    await expect(answer(r, late, questions[1]!.id, questions[1]!.correct)).rejects.toMatchObject({
      code: 'LATE_JOIN_LOCKED',
    });
    await expect(answer(r, bob, questions[0]!.id, questions[0]!.correct)).rejects.toMatchObject({
      code: 'WRONG_QUESTION',
    });

    f.advance(300);
    await answer(r, bob, questions[1]!.id, questions[1]!.correct);
    await answer(r, alice, questions[1]!.id, questions[1]!.wrong);

    // Joueur retiré par la plateforme (exclu / parti) : refusé.
    players.delete(alice.toString());
    f.advance(TIME_LIMIT_MS + TOLERANCE_MS);
    await waitFor(() => f.finishCalls() === 1);

    const expectedBob2 = computeScore({
      isCorrect: true,
      timeToAnswerMs: 300,
      totalTimeMs: TIME_LIMIT_MS,
      pointsMax: 1000,
      pointsFloor: 100,
    });
    expect(f.awards).toEqual([
      {
        playerId: alice,
        points: expectedAlice1,
        reason: 'quiz_answer',
        meta: { questionId: questions[0]!.id.toString(), timeToAnswerMs: 1200 },
      },
      {
        playerId: bob,
        points: expectedBob2,
        reason: 'quiz_answer',
        meta: { questionId: questions[1]!.id.toString(), timeToAnswerMs: 300 },
      },
    ]);

    // Dernière question : pas de next_question_in, fin de manche une seule fois.
    expect(f.count('session:next_question_in')).toBe(1);
    await r.forceAdvance();
    f.advance(60_000);
    expect(f.finishCalls()).toBe(1);
    expect(f.timers).toHaveLength(0);

    // player_answers : bonne réponse notée, retardataire sans réponse à Q2.
    const rows = await prisma.playerAnswer.findMany({ where: { questionId: questions[1]!.id } });
    const byPlayer = new Map(rows.map((row) => [row.playerId, row]));
    expect(byPlayer.get(bob)?.pointsAwarded).toBe(expectedBob2);
    expect(byPlayer.get(late)?.chosenAnswerId).toBeNull();

    // Plus aucun timer_update une fois la question close ; état persisté final.
    expect(f.persisted.at(-1)).toMatchObject({ phase: 'done' });
  });

  it('restore in the middle of a question: closes it with recorded answers, then continues', async () => {
    const [alice] = playerIds as [bigint];
    await prisma.playerAnswer.create({
      data: {
        playerId: alice,
        questionId: questions[0]!.id,
        chosenAnswerId: questions[0]!.correct,
        answeredAtServer: new Date(),
        timeToAnswerMs: 500,
        pointsAwarded: 0,
        isCorrect: false,
      },
    });
    const players = new Map<string, RoundPlayerMeta>([
      [alice.toString(), { pseudo: 'Alice', avatarUrl: null, joinedDuringRound: false }],
    ]);
    const f = createFakeContext(players);
    const r = await quizEngine.createRound(
      f.ctx,
      { id: 1n, configJson: null, quizId },
      {
        stateJson: {
          v: 1,
          phase: 'question',
          questionIndex: 0,
          questionStartedAt: f.ctx.now() - 1000,
          pausedAt: null,
        },
        interruptedAt: new Date(),
      },
    );
    round = r;
    await r.start();

    expect(f.count('session:question_ended')).toBe(1);
    expect(f.awards).toEqual([
      {
        playerId: alice,
        points: computeScore({
          isCorrect: true,
          timeToAnswerMs: 500,
          totalTimeMs: TIME_LIMIT_MS,
          pointsMax: 1000,
          pointsFloor: 100,
        }),
        reason: 'quiz_answer',
        meta: { questionId: questions[0]!.id.toString(), timeToAnswerMs: 500 },
      },
    ]);
    f.advance(RESULTS_MS);
    await waitFor(() => f.count('session:question_started') === 1);
    expect(f.last('session:question_started')!.questionId).toBe(questions[1]!.id.toString());
  });

  it('restore of a paused session: the interrupted question is closed, the next waits for resume', async () => {
    const players = new Map<string, RoundPlayerMeta>([
      [playerIds[0]!.toString(), { pseudo: 'Alice', avatarUrl: null, joinedDuringRound: false }],
    ]);
    const f = createFakeContext(players);
    const r = await quizEngine.createRound(
      f.ctx,
      { id: 1n, configJson: null, quizId },
      {
        stateJson: {
          v: 1,
          phase: 'question',
          questionIndex: 0,
          questionStartedAt: f.ctx.now() - 1000,
          pausedAt: f.ctx.now() - 500,
        },
        interruptedAt: new Date(),
      },
    );
    round = r;
    await r.pause();
    await r.start();

    expect(f.count('session:question_ended')).toBe(1);
    f.advance(60_000);
    expect(f.count('session:question_started')).toBe(0);

    await r.resume();
    f.advance(RESULTS_MS);
    await waitFor(() => f.count('session:question_started') === 1);
  });
});
