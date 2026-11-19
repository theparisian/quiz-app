import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import type { RoundEndedPayload, RoundInfo } from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { syncGameFromQuiz } from '../src/modules/games/games.service.js';
import {
  getSessionRuntime,
  rehydrateRunningSessions,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import {
  answerPayload,
  type GameStateEnvelope,
  type QuizViewLike,
} from './helpers/game-protocol.js';

/**
 * Séances à plusieurs manches (B5) : enchaînement, entracte (pause, reprise), abandon,
 * « passer la manche », retardataire, redémarrage entre deux manches, contenu console par
 * manche, rapport.
 */
describe('multi-round sessions', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let adminToken: string;
  let adminId: bigint;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    const app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);
    process.env.RESULTS_DISPLAY_MS = '100';
    process.env.COUNTDOWN_MS = '50';
    process.env.ROUND_INTERLUDE_MS = '300';
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    sockets = [];
    const admin = await prisma.user.create({
      data: { email: `mr-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminId = admin.id;
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    resetRunningSessionsForTests();
    delete process.env.ROUND_INTERLUDE_MS;
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const cookie = () => `token=${adminToken}`;

  async function createQuizGame(label: string, questionCount = 1) {
    const quiz = await prisma.quiz.create({
      data: {
        slug: `mr-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: `Quiz ${label}`,
        status: 'published',
        createdByUserId: adminId,
      },
    });
    for (let i = 1; i <= questionCount; i++) {
      await prisma.question.create({
        data: {
          quizId: quiz.id,
          position: i,
          text: `${label} Q${i}?`,
          timeLimitSeconds: 10,
          pointsMax: 1000,
          pointsFloor: 500,
          answers: {
            create: [
              { position: 'A', text: 'Correct', isCorrect: true },
              { position: 'B', text: 'Wrong', isCorrect: false },
            ],
          },
        },
      });
    }
    const game = await syncGameFromQuiz(quiz.id);
    return { quiz, game };
  }

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie() },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}/api${path}`, { headers: { Cookie: cookie() } });
    expect(res.status).toBe(200);
    return (await res.json()) as T;
  }

  async function createSession(gameSlugs: string[]) {
    const infra = await minimalCinemaAndScreen();
    const res = await post('/sessions', { gameSlugs, screenId: infra.screenId.toString() });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; slugShort: string };
  }

  async function seedPlayer(sessionId: string, pseudo: string) {
    return prisma.player.create({
      data: {
        sessionId: BigInt(sessionId),
        pseudo,
        resumeToken: `mr-${pseudo}-${Math.random().toString(36).slice(2)}`,
        status: 'active',
      },
    });
  }

  interface Recorded {
    name: string;
    payload: unknown;
  }

  /** Socket mobile d'un joueur ; enregistre tous les événements reçus. */
  async function connectAs(sessionId: string, player: { id: bigint; resumeToken: string }) {
    const socket = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    const events: Recorded[] = [];
    socket.onAny((name: string, payload: unknown) => events.push({ name, payload }));
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) => {
      socket.emit(
        'player:rejoin_room',
        { sessionId, playerId: player.id.toString(), resumeToken: player.resumeToken },
        () => resolve(),
      );
    });
    return { socket, events };
  }

  async function connectConsole(sessionId: string) {
    const socket = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: cookie() },
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) =>
      socket.emit('console:join', { sessionId }, () => resolve()),
    );
    return socket;
  }

  async function until(cond: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await cond())) {
      if (Date.now() > deadline) throw new Error('until: timeout');
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
  }

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const named = <T>(events: Recorded[], name: string) =>
    events.filter((e) => e.name === name).map((e) => e.payload as T);

  /** `round:started` de la manche `position` (attendu). */
  async function roundStarted(events: Recorded[], position: number) {
    await until(() =>
      named<RoundInfo>(events, 'round:started').some((r) => r.position === position),
    );
    return named<RoundInfo>(events, 'round:started').find((r) => r.position === position)!;
  }

  async function roundEnded(events: Recorded[], position: number) {
    await until(() =>
      named<RoundEndedPayload>(events, 'round:ended').some((r) => r.position === position),
    );
    return named<RoundEndedPayload>(events, 'round:ended').find((r) => r.position === position)!;
  }

  /** Vue `question` (index) de la manche `roundId`, reçue par ce joueur. */
  async function questionOf(events: Recorded[], roundId: string, index = 0) {
    const find = () =>
      named<GameStateEnvelope<QuizViewLike>>(events, 'game:state').find(
        (e) =>
          e.roundId === roundId && e.view.phase === 'question' && e.view.questionIndex === index,
      );
    await until(() => find() !== undefined);
    const q = find()!.view.question!;
    return {
      questionId: BigInt(q.id),
      correct: BigInt(q.answers.find((a) => a.text === 'Correct')!.id),
      wrong: BigInt(q.answers.find((a) => a.text === 'Wrong')!.id),
    };
  }

  const submit = (sessionId: string, playerId: bigint, questionId: bigint, answerId: bigint) =>
    getSessionRuntime().handleAction(
      BigInt(sessionId),
      playerId,
      answerPayload(questionId, answerId),
    ) as Promise<{ timeToAnswerMs: number }>;

  async function waitForSessionState(sessionId: string, state: string) {
    await until(async () => {
      const row = await prisma.session.findUnique({ where: { id: BigInt(sessionId) } });
      return row?.state === state;
    });
  }

  async function roundsOf(sessionId: string) {
    return prisma.sessionRound.findMany({
      where: { sessionId: BigInt(sessionId) },
      orderBy: { position: 'asc' },
    });
  }

  it('create: 1 to 5 games in order, quizId of the first quiz round, duplicates refused', async () => {
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const c = await createQuizGame('C');
    const session = await createSession([c.game.slug, a.game.slug, b.game.slug]);
    const rounds = await prisma.sessionRound.findMany({
      where: { sessionId: BigInt(session.id) },
      orderBy: { position: 'asc' },
    });
    expect(rounds.map((r) => [r.position, r.gameId, r.state])).toEqual([
      [1, c.game.id, 'pending'],
      [2, a.game.id, 'pending'],
      [3, b.game.id, 'pending'],
    ]);
    const row = await prisma.session.findUniqueOrThrow({ where: { id: BigInt(session.id) } });
    expect(row.quizId).toBe(c.quiz.id);
    await post(`/sessions/${session.id}/abort`, { reason: 'test' });

    const infra = await minimalCinemaAndScreen();
    const dup = await post('/sessions', {
      gameSlugs: [a.game.slug, b.game.slug, a.game.slug],
      screenId: infra.screenId.toString(),
    });
    expect(dup.status).toBe(400);
    expect(((await dup.json()) as { error: { code: string } }).error.code).toBe('DUPLICATE_GAME');

    const extra = await Promise.all(['D', 'E', 'F'].map((l) => createQuizGame(l)));
    const six = await post('/sessions', {
      gameSlugs: [a, b, c, ...extra].map((g) => g.game.slug),
      screenId: infra.screenId.toString(),
    });
    expect(six.status).toBe(400);
  });

  it('two quiz rounds: event order, cumulated score, one session:ended, per-round console content, report', async () => {
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const session = await createSession([a.game.slug, b.game.slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const bob = await seedPlayer(session.id, 'Bob');
    const { events } = await connectAs(session.id, alice);

    // Contenu console : une entrée par manche, avec les bonnes réponses du quiz de la manche.
    const full = await get<{
      quiz: { id: string } | null;
      totalRounds: number;
      rounds: {
        roundId: string;
        position: number;
        content: { id: string; questions: { answers: { isCorrect: boolean }[] }[] } | null;
      }[];
    }>(`/sessions/${session.id}/full`);
    expect(full.totalRounds).toBe(2);
    expect(full.quiz?.id).toBe(a.quiz.id.toString());
    expect(full.rounds.map((r) => [r.position, r.content?.id])).toEqual([
      [1, a.quiz.id.toString()],
      [2, b.quiz.id.toString()],
    ]);
    expect(full.rounds[1]!.content!.questions[0]!.answers.some((x) => x.isCorrect)).toBe(true);

    expect((await post(`/sessions/${session.id}/start`)).ok).toBe(true);

    // Manche 1 : Alice juste, Bob faux.
    const r1 = await roundStarted(events, 1);
    expect(r1).toMatchObject({ position: 1, totalRounds: 2, game: { slug: a.game.slug } });
    expect(r1.roundId).toBe(full.rounds[0]!.roundId);
    const q1 = await questionOf(events, r1.roundId);
    await submit(session.id, alice.id, q1.questionId, q1.correct);
    await submit(session.id, bob.id, q1.questionId, q1.wrong);
    await post(`/sessions/${session.id}/force-advance`);
    const ended1 = await roundEnded(events, 1);

    // La dernière question de la manche a eu sa révélation avec une échéance.
    const lastReveal = named<GameStateEnvelope<QuizViewLike>>(events, 'game:state').find(
      (e) => e.roundId === r1.roundId && e.view.phase === 'reveal',
    );
    expect(lastReveal?.view.endsAt).not.toBeNull();

    // Entracte : snapshot avec le classement de la manche terminée.
    const snap = getSessionRuntime().roundSnapshot(BigInt(session.id), 'mobile', alice.id);
    expect(snap.round).toBeNull();
    expect(snap.roundEnded).toMatchObject({ position: 1, totalRounds: 2 });

    // Manche 2 : Alice et Bob justes.
    const r2 = await roundStarted(events, 2);
    expect(r2).toMatchObject({ position: 2, totalRounds: 2, game: { slug: b.game.slug } });
    const q2 = await questionOf(events, r2.roundId);
    await submit(session.id, bob.id, q2.questionId, q2.correct);
    await submit(session.id, alice.id, q2.questionId, q2.correct);
    await post(`/sessions/${session.id}/force-advance`);
    const ended2 = await roundEnded(events, 2);
    await until(() => named(events, 'session:ended').length > 0);
    await sleep(200);

    // Ordre des événements de plateforme ; un seul session:ended.
    const platform = events
      .map((e) => e.name)
      .filter((n) =>
        [
          'session:started',
          'round:started',
          'round:ended',
          'session:theme_changed',
          'session:ended',
        ].includes(n),
      );
    expect(platform).toEqual([
      'session:started',
      'round:started',
      'round:ended',
      'session:theme_changed',
      'round:started',
      'round:ended',
      'session:ended',
    ]);
    // Aucune vue de la manche 2 avant son round:started.
    const firstR2State = events.findIndex(
      (e) => e.name === 'game:state' && (e.payload as { roundId: string }).roundId === r2.roundId,
    );
    const r2Started = events.findIndex(
      (e) => e.name === 'round:started' && (e.payload as RoundInfo).position === 2,
    );
    expect(firstR2State).toBeGreaterThan(r2Started);

    // Score cumulé : Player.scoreTotal = somme des ScoreEvent = somme des scoreThisRound.
    const events1 = await prisma.scoreEvent.findMany({ where: { roundId: BigInt(r1.roundId) } });
    const events2 = await prisma.scoreEvent.findMany({ where: { roundId: BigInt(r2.roundId) } });
    for (const p of [alice, bob]) {
      const db = await prisma.player.findUniqueOrThrow({ where: { id: p.id } });
      const sum1 = events1.filter((e) => e.playerId === p.id).reduce((acc, e) => acc + e.points, 0);
      const sum2 = events2.filter((e) => e.playerId === p.id).reduce((acc, e) => acc + e.points, 0);
      const pid = p.id.toString();
      expect(ended1.scoreboard.find((x) => x.playerId === pid)?.scoreThisRound).toBe(sum1);
      expect(ended2.scoreboard.find((x) => x.playerId === pid)?.scoreThisRound).toBe(sum2);
      expect(ended2.scoreboard.find((x) => x.playerId === pid)?.scoreTotal).toBe(sum1 + sum2);
      expect(db.scoreTotal).toBe(sum1 + sum2);
    }
    expect(ended1.scoreboard.find((x) => x.playerId === bob.id.toString())?.scoreThisRound).toBe(0);
    expect(
      ended2.scoreboard.find((x) => x.playerId === bob.id.toString())!.scoreThisRound,
    ).toBeGreaterThan(0);

    const final = named<{ finalScoreboard: { playerId: string; rank: number }[] }>(
      events,
      'session:ended',
    )[0]!;
    expect(final.finalScoreboard.map((x) => x.playerId)).toEqual([
      alice.id.toString(),
      bob.id.toString(),
    ]);

    const rounds = await roundsOf(session.id);
    expect(rounds.map((r) => r.state)).toEqual(['ended', 'ended']);
    expect(rounds[1]!.startedAt!.getTime()).toBeGreaterThanOrEqual(rounds[0]!.endedAt!.getTime());

    // Rapport : manches et questions par manche.
    const report = await get<{
      rounds: { position: number; state: string; participants: number; gameTitle: string }[];
      questions: { roundPosition: number; respondents: number; eligible: number }[];
    }>(`/sessions/${session.id}/report`);
    expect(report.rounds).toEqual([
      expect.objectContaining({
        position: 1,
        state: 'ended',
        participants: 2,
        gameTitle: 'Quiz A',
      }),
      expect.objectContaining({
        position: 2,
        state: 'ended',
        participants: 2,
        gameTitle: 'Quiz B',
      }),
    ]);
    expect(report.questions.map((q) => [q.roundPosition, q.respondents, q.eligible])).toEqual([
      [1, 2, 2],
      [2, 2, 2],
    ]);
  }, 30_000);

  it('pause during the interlude freezes it; resume launches the next round', async () => {
    process.env.ROUND_INTERLUDE_MS = '500';
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const session = await createSession([a.game.slug, b.game.slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const { events } = await connectAs(session.id, alice);

    await post(`/sessions/${session.id}/start`);
    const r1 = await roundStarted(events, 1);
    await questionOf(events, r1.roundId);
    await post(`/sessions/${session.id}/force-advance`);
    await roundEnded(events, 1);

    expect((await post(`/sessions/${session.id}/pause`)).ok).toBe(true);
    await sleep(1200);
    expect(named<RoundInfo>(events, 'round:started').map((r) => r.position)).toEqual([1]);
    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual(['ended', 'pending']);

    const resumedAt = Date.now();
    expect((await post(`/sessions/${session.id}/resume`)).ok).toBe(true);
    await roundStarted(events, 2);
    expect(Date.now() - resumedAt).toBeLessThan(2000);
    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual(['ended', 'running']);

    await post(`/sessions/${session.id}/abort`, { reason: 'test' });
  }, 30_000);

  it('abort during round 1: round 1 and the following rounds are skipped', async () => {
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const session = await createSession([a.game.slug, b.game.slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const { events } = await connectAs(session.id, alice);

    await post(`/sessions/${session.id}/start`);
    const r1 = await roundStarted(events, 1);
    await questionOf(events, r1.roundId);
    expect((await post(`/sessions/${session.id}/abort`, { reason: 'test' })).ok).toBe(true);
    await sleep(700);

    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual(['skipped', 'skipped']);
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: BigInt(session.id) } })).state,
    ).toBe('aborted');
    expect(named(events, 'round:started')).toHaveLength(1);
    expect(named(events, 'session:ended')).toHaveLength(0);
    expect(getSessionRuntime().isRunning(BigInt(session.id))).toBe(false);
  }, 30_000);

  it('console:skip_round: the round is skipped, then normal chaining; during the interlude it launches the next round', async () => {
    process.env.ROUND_INTERLUDE_MS = '5000';
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const c = await createQuizGame('C');
    const session = await createSession([a.game.slug, b.game.slug, c.game.slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const { events } = await connectAs(session.id, alice);
    const consoleSocket = await connectConsole(session.id);

    await post(`/sessions/${session.id}/start`);
    const r1 = await roundStarted(events, 1);
    const q1 = await questionOf(events, r1.roundId);
    await submit(session.id, alice.id, q1.questionId, q1.correct);

    // Pendant la question : la manche passe en skipped, round:ended, entracte.
    consoleSocket.emit('console:skip_round');
    const ended1 = await roundEnded(events, 1);
    expect(ended1.scoreboard).toEqual([
      expect.objectContaining({ playerId: alice.id.toString(), scoreThisRound: 0 }),
    ]);
    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual([
      'skipped',
      'pending',
      'pending',
    ]);
    await expect(submit(session.id, alice.id, q1.questionId, q1.correct)).rejects.toMatchObject({
      code: 'NO_ACTIVE_ROUND',
    });

    // Pendant l'entracte (5 s) : la manche suivante part tout de suite.
    const skippedAt = Date.now();
    consoleSocket.emit('console:skip_round');
    await roundStarted(events, 2);
    expect(Date.now() - skippedAt).toBeLessThan(3000);
    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual([
      'skipped',
      'running',
      'pending',
    ]);

    // REST : même effet.
    const r2 = named<RoundInfo>(events, 'round:started').find((r) => r.position === 2)!;
    await questionOf(events, r2.roundId);
    expect((await post(`/sessions/${session.id}/skip-round`)).ok).toBe(true);
    await roundEnded(events, 2);
    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual([
      'skipped',
      'skipped',
      'pending',
    ]);
    expect(named(events, 'session:ended')).toHaveLength(0);

    await post(`/sessions/${session.id}/abort`, { reason: 'test' });
  }, 30_000);

  it('a player who joined during round 1 plays round 2 normally', async () => {
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const session = await createSession([a.game.slug, b.game.slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const { events } = await connectAs(session.id, alice);

    await post(`/sessions/${session.id}/start`);
    const r1 = await roundStarted(events, 1);
    const q1 = await questionOf(events, r1.roundId);

    const joinRes = await fetch(`${baseUrl}/api/players/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionSlugShort: session.slugShort, pseudo: 'Late' }),
    });
    expect(joinRes.status).toBe(201);
    const late = await prisma.player.findFirstOrThrow({
      where: { sessionId: BigInt(session.id), pseudo: 'Late' },
    });
    expect(late.joinedQuestionPosition).toBe(1);
    await expect(submit(session.id, late.id, q1.questionId, q1.correct)).rejects.toMatchObject({
      code: 'LATE_JOIN_LOCKED',
    });
    await post(`/sessions/${session.id}/force-advance`);

    const r2 = await roundStarted(events, 2);
    const q2 = await questionOf(events, r2.roundId);
    const res = await submit(session.id, late.id, q2.questionId, q2.correct);
    expect(res.timeToAnswerMs).toBeGreaterThanOrEqual(1);
    await post(`/sessions/${session.id}/force-advance`);
    await waitForSessionState(session.id, 'ended');

    const lateEvents = await prisma.scoreEvent.findMany({ where: { playerId: late.id } });
    expect(lateEvents.map((e) => e.roundId.toString())).toEqual([r2.roundId]);
    const db = await prisma.player.findUniqueOrThrow({ where: { id: late.id } });
    expect(db.scoreTotal).toBe(lateEvents[0]!.points);

    // Rapport : le retardataire de la manche 1 est éligible à la manche 2.
    const report = await get<{ questions: { roundPosition: number; eligible: number }[] }>(
      `/sessions/${session.id}/report`,
    );
    expect(report.questions.map((q) => [q.roundPosition, q.eligible])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  }, 30_000);

  it('server restart between two rounds: the next round is launched and the session ends', async () => {
    process.env.ROUND_INTERLUDE_MS = '3000';
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const session = await createSession([a.game.slug, b.game.slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const { events } = await connectAs(session.id, alice);

    await post(`/sessions/${session.id}/start`);
    const r1 = await roundStarted(events, 1);
    const q1 = await questionOf(events, r1.roundId);
    await submit(session.id, alice.id, q1.questionId, q1.correct);
    await post(`/sessions/${session.id}/force-advance`);
    await roundEnded(events, 1);

    // Redémarrage pendant l'entracte : la mémoire est perdue, la base reste.
    resetRunningSessionsForTests();
    const restartedAt = Date.now();
    await rehydrateRunningSessions();
    const r2 = await roundStarted(events, 2);
    expect(Date.now() - restartedAt).toBeLessThan(2500);

    const q2 = await questionOf(events, r2.roundId);
    await submit(session.id, alice.id, q2.questionId, q2.correct);
    await post(`/sessions/${session.id}/force-advance`);
    await waitForSessionState(session.id, 'ended');

    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual(['ended', 'ended']);
    const db = await prisma.player.findUniqueOrThrow({ where: { id: alice.id } });
    const all = await prisma.scoreEvent.findMany({ where: { sessionId: BigInt(session.id) } });
    expect(all).toHaveLength(2);
    expect(db.scoreTotal).toBe(all.reduce((acc, e) => acc + e.points, 0));
    await until(() => named(events, 'session:ended').length > 0);
    await sleep(200);
    expect(named(events, 'session:ended')).toHaveLength(1);
  }, 30_000);

  it('server restart during a paused interlude: stays paused with the round-end board, resume launches the next round', async () => {
    const a = await createQuizGame('A');
    const b = await createQuizGame('B');
    const session = await createSession([a.game.slug, b.game.slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const { events } = await connectAs(session.id, alice);

    await post(`/sessions/${session.id}/start`);
    const r1 = await roundStarted(events, 1);
    await questionOf(events, r1.roundId);
    await post(`/sessions/${session.id}/force-advance`);
    await roundEnded(events, 1);
    await post(`/sessions/${session.id}/pause`);

    resetRunningSessionsForTests();
    await rehydrateRunningSessions();
    await sleep(700);

    const sessionId = BigInt(session.id);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })).state).toBe(
      'paused',
    );
    expect((await roundsOf(session.id)).map((r) => r.state)).toEqual(['ended', 'pending']);
    expect(getSessionRuntime().roundSnapshot(sessionId, 'screen').roundEnded).toMatchObject({
      roundId: r1.roundId,
      position: 1,
      totalRounds: 2,
    });

    expect((await post(`/sessions/${session.id}/resume`)).ok).toBe(true);
    await roundStarted(events, 2);
    await post(`/sessions/${session.id}/abort`, { reason: 'test' });
  }, 30_000);
});
