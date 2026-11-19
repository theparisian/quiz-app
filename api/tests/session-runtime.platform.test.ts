import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import {
  getSessionRuntime,
  rehydrateRunningSessions,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import { answerPayload, waitForQuizQuestion } from './helpers/game-protocol.js';

/** Plateforme : manche créée à la volée, participants, joueurs retirés, reprise, redémarrage. */
describe('session-runtime platform', () => {
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
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    sockets = [];
    const admin = await prisma.user.create({
      data: { email: `rt-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminId = admin.id;
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    resetRunningSessionsForTests();
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const cookie = () => `token=${adminToken}`;

  async function createQuiz(questionCount: number, timeLimitSeconds: number) {
    const quiz = await prisma.quiz.create({
      data: {
        slug: `rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: 'Runtime Quiz',
        status: 'published',
        createdByUserId: adminId,
      },
    });
    for (let i = 1; i <= questionCount; i++) {
      await prisma.question.create({
        data: {
          quizId: quiz.id,
          position: i,
          text: `Q${i}?`,
          timeLimitSeconds,
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
    return quiz;
  }

  async function createSession(questionCount: number, timeLimitSeconds: number) {
    const quiz = await createQuiz(questionCount, timeLimitSeconds);
    const infra = await minimalCinemaAndScreen();
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie() },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    return (await res.json()) as { id: string; slugShort: string };
  }

  async function seedPlayer(sessionId: string, pseudo: string) {
    return prisma.player.create({
      data: {
        sessionId: BigInt(sessionId),
        pseudo,
        resumeToken: `rt-${pseudo}-${Math.random().toString(36).slice(2)}`,
        status: 'active',
      },
    });
  }

  async function connectAs(sessionId: string, player: { id: bigint; resumeToken: string }) {
    const socket = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) => {
      socket.emit(
        'player:rejoin_room',
        { sessionId, playerId: player.id.toString(), resumeToken: player.resumeToken },
        () => resolve(),
      );
    });
    return socket;
  }

  function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${event} timeout`)), timeoutMs);
      socket.once(event, (data: T) => {
        clearTimeout(t);
        resolve(data);
      });
    });
  }

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie() },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function waitForState(sessionId: string, state: string, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await prisma.session.findUnique({ where: { id: BigInt(sessionId) } });
      if (row?.state === state) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`session did not reach ${state}`);
  }

  type QuestionStarted = { questionId: string; answers: { id: string; text: string }[] };
  const correctOf = (q: QuestionStarted) => BigInt(q.answers.find((a) => a.text === 'Correct')!.id);
  /** Ouverture de la question `index` vue par ce joueur (protocole game:state). */
  const questionOpened = (socket: ClientSocket, index = 0) =>
    waitForQuizQuestion(socket, index).then(
      ({ question }): QuestionStarted & { position: number } => ({
        questionId: question.id,
        answers: question.answers,
        position: question.position,
      }),
    );
  const submit = (input: {
    sessionId: bigint;
    playerId: bigint;
    questionId: bigint;
    answerId: bigint;
  }) =>
    getSessionRuntime().handleAction(
      input.sessionId,
      input.playerId,
      answerPayload(input.questionId, input.answerId),
    ) as Promise<{ timeToAnswerMs: number }>;

  it('session without round: round 1 created at start; participants persisted under the platform key', async () => {
    const quiz = await createQuiz(1, 1);
    const infra = await minimalCinemaAndScreen();
    // Créée hors de sessionsService.create : aucune ligne session_rounds.
    const session = await prisma.session.create({
      data: { slugShort: '4321', quizId: quiz.id, screenId: infra.screenId },
    });
    const sessionId = session.id.toString();
    const answering = await seedPlayer(sessionId, 'Answering');
    await seedPlayer(sessionId, 'Silent');
    const socket = await connectAs(sessionId, answering);
    expect(await prisma.sessionRound.count({ where: { sessionId: session.id } })).toBe(0);

    const started = questionOpened(socket);
    expect((await post(`/sessions/${sessionId}/start`)).ok).toBe(true);
    const q = await started;

    const round = await prisma.sessionRound.findFirstOrThrow({
      where: { sessionId: session.id },
      include: { game: true },
    });
    expect(round.position).toBe(1);
    expect(round.state).toBe('running');
    expect(round.game.quizId).toBe(quiz.id);

    await submit({
      sessionId: session.id,
      playerId: answering.id,
      questionId: BigInt(q.questionId),
      answerId: correctOf(q),
    });
    await waitForState(sessionId, 'ended');

    const ended = await prisma.sessionRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(ended.state).toBe('ended');
    expect(ended.stateJson).toMatchObject({
      platform: { participants: [answering.id.toString()] },
      engine: { phase: 'done' },
    });
  }, 20_000);

  it('left and kicked players cannot act; player:resume brings back a left player, not a kicked one', async () => {
    const session = await createSession(1, 10);
    const sessionId = BigInt(session.id);
    const listener = await seedPlayer(session.id, 'Listener');
    const kicked = await seedPlayer(session.id, 'Kicked');
    const listenerSocket = await connectAs(session.id, listener);
    const kickedSocket = await connectAs(session.id, kicked);

    // Joueur parti au lobby.
    const leaver = await seedPlayer(session.id, 'Leaver');
    const leaverSocket = await connectAs(session.id, leaver);
    leaverSocket.emit('player:leave');
    const deadline = Date.now() + 5000;
    while (
      (await prisma.player.findUniqueOrThrow({ where: { id: leaver.id } })).status === 'active'
    ) {
      if (Date.now() > deadline) throw new Error('leave not applied');
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }

    const started = questionOpened(listenerSocket);
    await post(`/sessions/${session.id}/start`);
    const q = await started;
    const input = (playerId: bigint) => ({
      sessionId,
      playerId,
      questionId: BigInt(q.questionId),
      answerId: correctOf(q),
    });

    await expect(submit(input(leaver.id))).rejects.toMatchObject({
      code: 'PLAYER_NOT_IN_SESSION',
    });

    expect((await post(`/players/${kicked.id}/kick`)).ok).toBe(true);
    await expect(submit(input(kicked.id))).rejects.toMatchObject({
      code: 'PLAYER_NOT_IN_SESSION',
    });

    // Reprise du joueur parti : il revient dans la partie et peut répondre (convention 8).
    const snapshot = nextEvent(leaverSocket, 'session:state_snapshot');
    leaverSocket.emit('player:resume', { resumeToken: leaver.resumeToken, sessionId: session.id });
    await snapshot;
    const res = await submit(input(leaver.id));
    expect(res.timeToAnswerMs).toBeGreaterThanOrEqual(1);

    // Un joueur exclu ne revient pas.
    const refused = nextEvent<{ code: string }>(kickedSocket, 'error');
    kickedSocket.emit('player:resume', { resumeToken: kicked.resumeToken, sessionId: session.id });
    expect((await refused).code).toBe('PLAYER_KICKED');
    expect((await prisma.player.findUniqueOrThrow({ where: { id: kicked.id } })).status).toBe(
      'kicked',
    );
    await expect(submit(input(kicked.id))).rejects.toMatchObject({
      code: 'PLAYER_NOT_IN_SESSION',
    });

    await post(`/sessions/${session.id}/abort`, { reason: 'test' });
  }, 30_000);

  it('server restart during a question: the question is closed and scored, the session ends', async () => {
    const session = await createSession(1, 10);
    const sessionId = BigInt(session.id);
    const player = await seedPlayer(session.id, 'Restart');
    const socket = await connectAs(session.id, player);

    const started = questionOpened(socket);
    await post(`/sessions/${session.id}/start`);
    const q = await started;
    await submit({
      sessionId,
      playerId: player.id,
      questionId: BigInt(q.questionId),
      answerId: correctOf(q),
    });

    // Redémarrage : la mémoire est perdue, la base reste.
    resetRunningSessionsForTests();
    expect(getSessionRuntime().isRunning(sessionId)).toBe(false);
    await rehydrateRunningSessions();
    await waitForState(session.id, 'ended');

    const db = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    const events = await prisma.scoreEvent.findMany({ where: { sessionId } });
    expect(db.scoreTotal).toBeGreaterThan(0);
    expect(events.reduce((acc, e) => acc + e.points, 0)).toBe(db.scoreTotal);
    expect((await prisma.sessionRound.findFirstOrThrow({ where: { sessionId } })).state).toBe(
      'ended',
    );
  }, 30_000);

  it('server restart of a paused session: stays paused, continues after resume', async () => {
    const session = await createSession(2, 10);
    const sessionId = BigInt(session.id);
    const player = await seedPlayer(session.id, 'Paused');
    const socket = await connectAs(session.id, player);

    const started = questionOpened(socket);
    await post(`/sessions/${session.id}/start`);
    await started;
    expect((await post(`/sessions/${session.id}/pause`)).ok).toBe(true);

    resetRunningSessionsForTests();
    await rehydrateRunningSessions();

    expect((await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })).state).toBe(
      'paused',
    );
    const round = await prisma.sessionRound.findFirstOrThrow({ where: { sessionId } });
    expect(round.stateJson).toMatchObject({ engine: { phase: 'results', questionIndex: 0 } });

    const second = questionOpened(socket, 1);
    expect((await post(`/sessions/${session.id}/resume`)).ok).toBe(true);
    expect((await second).position).toBe(2);

    await post(`/sessions/${session.id}/abort`, { reason: 'test' });
  }, 30_000);
});
