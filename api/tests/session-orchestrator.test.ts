import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import {
  getOrchestrator,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-orchestrator.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';

describe('session-orchestrator (integration)', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let adminToken: string;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateQuizRelatedTables();

    const app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);

    process.env.RESULTS_DISPLAY_MS = '100';
    process.env.COUNTDOWN_MS = '100';

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `orch-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    resetRunningSessionsForTests();
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connectMobile(): ClientSocket {
    const s = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(s);
    return s;
  }

  async function createSessionWith3Questions() {
    const admin = (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!;
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `oq-${Date.now()}`,
        title: 'Orchestrator Quiz',
        status: 'published',
        createdByUserId: admin.id,
      },
    });

    for (let i = 1; i <= 3; i++) {
      await prisma.question.create({
        data: {
          quizId: quiz.id,
          position: i,
          text: `Question ${i}?`,
          timeLimitSeconds: 2,
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

    const cookie = `token=${adminToken}`;
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    return (await res.json()) as { id: string; slugShort: string };
  }

  it('full cycle: create → start → 3 questions → ended with ranks', async () => {
    const session = await createSessionWith3Questions();

    const socket = connectMobile();
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        'player:join',
        { pseudo: 'Tester', sessionSlugShort: session.slugShort },
        (r: unknown) => {
          const result = r as Record<string, unknown>;
          if (result.playerId) resolve();
          else reject(new Error('join failed'));
        },
      );
      socket.once('player:join_success', () => resolve());
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    const cookie = `token=${adminToken}`;

    const endedPromise = new Promise<{
      finalScoreboard: { playerId: string; pseudo: string; scoreTotal: number; rank: number }[];
      winnerPlayerId: string | null;
    }>((resolve) => {
      socket.on('session:ended', (data: unknown) => {
        resolve(
          data as {
            finalScoreboard: {
              playerId: string;
              pseudo: string;
              scoreTotal: number;
              rank: number;
            }[];
            winnerPlayerId: string | null;
          },
        );
      });
    });

    await fetch(`${baseUrl}/api/sessions/${session.id}/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    // Wait for the session to end (3 questions × (2s time limit + 0.5s tolerance + 0.1s results display))
    const result = await Promise.race([
      endedPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('session did not end in time')), 30_000),
      ),
    ]);

    expect(result.finalScoreboard).toBeDefined();
    expect(result.finalScoreboard.length).toBe(1);
    expect(result.finalScoreboard[0]!.pseudo).toBe('Tester');
    expect(result.finalScoreboard[0]!.rank).toBe(1);

    const dbSession = await prisma.session.findUnique({ where: { id: BigInt(session.id) } });
    expect(dbSession?.state).toBe('ended');
    expect(dbSession?.endedAt).toBeTruthy();

    const player = await prisma.player.findFirst({ where: { sessionId: BigInt(session.id) } });
    expect(player?.rankFinal).toBe(1);
  }, 60_000);

  it('abort during question → cleanup and broadcast', async () => {
    const session = await createSessionWith3Questions();

    const socket = connectMobile();
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve, reject) => {
      socket.emit(
        'player:join',
        { pseudo: 'AbortTest', sessionSlugShort: session.slugShort },
        (r: unknown) => {
          const result = r as Record<string, unknown>;
          if (result.playerId) resolve();
          else reject(new Error('join failed'));
        },
      );
      socket.once('player:join_success', () => resolve());
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    const abortedPromise = new Promise<{ reason: string | null }>((resolve) => {
      socket.on('session:aborted', (data: unknown) => {
        resolve(data as { reason: string | null });
      });
    });

    const cookie = `token=${adminToken}`;
    await fetch(`${baseUrl}/api/sessions/${session.id}/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    await fetch(`${baseUrl}/api/sessions/${session.id}/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reason: 'test abort' }),
    });

    const result = await Promise.race([
      abortedPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('abort not received')), 5000),
      ),
    ]);

    expect(result.reason).toBe('test abort');

    const dbSession = await prisma.session.findUnique({ where: { id: BigInt(session.id) } });
    expect(dbSession?.state).toBe('aborted');
  }, 30_000);
  async function seedPlayers(sessionId: string, count: number) {
    const players = [];
    for (let i = 0; i < count; i++) {
      players.push(
        await prisma.player.create({
          data: {
            sessionId: BigInt(sessionId),
            pseudo: `P${i}`,
            resumeToken: `rt-${sessionId}-${i}-${Math.random().toString(36).slice(2)}`,
            status: 'active',
          },
        }),
      );
    }
    return players;
  }

  /** Socket mobile du premier joueur, dans la room de la session, pour écouter les diffusions. */
  async function listenAs(sessionId: string, player: { id: bigint; resumeToken: string }) {
    const socket = connectMobile();
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

  async function startAndWaitFirstQuestion(sessionId: string, socket: ClientSocket) {
    const started = new Promise<{ questionId: string; answers: { id: string; text: string }[] }>(
      (resolve) => {
        socket.once('session:question_started', (data: unknown) =>
          resolve(data as { questionId: string; answers: { id: string; text: string }[] }),
        );
      },
    );
    await fetch(`${baseUrl}/api/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: { Cookie: `token=${adminToken}` },
    });
    return Promise.race([
      started,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('question not started')), 5000),
      ),
    ]);
  }

  it('double submit by the same player: only the first answer is kept', async () => {
    const session = await createSessionWith3Questions();
    const [player] = await seedPlayers(session.id, 1);
    const socket = await listenAs(session.id, player!);
    const q = await startAndWaitFirstQuestion(session.id, socket);

    const [first, second] = q.answers;
    const orch = getOrchestrator();
    const results = await Promise.allSettled([
      orch.submitAnswer({
        sessionId: BigInt(session.id),
        playerId: player!.id,
        questionId: BigInt(q.questionId),
        answerId: BigInt(first!.id),
      }),
      orch.submitAnswer({
        sessionId: BigInt(session.id),
        playerId: player!.id,
        questionId: BigInt(q.questionId),
        answerId: BigInt(second!.id),
      }),
    ]);

    expect(results[0]!.status).toBe('fulfilled');
    expect(results[1]!.status).toBe('rejected');
    const reason = (results[1] as PromiseRejectedResult).reason as { code?: string };
    expect(reason.code).toBe('ALREADY_ANSWERED');

    const row = await prisma.playerAnswer.findUnique({
      where: { playerId_questionId: { playerId: player!.id, questionId: BigInt(q.questionId) } },
    });
    expect(row?.chosenAnswerId).toBe(BigInt(first!.id));
  }, 20_000);

  it('rejects answers while paused with SESSION_PAUSED, accepts them after resume', async () => {
    const session = await createSessionWith3Questions();
    const [player] = await seedPlayers(session.id, 1);
    const socket = await listenAs(session.id, player!);
    const q = await startAndWaitFirstQuestion(session.id, socket);
    const cookie = `token=${adminToken}`;

    const pauseRes = await fetch(`${baseUrl}/api/sessions/${session.id}/pause`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(pauseRes.ok).toBe(true);

    const input = {
      sessionId: BigInt(session.id),
      playerId: player!.id,
      questionId: BigInt(q.questionId),
      answerId: BigInt(q.answers[0]!.id),
    };
    await expect(getOrchestrator().submitAnswer(input)).rejects.toMatchObject({
      code: 'SESSION_PAUSED',
    });

    const resumeRes = await fetch(`${baseUrl}/api/sessions/${session.id}/resume`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(resumeRes.ok).toBe(true);

    const res = await getOrchestrator().submitAnswer(input);
    expect(res.timeToAnswerMs).toBeGreaterThanOrEqual(1);

    const row = await prisma.playerAnswer.findUnique({
      where: { playerId_questionId: { playerId: player!.id, questionId: BigInt(q.questionId) } },
    });
    expect(row?.chosenAnswerId).toBe(BigInt(q.answers[0]!.id));
  }, 20_000);

  it('batches answer_submitted_count: fewer than 20 events, last one before question_ended is 20', async () => {
    const session = await createSessionWith3Questions();
    const players = await seedPlayers(session.id, 20);
    const socket = await listenAs(session.id, players[0]!);

    const counts: number[] = [];
    let countBeforeEnd: number | null = null;
    socket.on('session:answer_submitted_count', (data: { count: number }) => {
      counts.push(data.count);
    });
    const ended = new Promise<void>((resolve) => {
      socket.once('session:question_ended', () => {
        countBeforeEnd = counts.at(-1) ?? null;
        resolve();
      });
    });

    const q = await startAndWaitFirstQuestion(session.id, socket);

    await Promise.all(
      players.map((p, i) =>
        getOrchestrator().submitAnswer({
          sessionId: BigInt(session.id),
          playerId: p.id,
          questionId: BigInt(q.questionId),
          answerId: BigInt(q.answers[i % 2]!.id),
        }),
      ),
    );

    await Promise.race([
      ended,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('question did not end')), 10_000),
      ),
    ]);

    expect(counts.length).toBeGreaterThan(0);
    expect(counts.length).toBeLessThan(20);
    expect(countBeforeEnd).toBe(20);
  }, 30_000);
});
