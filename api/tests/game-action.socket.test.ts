import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import {
  gameStateSchema,
  quizMobileViewSchema,
  roundEndedSchema,
  roundInfoSchema,
} from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import {
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import {
  answerPayload,
  sendGameAction,
  waitForGameState,
  waitForQuizQuestion,
  type GameStateEnvelope,
} from './helpers/game-protocol.js';

/** Protocole de manche côté serveur : game:action, rooms joueur, round:started / round:ended. */
describe('game protocol (socket)', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let adminToken: string;
  let sockets: ClientSocket[];
  let session: { id: string; slugShort: string };

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    const app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);
    process.env.COUNTDOWN_MS = '50';
    process.env.RESULTS_DISPLAY_MS = '100';
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `gp-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `gp-${Date.now()}`,
        title: 'Protocol Quiz',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q1?',
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
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    session = (await res.json()) as { id: string; slugShort: string };
  });

  afterEach(async () => {
    resetRunningSessionsForTests();
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function joinPlayer(pseudo: string) {
    const socket = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    const join = await new Promise<{ playerId: string }>((resolve, reject) => {
      socket.emit('player:join', { pseudo, sessionSlugShort: session.slugShort }, (r: unknown) => {
        const o = r as { playerId?: string };
        if (o.playerId) resolve(o as { playerId: string });
        else reject(new Error(JSON.stringify(r)));
      });
    });
    return { socket, playerId: join.playerId };
  }

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}/api/sessions/${session.id}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function startAndOpen(socket: ClientSocket) {
    const opened = waitForQuizQuestion(socket, 0);
    expect((await post('/start')).ok).toBe(true);
    const q = await opened;
    const correct = q.question.answers.find((a) => a.text === 'Correct')!;
    const wrong = q.question.answers.find((a) => a.text === 'Wrong')!;
    return { ...q, correct, wrong };
  }

  it('double action: the first answer wins, the second gets ALREADY_ANSWERED', async () => {
    const { socket, playerId } = await joinPlayer('Double');
    const q = await startAndOpen(socket);

    const [a, b] = await Promise.all([
      sendGameAction(socket, { roundId: q.roundId, ...answerPayload(q.question.id, q.correct.id) }),
      sendGameAction(socket, { roundId: q.roundId, ...answerPayload(q.question.id, q.wrong.id) }),
    ]);
    expect(a).toMatchObject({ ok: true, result: { timeToAnswerMs: expect.any(Number) } });
    expect(b).toMatchObject({ ok: false, code: 'ALREADY_ANSWERED' });

    const row = await prisma.playerAnswer.findUnique({
      where: {
        playerId_questionId: { playerId: BigInt(playerId), questionId: BigInt(q.question.id) },
      },
    });
    expect(row?.chosenAnswerId).toBe(BigInt(q.correct.id));
    await post('/abort', { reason: 'test' });
  });

  it('action during pause: SESSION_PAUSED, accepted after resume', async () => {
    const { socket } = await joinPlayer('Pauser');
    const q = await startAndOpen(socket);
    expect((await post('/pause')).ok).toBe(true);

    const action = { roundId: q.roundId, ...answerPayload(q.question.id, q.correct.id) };
    expect(await sendGameAction(socket, action)).toMatchObject({
      ok: false,
      code: 'SESSION_PAUSED',
    });
    expect((await post('/resume')).ok).toBe(true);
    expect(await sendGameAction(socket, action)).toMatchObject({ ok: true });
    await post('/abort', { reason: 'test' });
  });

  it('action on a wrong round, malformed, unknown type, or before joining is refused', async () => {
    const { socket } = await joinPlayer('Wrong');
    const q = await startAndOpen(socket);
    const answer = answerPayload(q.question.id, q.correct.id);

    expect(
      await sendGameAction(socket, { roundId: (BigInt(q.roundId) + 1n).toString(), ...answer }),
    ).toMatchObject({ ok: false, code: 'WRONG_ROUND' });
    expect(await sendGameAction(socket, { roundId: 'abc', ...answer })).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
    });
    expect(
      await sendGameAction(socket, { roundId: q.roundId, type: 'vote', payload: {} }),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_ACTION' });

    const stranger = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'], forceNew: true });
    sockets.push(stranger);
    await new Promise<void>((resolve) => stranger.on('connect', resolve));
    expect(await sendGameAction(stranger, { roundId: q.roundId, ...answer })).toMatchObject({
      ok: false,
      code: 'NOT_JOINED',
    });

    // La bonne manche est toujours acceptée ensuite.
    expect(await sendGameAction(socket, { roundId: q.roundId, ...answer })).toMatchObject({
      ok: true,
    });
    await post('/abort', { reason: 'test' });
  });

  it('rate limit: at most 20 actions per second per socket', async () => {
    const { socket } = await joinPlayer('Spammer');
    const q = await startAndOpen(socket);
    const acks = await Promise.all(
      Array.from({ length: 25 }, () =>
        sendGameAction(socket, { roundId: q.roundId, type: 'vote', payload: {} }),
      ),
    );
    const limited = acks.filter((a) => !a.ok && a.code === 'RATE_LIMITED');
    expect(limited).toHaveLength(5);
    await post('/abort', { reason: 'test' });
  });

  it('a player view goes to that player only; round:started and round:ended frame the round', async () => {
    const alice = await joinPlayer('Alice');
    const bob = await joinPlayer('Bob');

    const roundStarted = new Promise<unknown>((resolve) =>
      alice.socket.once('round:started', resolve),
    );
    const roundEnded = new Promise<unknown>((resolve) => alice.socket.once('round:ended', resolve));
    const bobStates: GameStateEnvelope[] = [];
    bob.socket.on('game:state', (env: GameStateEnvelope) => bobStates.push(env));

    const bobOpened = waitForQuizQuestion(bob.socket, 0);
    const q = await startAndOpen(alice.socket);
    await bobOpened;
    const info = roundInfoSchema.parse(await roundStarted);
    expect(info).toMatchObject({
      roundId: q.roundId,
      position: 1,
      totalRounds: 1,
      engineKey: 'quiz',
      game: { kind: 'internal', sponsor: null },
    });

    const before = bobStates.length;
    const aliceView = waitForGameState(alice.socket, (v) => v.me?.answerId === q.correct.id);
    const ack = await sendGameAction(alice.socket, {
      roundId: q.roundId,
      ...answerPayload(q.question.id, q.correct.id),
    });
    expect(ack.ok).toBe(true);
    const env = await aliceView;
    expect(gameStateSchema.safeParse(env).success).toBe(true);
    expect(quizMobileViewSchema.safeParse(env.view).success).toBe(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    // Bob ne reçoit rien de la réponse d'Alice (ni vue, ni compteur).
    expect(bobStates.length).toBe(before);

    // Console : clôture forcée via console:force_advance, puis fin de manche.
    const consoleSocket = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: `token=${adminToken}` },
    });
    sockets.push(consoleSocket);
    await new Promise<void>((resolve) => consoleSocket.on('connect', resolve));
    await new Promise<void>((resolve) =>
      consoleSocket.emit('console:join', { sessionId: session.id }, () => resolve()),
    );
    consoleSocket.emit('console:force_advance');

    const ended = roundEndedSchema.parse(await roundEnded);
    expect(ended).toMatchObject({ roundId: q.roundId, position: 1, totalRounds: 1 });
    expect(ended.scoreboard[0]).toMatchObject({ playerId: alice.playerId, pseudo: 'Alice' });
    expect(ended.scoreboard[0]!.scoreThisRound).toBe(ended.scoreboard[0]!.scoreTotal);
    expect(ended.scoreboard[0]!.scoreThisRound).toBeGreaterThan(0);
    expect(ended.scoreboard[1]).toMatchObject({ playerId: bob.playerId, scoreThisRound: 0 });
  });
});
