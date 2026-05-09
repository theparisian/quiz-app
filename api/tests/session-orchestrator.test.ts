import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { setIoInstance } from '../src/modules/sessions/session-orchestrator.service.js';
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
});
