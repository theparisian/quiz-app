import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import pino from 'pino';
import {
  quizMobileViewSchema,
  quizScreenViewSchema,
  type QuizMobileView,
  type QuizScreenView,
} from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { computeScore } from '../src/shared/scoring/scoring.service.js';
import { quizEngine } from '../src/modules/games/engines/quiz/quiz.engine.js';
import type {
  Audience,
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

interface EmittedState {
  audience: Audience;
  /** Destinataire : l'audience, ou `mobile:<id>` pour une vue ciblée. */
  key: string;
  playerId: string | null;
  seq: number;
  at: number;
  view: Record<string, unknown>;
}

function createFakeContext(players: Map<string, RoundPlayerMeta>) {
  let now = 1_700_000_000_000;
  let nextTimerId = 1;
  const timers: FakeTimer[] = [];
  const states: EmittedState[] = [];
  const cues: { audience: Audience; cue: string; data: Record<string, unknown> }[] = [];
  const seqs = new Map<string, number>();
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
    emitState(audience, view, playerId) {
      const key = playerId !== undefined ? `mobile:${playerId}` : audience;
      const seq = (seqs.get(key) ?? 0) + 1;
      seqs.set(key, seq);
      // Copie : ce qui part sur le réseau est figé au moment de l'émission.
      states.push({
        audience,
        key,
        playerId: playerId?.toString() ?? null,
        seq,
        at: now,
        view: JSON.parse(JSON.stringify(view)) as Record<string, unknown>,
      });
    },
    emitCue(audience, cue, data) {
      cues.push({ audience, cue, data: (data ?? {}) as Record<string, unknown> });
    },
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

  const of = (key: string) => states.filter((st) => st.key === key);
  const screenViews = () => of('screen').map((st) => st.view as unknown as QuizScreenView);

  return {
    ctx,
    advance,
    now: () => now,
    states,
    cues,
    awards,
    totals,
    persisted,
    progress,
    timers,
    finishCalls: () => finishCalls,
    of,
    screenViews,
    /** Nombre de vues écran dans cette phase (pour question / reveal : à cet index). */
    countScreen: (phase: string, questionIndex?: number) =>
      screenViews().filter(
        (v) =>
          v.phase === phase && (questionIndex === undefined || v.questionIndex === questionIndex),
      ).length,
    lastScreen: () => screenViews().at(-1),
    lastOf: (key: string) => of(key).at(-1)?.view,
    countCue: (cue: string) => cues.filter((c) => c.cue === cue).length,
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
    expect(f.countScreen('question')).toBe(0);
    expect(f.lastScreen()).toMatchObject({ phase: 'countdown', questionIndex: -1 });

    // Compte à rebours, puis question 1.
    f.advance(COUNTDOWN_MS);
    await waitFor(() => f.countScreen('question', 0) === 1);
    const q1 = f.lastScreen()!;
    expect(q1.phase === 'question' && q1.question.id).toBe(questions[0]!.id.toString());
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
    const cue = f.cues.find((c) => c.cue === 'player_answered')!;
    expect(cue.audience).toBe('screen');
    expect(cue.data).toEqual({ playerId: alice.toString(), pseudo: 'Alice', avatarUrl: null });
    expect(JSON.stringify(cue.data)).not.toContain(questions[0]!.correct.toString());

    // Pause : réponses refusées, le temps ne s'écoule pas.
    await r.pause();
    await expect(answer(r, bob, questions[0]!.id, questions[0]!.wrong)).rejects.toMatchObject({
      code: 'SESSION_PAUSED',
    });
    f.advance(60_000);
    expect(f.countScreen('reveal')).toBe(0);
    await r.resume();

    f.advance(300);
    await answer(r, bob, questions[0]!.id, questions[0]!.wrong);

    // Clôture de Q1 à l'échéance (temps limite + tolérance, pause exclue).
    f.advance(TIME_LIMIT_MS + TOLERANCE_MS);
    await waitFor(() => f.countScreen('reveal', 0) === 1);
    const ended1 = f.lastScreen()!;
    if (ended1.phase !== 'reveal') throw new Error('expected reveal');
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
        rank: 1,
      },
      {
        playerId: bob.toString(),
        pseudo: 'Bob',
        avatarUrl: 'bob.png',
        scoreTotal: 0,
        scoreThisQuestion: 0,
        rank: 2,
      },
    ]);
    expect(ended1).toMatchObject({ answeredCount: 2, totalPlayers: 2 });
    // Échéance de la question suivante : affichage des résultats complet.
    expect(Date.parse(ended1.endsAt!) - f.now()).toBe(RESULTS_MS);

    // Question 2 ; un retardataire arrive pendant la question : il attend la suivante.
    f.advance(RESULTS_MS);
    await waitFor(() => f.countScreen('question', 1) === 1);
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

    // Dernière question : pas d'échéance de question suivante, fin de manche une seule fois.
    const lastReveal = f
      .screenViews()
      .filter((v) => v.phase === 'reveal')
      .at(-1)!;
    expect(lastReveal).toMatchObject({ questionIndex: 1, endsAt: null, pausedRemainingMs: null });
    expect(f.lastScreen()).toMatchObject({ phase: 'done' });
    await r.forceAdvance();
    f.advance(60_000);
    expect(f.finishCalls()).toBe(1);
    expect(f.timers).toHaveLength(0);

    // player_answers : bonne réponse notée, retardataire sans réponse à Q2.
    const rows = await prisma.playerAnswer.findMany({ where: { questionId: questions[1]!.id } });
    const byPlayer = new Map(rows.map((row) => [row.playerId, row]));
    expect(byPlayer.get(bob)?.pointsAwarded).toBe(expectedBob2);
    expect(byPlayer.get(late)?.chosenAnswerId).toBeNull();

    // Aucun minuteur restant ; état persisté final.
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

    expect(f.countScreen('reveal', 0)).toBe(1);
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
    await waitFor(() => f.countScreen('question') === 1);
    const q2 = f.lastScreen()!;
    expect(q2.phase === 'question' && q2.question.id).toBe(questions[1]!.id.toString());
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

    expect(f.countScreen('reveal', 0)).toBe(1);
    f.advance(60_000);
    expect(f.countScreen('question')).toBe(0);

    await r.resume();
    f.advance(RESULTS_MS);
    await waitFor(() => f.countScreen('question') === 1);
  });
  /**
   * Partie complète jouée par Alice (juste, puis faux) et Bob (faux, puis rien), avec une
   * pause pendant la question 2 et un retardataire. Renvoie le faux contexte.
   */
  async function playFullGame() {
    const [alice, bob, late] = playerIds as [bigint, bigint, bigint];
    const players = new Map<string, RoundPlayerMeta>([
      [alice.toString(), { pseudo: 'Alice', avatarUrl: null, joinedDuringRound: false }],
      [bob.toString(), { pseudo: 'Bob', avatarUrl: null, joinedDuringRound: false }],
    ]);
    const f = createFakeContext(players);
    const r = await quizEngine.createRound(f.ctx, { id: 1n, configJson: null, quizId });
    round = r;
    const checkSnapshots = () => {
      // La vue émise en dernier vers chaque destinataire est exactement son snapshot.
      expect(r.snapshot('screen')).toEqual(f.lastOf('screen'));
      expect(r.snapshot('console')).toEqual(f.lastOf('console'));
      for (const id of players.keys()) {
        expect(r.snapshot('mobile', BigInt(id))).toEqual(f.lastOf(`mobile:${id}`));
      }
    };

    await r.start();
    checkSnapshots();
    f.advance(COUNTDOWN_MS);
    await waitFor(() => f.countScreen('question', 0) === 1);
    checkSnapshots();
    f.advance(400);
    await answer(r, alice, questions[0]!.id, questions[0]!.correct);
    f.advance(100);
    await answer(r, bob, questions[0]!.id, questions[0]!.wrong);
    f.advance(TIME_LIMIT_MS + TOLERANCE_MS);
    await waitFor(() => f.countScreen('reveal', 0) === 1);
    checkSnapshots();

    f.advance(RESULTS_MS);
    await waitFor(() => f.countScreen('question', 1) === 1);
    players.set(late.toString(), { pseudo: 'Late', avatarUrl: null, joinedDuringRound: true });
    r.onPlayerJoined(late, { rejoin: false });
    f.advance(300);
    await answer(r, alice, questions[1]!.id, questions[1]!.wrong);
    await r.pause();
    checkSnapshots();
    f.advance(10_000);
    await r.resume();
    checkSnapshots();
    f.advance(TIME_LIMIT_MS + TOLERANCE_MS);
    await waitFor(() => f.finishCalls() === 1);
    return { f, alice, bob, late };
  }

  it('view sequence: every view validates, phases in order, deadlines instead of ticks', async () => {
    const { f, late } = await playFullGame();

    for (const st of f.states) {
      const schema = st.audience === 'mobile' ? quizMobileViewSchema : quizScreenViewSchema;
      expect(schema.safeParse(st.view).success).toBe(true);
    }

    // Phases successives de l'écran (vues consécutives identiques regroupées).
    const phases = f
      .screenViews()
      .map((v) => `${v.phase}:${v.questionIndex}`)
      .filter((p, i, all) => p !== all[i - 1]);
    expect(phases).toEqual([
      'countdown:-1',
      'question:0',
      'reveal:0',
      'question:1',
      'reveal:1',
      'done:1',
    ]);

    // Pause : le temps restant figé remplace l'échéance, puis l'échéance revient décalée.
    const q2 = f.screenViews().filter((v) => v.phase === 'question' && v.questionIndex === 1);
    const paused = q2.find((v) => v.pausedRemainingMs !== null)!;
    expect(paused.endsAt).toBeNull();
    expect(paused.pausedRemainingMs).toBe(TIME_LIMIT_MS - 300);
    const before = Date.parse(q2[0]!.endsAt!);
    const after = Date.parse(q2.at(-1)!.endsAt!);
    expect(after - before).toBe(10_000);

    // Le retardataire : bloqué sur la question 2, pas de résultat à la révélation.
    const lateViews = f.of(`mobile:${late}`).map((st) => st.view as unknown as QuizMobileView);
    expect(lateViews[0]).toMatchObject({ phase: 'question', me: { locked: true, answerId: null } });
    expect(lateViews.find((v) => v.phase === 'reveal')).toMatchObject({
      me: { locked: true, result: null },
    });

    // Mobile : résultat personnel à la révélation (rang, points, total).
    const aliceReveal = f
      .of(`mobile:${playerIds[0]}`)
      .map((st) => st.view as unknown as QuizMobileView)
      .find((v) => v.phase === 'reveal' && v.questionIndex === 0)!;
    expect(aliceReveal.me).toEqual({
      answerId: questions[0]!.correct.toString(),
      locked: false,
      result: {
        isCorrect: true,
        points: computeScore({
          isCorrect: true,
          timeToAnswerMs: 400,
          totalTimeMs: TIME_LIMIT_MS,
          pointsMax: 1000,
          pointsFloor: 100,
        }),
        rank: 1,
        scoreTotal: f.totals.get(playerIds[0]!.toString()),
      },
    });

    // Cues écran : ouverture, clôture, une réponse = un cue ; aucun cue vers le mobile.
    expect(f.countCue('question_opened')).toBe(2);
    expect(f.countCue('question_closed')).toBe(2);
    expect(f.countCue('player_answered')).toBe(3);
    expect(f.cues.every((c) => c.audience === 'screen')).toBe(true);
  });

  it('confidentiality: no question-phase view holds the correct answer or another player answer', async () => {
    const { f, alice, bob } = await playFullGame();
    const chosen = new Map<string, Set<string>>([
      [
        alice.toString(),
        new Set([questions[0]!.correct.toString(), questions[1]!.wrong.toString()]),
      ],
      [bob.toString(), new Set([questions[0]!.wrong.toString()])],
    ]);
    const allChosen = new Set([...chosen.values()].flatMap((set) => [...set]));
    const correct = new Set(questions.map((q) => q.correct.toString()));

    const questionViews = f.states.filter((st) => st.view.phase === 'question');
    expect(questionViews.length).toBeGreaterThan(0);
    for (const st of questionViews) {
      const serialized = JSON.stringify(st.view);
      expect(serialized).not.toContain('isCorrect');
      expect(serialized).not.toContain('correctAnswerId');
      // Les identifiants de réponses apparaissent dans la liste des réponses proposées :
      // hors de cette liste, aucune bonne réponse ni réponse d'un autre joueur.
      const { question: _question, ...rest } = st.view;
      const outside = JSON.stringify(rest);
      const own = st.playerId ? (chosen.get(st.playerId) ?? new Set<string>()) : new Set<string>();
      for (const id of new Set([...correct, ...allChosen])) {
        if (own.has(id)) continue;
        expect(outside).not.toContain(`"${id}"`);
      }
    }
  });

  it('full-view property: a client receiving 1 game:state out of 3 reaches the same state', async () => {
    const { f } = await playFullGame();

    for (const key of new Set(f.states.map((st) => st.key))) {
      const stream = f.of(key);
      // Client complet : applique tout. Client clairsemé : 1 message sur 3 (dont le dernier).
      let full: { seq: number; view: unknown } = { seq: 0, view: null };
      let sparse: { seq: number; view: unknown } = { seq: 0, view: null };
      const apply = (state: typeof full, st: EmittedState) =>
        st.seq > state.seq ? { seq: st.seq, view: st.view } : state;
      stream.forEach((st, i) => {
        full = apply(full, st);
        if ((stream.length - 1 - i) % 3 !== 0) return;
        sparse = apply(sparse, st);
        // À chaque message reçu, le client clairsemé affiche la même chose que le complet.
        expect(sparse.view).toEqual(full.view);
      });
      expect(sparse).toEqual(full);
      // seq strictement croissant par destinataire.
      expect(stream.every((st, i) => i === 0 || st.seq > stream[i - 1]!.seq)).toBe(true);
    }
  });

  it('emissions per question stay linear in the number of players', async () => {
    const { f } = await playFullGame();
    // 3 joueurs : par changement de phase 1 vue écran + 1 console + 1 par joueur.
    const perPhase = (phase: string, questionIndex: number) =>
      f.states.filter((st) => st.view.phase === phase && st.view.questionIndex === questionIndex);
    const reveal0 = perPhase('reveal', 0);
    expect(reveal0.filter((st) => st.audience === 'mobile')).toHaveLength(2);
    expect(reveal0.filter((st) => st.audience !== 'mobile')).toHaveLength(2);
    // Une réponse : une seule vue mobile (celle du joueur), jamais une vue par joueur.
    const q0Mobile = perPhase('question', 0).filter((st) => st.audience === 'mobile');
    expect(q0Mobile).toHaveLength(2 /* ouverture */ + 2 /* une par réponse */);
  });
});
