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
import {
  resetLobbyTimersForTests,
  setLobbyTimerIo,
} from '../src/modules/sessions/lobby-timer.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';

describe('late-join', () => {
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
    setLobbyTimerIo(io);
    app.set('io', io);

    process.env.RESULTS_DISPLAY_MS = '200';
    process.env.COUNTDOWN_MS = '50';

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `lj-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    resetRunningSessionsForTests();
    resetLobbyTimersForTests();
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function waitForSessionEnded(sessionId: string, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await prisma.session.findUnique({ where: { id: BigInt(sessionId) } });
      if (row?.state === 'ended') return;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('session did not end');
  }

  function connectMobile(): ClientSocket {
    const s = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(s);
    return s;
  }

  async function createSessionWith2Questions() {
    const admin = (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!;
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `ljq-${Date.now()}`,
        title: 'Late Join Quiz',
        status: 'published',
        createdByUserId: admin.id,
      },
    });

    for (let i = 1; i <= 2; i++) {
      const q = await prisma.question.create({
        data: {
          quizId: quiz.id,
          position: i,
          text: `Question ${i}?`,
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
      if (i === 1) {
        await prisma.answer.findFirst({ where: { questionId: q.id, isCorrect: true } });
      }
    }

    const cookie = `token=${adminToken}`;
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const session = (await res.json()) as { id: string; slugShort: string };

    await requestJoin(session.slugShort, 'LobbyPlayer');

    await fetch(`${baseUrl}/api/sessions/${session.id}/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    return session;
  }

  async function requestJoin(slugShort: string, pseudo: string) {
    const res = await fetch(`${baseUrl}/api/players/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionSlugShort: slugShort, pseudo }),
    });
    return res.json();
  }

  it('allows join in running with joinedQuestionPosition', async () => {
    const session = await createSessionWith2Questions();

    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const res = await fetch(`${baseUrl}/api/players/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionSlugShort: session.slugShort, pseudo: 'LatePlayer' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      player: { joinedQuestionPosition: number | null };
      stateSnapshot: { canAnswerCurrentQuestion: boolean };
    };
    expect(body.player.joinedQuestionPosition).toBe(1);
    expect(body.stateSnapshot.canAnswerCurrentQuestion).toBe(false);

    const player = await prisma.player.findFirst({ where: { pseudo: 'LatePlayer' } });
    expect(player?.joinedQuestionPosition).toBe(1);
  });

  it('rejects join when session ended with SESSION_FINISHED', async () => {
    const session = await createSessionWith2Questions();
    await prisma.session.update({
      where: { id: BigInt(session.id) },
      data: { state: 'ended', endedAt: new Date() },
    });

    const res = await fetch(`${baseUrl}/api/players/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionSlugShort: session.slugShort, pseudo: 'TooLate' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SESSION_FINISHED');
  });

  it('rejects join when session aborted with SESSION_FINISHED', async () => {
    const admin = (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!;
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `ab-${Date.now()}`,
        title: 'Ab',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    const cookie = `token=${adminToken}`;
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const session = (await res.json()) as { slugShort: string; id: string };
    await prisma.session.update({
      where: { id: BigInt(session.id) },
      data: { state: 'aborted', endedAt: new Date() },
    });

    const joinRes = await fetch(`${baseUrl}/api/players/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionSlugShort: session.slugShort, pseudo: 'TooLate' }),
    });
    expect(joinRes.status).toBe(409);
    const body = (await joinRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SESSION_FINISHED');
  });

  it('blocks late-joiner from answering current question', async () => {
    const session = await createSessionWith2Questions();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const joinBody = (await requestJoin(session.slugShort, 'LateBlock')) as {
      player: { id: string };
      resumeToken: string;
    };

    const q1 = await prisma.question.findFirst({
      where: {
        quiz: { sessions: { some: { id: BigInt(session.id) } } },
        position: 1,
      },
      include: { answers: true },
    });
    const correct = q1!.answers.find((a) => a.isCorrect)!;

    const socket = connectMobile();
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    await new Promise<void>((resolve) => {
      socket.emit(
        'player:rejoin_room',
        {
          sessionId: session.id,
          playerId: joinBody.player.id,
          resumeToken: joinBody.resumeToken,
        },
        () => resolve(),
      );
    });

    const errorPromise = new Promise<{ code: string }>((resolve) => {
      socket.on('error', (data: { code: string }) => resolve(data));
    });

    socket.emit('player:submit_answer', {
      questionId: q1!.id.toString(),
      answerId: correct.id.toString(),
    });

    const err = await Promise.race([
      errorPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    expect(err.code).toBe('LATE_JOIN_LOCKED');
  }, 15_000);

  it('allows late-joiner to answer next question', async () => {
    const session = await createSessionWith2Questions();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    const joinBody = (await requestJoin(session.slugShort, 'LateNext')) as {
      player: { id: string };
      resumeToken: string;
    };

    const socket = connectMobile();
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) => {
      socket.emit(
        'player:rejoin_room',
        {
          sessionId: session.id,
          playerId: joinBody.player.id,
          resumeToken: joinBody.resumeToken,
        },
        () => resolve(),
      );
    });

    await new Promise<void>((resolve) => {
      socket.on('session:question_started', () => resolve());
    });

    const q2 = await prisma.question.findFirst({
      where: {
        quiz: { sessions: { some: { id: BigInt(session.id) } } },
        position: 2,
      },
      include: { answers: true },
    });
    const correct = q2!.answers.find((a) => a.isCorrect)!;

    await getOrchestrator().submitAnswer({
      sessionId: BigInt(session.id),
      playerId: BigInt(joinBody.player.id),
      questionId: q2!.id,
      answerId: correct.id,
    });

    const answer = await prisma.playerAnswer.findUnique({
      where: {
        playerId_questionId: {
          playerId: BigInt(joinBody.player.id),
          questionId: q2!.id,
        },
      },
    });
    expect(answer?.chosenAnswerId).toBe(correct.id);
  }, 20_000);

  it('final ranking includes late-joiner with score 0 on missed questions', async () => {
    const session = await createSessionWith2Questions();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    await requestJoin(session.slugShort, 'LateFinal');

    await waitForSessionEnded(session.id);

    const players = await prisma.player.findMany({
      where: { sessionId: BigInt(session.id), status: 'active' },
      orderBy: { rankFinal: 'asc' },
    });
    const late = players.find((p) => p.pseudo === 'LateFinal');
    expect(late?.scoreTotal).toBe(0);
    expect(late?.rankFinal).not.toBeNull();
  }, 30_000);
});
