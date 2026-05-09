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

function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 10_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('session-socket (integration)', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let adminToken: string;
  let sessionId: string;
  let sessionSlugShort: string;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateQuizRelatedTables();

    const app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `a-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });

    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `sq-${Date.now()}`,
        title: 'Socket Quiz',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Socket Q1?',
        timeLimitSeconds: 5,
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

    process.env.RESULTS_DISPLAY_MS = '200';
    process.env.COUNTDOWN_MS = '200';

    const cookie = `token=${adminToken}`;
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const body = (await res.json()) as { id: string; slugShort: string };
    sessionId = body.id;
    sessionSlugShort = body.slugShort;
  });

  afterEach(async () => {
    for (const s of sockets) {
      s.disconnect();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connectMobile(): ClientSocket {
    const s = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(s);
    return s;
  }

  async function joinPlayer(pseudo: string): Promise<{ socket: ClientSocket; playerId: string }> {
    const socket = connectMobile();
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    const result = await new Promise<{ playerId: string }>((resolve, reject) => {
      socket.emit('player:join', { pseudo, sessionSlugShort }, (res: unknown) => {
        const r = res as Record<string, unknown>;
        if (r.playerId) resolve(r as unknown as { playerId: string });
        else reject(new Error(JSON.stringify(r)));
      });

      socket.once('player:join_success', (data: unknown) => {
        resolve(data as { playerId: string });
      });

      setTimeout(() => reject(new Error('join timeout')), 5000);
    });

    return { socket, playerId: result.playerId };
  }

  it('player in session A does NOT receive events from session B', async () => {
    const { socket: socketA } = await joinPlayer('PlayerA');

    // Create session B
    const admin = await prisma.user.findFirst({ where: { role: 'super_admin' } });
    const infra2 = await minimalCinemaAndScreen();
    const quiz2 = await prisma.quiz.create({
      data: {
        slug: `sq2-${Date.now()}`,
        title: 'Q2',
        status: 'published',
        createdByUserId: admin!.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz2.id,
        position: 1,
        text: 'Q2?',
        timeLimitSeconds: 5,
        pointsMax: 1000,
        pointsFloor: 500,
        answers: {
          create: [
            { position: 'A', text: 'A', isCorrect: true },
            { position: 'B', text: 'B', isCorrect: false },
          ],
        },
      },
    });

    const cookie = `token=${adminToken}`;
    const res2 = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ quizSlug: quiz2.slug, screenId: infra2.screenId.toString() }),
    });
    const body2 = (await res2.json()) as { id: string; slugShort: string };

    const socketB = connectMobile();
    await new Promise<void>((resolve) => socketB.on('connect', resolve));
    await new Promise<void>((resolve, reject) => {
      socketB.emit(
        'player:join',
        { pseudo: 'PlayerB', sessionSlugShort: body2.slugShort },
        (r: unknown) => {
          const result = r as Record<string, unknown>;
          if (result.playerId) resolve();
          else reject(new Error('join B failed'));
        },
      );
      socketB.once('player:join_success', () => resolve());
      setTimeout(() => reject(new Error('join B timeout')), 5000);
    });

    // Start session B
    await fetch(`${baseUrl}/api/sessions/${body2.id}/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    // Player A should NOT receive session:started from session B
    let receivedCrossEvent = false;
    socketA.on('session:started', () => {
      receivedCrossEvent = true;
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    expect(receivedCrossEvent).toBe(false);
  });

  it('question_started payload does NOT contain isCorrect', async () => {
    await joinPlayer('Checker');

    const cookie = `token=${adminToken}`;
    const checkerSocket = sockets[0]!;

    const questionPromise = waitForEvent<Record<string, unknown>>(
      checkerSocket,
      'session:question_started',
    );

    await fetch(`${baseUrl}/api/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    const payload = await questionPromise;

    expect(payload.questionText).toBeDefined();
    expect(payload.answers).toBeDefined();

    const answers = payload.answers as {
      id: string;
      position: string;
      text: string;
      isCorrect?: boolean;
    }[];
    for (const a of answers) {
      expect(a.isCorrect).toBeUndefined();
    }
  });

  it('submit_answer increments answer_submitted_count', async () => {
    const { socket: s1 } = await joinPlayer('Sub1');
    const { socket: s2 } = await joinPlayer('Sub2');

    const cookie = `token=${adminToken}`;

    const qPromise1 = waitForEvent<{ questionId: string; answers: { id: string }[] }>(
      s1,
      'session:question_started',
    );
    const qPromise2 = waitForEvent<{ questionId: string; answers: { id: string }[] }>(
      s2,
      'session:question_started',
    );

    await fetch(`${baseUrl}/api/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    const q1 = await qPromise1;
    await qPromise2;

    const countPromise = waitForEvent<{ count: number; total: number }>(
      s2,
      'session:answer_submitted_count',
    );

    s1.emit('player:submit_answer', {
      questionId: q1.questionId,
      answerId: q1.answers[0]!.id,
    });

    const countPayload = await countPromise;
    expect(countPayload.count).toBe(1);
    expect(countPayload.total).toBe(2);
  });
});
