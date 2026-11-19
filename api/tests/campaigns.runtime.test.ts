import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { signNucJwt } from '../src/shared/auth/nuc-jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { syncGameFromQuiz } from '../src/modules/games/games.service.js';
import { deliveriesService } from '../src/modules/campaigns/deliveries.service.js';
import {
  getSessionRuntime,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { minimalCinemaAndScreen, truncateSponsorsAndQuizzes } from './helpers/integration.js';
import { answerPayload, waitForQuizQuestion } from './helpers/game-protocol.js';

/**
 * C3 dans une vraie séance : preuve de diffusion envoyée par l'écran de la salle, Delivery créée
 * à la fin de la manche, rien pour une manche passée, et une erreur du journal ne casse jamais
 * la fin de manche.
 */
describe('campaign deliveries in a live session (C3)', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let adminToken: string;
  let adminId: bigint;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateSponsorsAndQuizzes();
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
      data: { email: `c3-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminId = admin.id;
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetRunningSessionsForTests();
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await truncateSponsorsAndQuizzes();
  });

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Quiz d'une question sous campagne active (5 € par séance, 40 % au cinéma). */
  async function sponsoredSession() {
    const sponsor = await prisma.sponsor.create({
      data: { slug: `c3-sp-${Date.now()}`, name: 'Sponsor C3' },
    });
    const quiz = await prisma.quiz.create({
      data: {
        slug: `c3-quiz-${Date.now()}`,
        title: 'Quiz sponsorisé',
        status: 'published',
        createdByUserId: adminId,
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
    const game = await syncGameFromQuiz(quiz.id);
    await prisma.game.update({
      where: { id: game.id },
      data: { kind: 'sponsored', sponsorId: sponsor.id },
    });
    await prisma.campaign.create({
      data: {
        sponsorId: sponsor.id,
        gameId: game.id,
        name: 'Campagne live',
        status: 'active',
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000),
        pricing: 'per_session',
        unitPriceCents: 500,
        cinemaSharePercent: 40,
      },
    });
    const infra = await minimalCinemaAndScreen();
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    expect(res.status).toBe(201);
    const session = (await res.json()) as { id: string };
    const players = [];
    for (const pseudo of ['Ana', 'Bob', 'Cleo']) {
      players.push(
        await prisma.player.create({
          data: {
            sessionId: BigInt(session.id),
            pseudo,
            resumeToken: `c3-${pseudo}-${Math.random().toString(36).slice(2)}`,
            status: 'active',
          },
        }),
      );
    }
    return { sessionId: BigInt(session.id), screenId: infra.screenId, players };
  }

  /** Écran (NUC) authentifié et rattaché à sa salle. */
  async function connectNuc(screenId: bigint): Promise<ClientSocket> {
    const nucUid = `c3-nuc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nuc = await prisma.nuc.create({ data: { screenId, nucUid, status: 'online' } });
    const token = await signNucJwt({ nucId: nuc.id.toString(), screenId: screenId.toString() });
    const socket = ioClient(`${baseUrl}/player`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `nuc_session=${token}` },
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve, reject) => {
      socket.emit('nuc:join_screen', { nucUid }, (res: { ok?: boolean }) =>
        res?.ok ? resolve() : reject(new Error('nuc:join_screen failed')),
      );
    });
    return socket;
  }

  function roundDisplayed(socket: ClientSocket, roundId: unknown) {
    return new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socket.emit('nuc:round_displayed', { roundId }, resolve);
    });
  }

  async function connectPlayer(sessionId: bigint, player: { id: bigint; resumeToken: string }) {
    const socket = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) => {
      socket.emit(
        'player:rejoin_room',
        {
          sessionId: sessionId.toString(),
          playerId: player.id.toString(),
          resumeToken: player.resumeToken,
        },
        () => resolve(),
      );
    });
    return socket;
  }

  async function waitForState(sessionId: bigint, state: string, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await prisma.session.findUnique({ where: { id: sessionId } });
      if (row?.state === state) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`session did not reach ${state}`);
  }

  /** Lance la séance et attend l'ouverture de la question (vue par le premier joueur). */
  async function startAndOpen(sessionId: bigint, player: { id: bigint; resumeToken: string }) {
    const mobile = await connectPlayer(sessionId, player);
    const opened = waitForQuizQuestion(mobile, 0);
    expect((await post(`/sessions/${sessionId}/start`)).ok).toBe(true);
    return opened;
  }

  async function answerAll(
    sessionId: bigint,
    players: { id: bigint }[],
    q: { id: string; answers: { id: string; text: string }[] },
  ) {
    const correct = q.answers.find((a) => a.text === 'Correct')!.id;
    for (const p of players) {
      await getSessionRuntime().handleAction(sessionId, p.id, answerPayload(q.id, correct));
    }
    // Clôt la question sans attendre son échéance (révélation puis fin de manche).
    expect((await post(`/sessions/${sessionId}/force-advance`)).ok).toBe(true);
  }

  it('proof from the screen of the room, delivery recorded at the end of the round', async () => {
    const { sessionId, screenId, players } = await sponsoredSession();
    const nuc = await connectNuc(screenId);
    const other = await minimalCinemaAndScreen();
    const otherNuc = await connectNuc(other.screenId);
    const anonymous = ioClient(`${baseUrl}/player`, { transports: ['websocket'], forceNew: true });
    sockets.push(anonymous);
    await new Promise<void>((resolve) => anonymous.on('connect', resolve));

    const { roundId, question } = await startAndOpen(sessionId, players[0]!);

    // Boîtier d'une autre salle, socket non NUC, payload invalide : refusés.
    expect(await roundDisplayed(otherNuc, roundId)).toMatchObject({
      ok: false,
      code: 'ROUND_NOT_ON_SCREEN',
    });
    expect(await roundDisplayed(anonymous, roundId)).toMatchObject({
      ok: false,
      code: 'NUC_NOT_ON_SCREEN',
    });
    expect(await roundDisplayed(nuc, 'abc')).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(
      (await prisma.sessionRound.findUniqueOrThrow({ where: { id: BigInt(roundId) } }))
        .proofDisplayedAt,
    ).toBeNull();

    // Écran de la salle : preuve écrite une fois.
    expect(await roundDisplayed(nuc, roundId)).toEqual({ ok: true });
    const first = (await prisma.sessionRound.findUniqueOrThrow({ where: { id: BigInt(roundId) } }))
      .proofDisplayedAt;
    expect(first).not.toBeNull();
    expect(await roundDisplayed(nuc, roundId)).toEqual({ ok: true });
    expect(
      (await prisma.sessionRound.findUniqueOrThrow({ where: { id: BigInt(roundId) } }))
        .proofDisplayedAt,
    ).toEqual(first);

    await answerAll(sessionId, players, question);
    await waitForState(sessionId, 'ended');

    const delivery = await prisma.delivery.findUniqueOrThrow({
      where: { roundId: BigInt(roundId) },
    });
    expect(delivery).toMatchObject({
      sessionId,
      screenId,
      participants: 3,
      finishers: 3,
      billable: true,
      nonBillableReason: null,
      amountCents: 500,
      cinemaShareCents: 200,
    });
    expect(delivery.proofDisplayedAt).toEqual(first);

    // Manche terminée : plus de preuve acceptée.
    expect(await roundDisplayed(nuc, roundId)).toMatchObject({
      ok: false,
      code: 'ROUND_NOT_RUNNING',
    });
  }, 20_000);

  it('a skipped round is not a delivery', async () => {
    const { sessionId, screenId, players } = await sponsoredSession();
    const nuc = await connectNuc(screenId);
    const { roundId } = await startAndOpen(sessionId, players[0]!);
    expect(await roundDisplayed(nuc, roundId)).toEqual({ ok: true });
    expect((await post(`/sessions/${sessionId}/skip-round`)).ok).toBe(true);
    await waitForState(sessionId, 'ended');
    const round = await prisma.sessionRound.findUniqueOrThrow({ where: { id: BigInt(roundId) } });
    expect(round.state).toBe('skipped');
    expect(await prisma.delivery.count()).toBe(0);
  }, 20_000);

  it('a failure of the delivery journal never breaks the end of the round', async () => {
    vi.spyOn(deliveriesService, 'recordRoundDelivery').mockRejectedValue(new Error('boom'));
    const { sessionId, players } = await sponsoredSession();
    const { roundId, question } = await startAndOpen(sessionId, players[0]!);
    await answerAll(sessionId, players, question);
    await waitForState(sessionId, 'ended');
    const round = await prisma.sessionRound.findUniqueOrThrow({ where: { id: BigInt(roundId) } });
    expect(round.state).toBe('ended');

    const deadline = Date.now() + 5000;
    let logged = null;
    while (!logged && Date.now() < deadline) {
      logged = await prisma.eventLog.findFirst({
        where: { sessionId, eventType: 'campaign.delivery_failed' },
      });
      if (!logged) await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    expect(logged).toMatchObject({ level: 'error' });
    expect(logged!.payloadJson).toMatchObject({ roundId, message: 'boom' });
  }, 20_000);
});
