import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import {
  BURGER_SCORE_REASON,
  burgerConsoleViewSchema,
  burgerMobileViewSchema,
  type BurgerMobileView,
  type BurgerScreenView,
  type RoundEndedPayload,
  type RoundInfo,
} from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { BURGER_RECIPE } from '../src/modules/games/engines/burger/burger.engine.js';
import {
  getSessionRuntime,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import { sendGameAction, type GameStateEnvelope } from './helpers/game-protocol.js';

/**
 * Moteur burger dans une vraie séance : création par l'API, course par les sockets, points en
 * base, recette absente des vues avant les résultats.
 */
describe('burger engine in a session', () => {
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
    process.env.ROUND_INTERLUDE_MS = '200';
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    sockets = [];
    const admin = await prisma.user.create({
      data: { email: `sp-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
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

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie() },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Jeu burger créé et publié par l'API REST (course de 30 s, compte à rebours 3 s). */
  async function createBurgerGame(): Promise<string> {
    const invalid = await post('/games', {
      engineKey: 'burger',
      title: 'Burger invalide',
      configJson: { durationSeconds: 1 },
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'BURGER_CONFIG_INVALID' } });

    const res = await post('/games', {
      engineKey: 'burger',
      title: 'Burger express',
      configJson: { countdownSeconds: 3, durationSeconds: 30, resultsSeconds: 3 },
    });
    expect(res.status).toBe(201);
    const game = (await res.json()) as { slug: string; durationEstimateSeconds: number };
    expect(game.durationEstimateSeconds).toBe(36);
    expect((await post(`/games/${game.slug}/publish`)).status).toBe(200);
    return game.slug;
  }

  async function createSession(gameSlugs: string[]) {
    const infra = await minimalCinemaAndScreen();
    const res = await post('/sessions', { gameSlugs, screenId: infra.screenId.toString() });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string };
  }

  async function seedPlayer(sessionId: string, pseudo: string) {
    return prisma.player.create({
      data: {
        sessionId: BigInt(sessionId),
        pseudo,
        resumeToken: `sp-${pseudo}-${Math.random().toString(36).slice(2)}`,
        status: 'active',
      },
    });
  }

  interface Recorded {
    name: string;
    payload: unknown;
  }

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
    const events: Recorded[] = [];
    socket.onAny((name: string, payload: unknown) => events.push({ name, payload }));
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) =>
      socket.emit('console:join', { sessionId }, () => resolve()),
    );
    return { socket, events };
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

  /** Dernière vue reçue pour cette manche qui satisfait `pred`. */
  async function viewOf<V extends { phase: string }>(
    events: Recorded[],
    roundId: string,
    pred: (v: V) => boolean,
  ): Promise<V> {
    const find = () =>
      named<GameStateEnvelope<V>>(events, 'game:state')
        .filter((e) => e.roundId === roundId && pred(e.view))
        .at(-1);
    await until(() => find() !== undefined);
    return find()!.view;
  }

  it('race end to end: socket actions, early end when all finished, points, no recipe before results', async () => {
    const slug = await createBurgerGame();
    const session = await createSession([slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const bob = await seedPlayer(session.id, 'Bob');
    const a = await connectAs(session.id, alice);
    const b = await connectAs(session.id, bob);
    const consoleConn = await connectConsole(session.id);

    expect((await post(`/sessions/${session.id}/start`)).ok).toBe(true);
    const r1 = await roundStarted(a.events, 1);
    expect(r1).toMatchObject({ engineKey: 'burger', game: { slug } });

    // Compte à rebours : burger caché, déplacement refusé.
    await viewOf<BurgerMobileView>(a.events, r1.roundId, (v) => v.phase === 'countdown');
    const early = await sendGameAction(a.socket, {
      roundId: r1.roundId,
      type: 'reorder',
      payload: { order: [...BURGER_RECIPE] },
    });
    expect(early).toMatchObject({ ok: false, code: 'PHASE_CLOSED' });

    // Course : même départ pour tous, aucun étage en place.
    const startA = await viewOf<BurgerMobileView>(a.events, r1.roundId, (v) => v.phase === 'build');
    const startB = await viewOf<BurgerMobileView>(b.events, r1.roundId, (v) => v.phase === 'build');
    expect(startA.me.order).toEqual(startB.me.order);
    expect(startA.me.correctCount).toBe(0);

    // Alice : un mauvais ordre (accusé avec sa progression), puis le bon.
    const partial = [...startA.me.order];
    const j = partial.indexOf('bun_bottom');
    [partial[0], partial[j]] = [partial[j]!, partial[0]!];
    const ack1 = await sendGameAction(a.socket, {
      roundId: r1.roundId,
      type: 'reorder',
      payload: { order: partial },
    });
    expect(ack1).toMatchObject({ ok: true, result: { finishMs: null, rank: null } });
    const invalid = await sendGameAction(a.socket, {
      roundId: r1.roundId,
      type: 'reorder',
      payload: { order: ['bun_top'] },
    });
    expect(invalid).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    const ack2 = await sendGameAction(a.socket, {
      roundId: r1.roundId,
      type: 'reorder',
      payload: { order: [...BURGER_RECIPE] },
    });
    expect(ack2).toMatchObject({ ok: true, result: { correctCount: 8, rank: 1 } });

    // La console voit Alice terminée ; Bob ne reçoit rien de la progression d'Alice.
    await viewOf<BurgerScreenView>(
      consoleConn.events,
      r1.roundId,
      (v) => v.phase === 'build' && v.finishedCount === 1,
    );
    for (const e of named<GameStateEnvelope<BurgerMobileView>>(b.events, 'game:state')) {
      if (e.roundId === r1.roundId) expect(e.view.me.finishMs).toBeNull();
    }

    // Aucune vue (mobile, console) ne porte la recette avant les résultats.
    for (const events of [a.events, b.events, consoleConn.events]) {
      for (const e of named<GameStateEnvelope<Record<string, unknown>>>(events, 'game:state')) {
        if (e.roundId !== r1.roundId) continue;
        expect(e.view).not.toHaveProperty('recipe');
      }
    }

    // Bob termine : tout le monde a fini, résultats sans attendre l'échéance (30 s).
    await getSessionRuntime().handleAction(BigInt(session.id), bob.id, {
      type: 'reorder',
      payload: { order: [...BURGER_RECIPE] },
    });
    const results = await viewOf<BurgerScreenView>(
      consoleConn.events,
      r1.roundId,
      (v) => v.phase === 'results',
    );
    expect(burgerConsoleViewSchema.safeParse(results).success).toBe(true);
    if (results.phase !== 'results') throw new Error('unreachable');
    expect(results.recipe).toEqual([...BURGER_RECIPE]);
    expect(results.racers.map((r) => r.pseudo)).toEqual(['Alice', 'Bob']);
    const mine = await viewOf<BurgerMobileView>(a.events, r1.roundId, (v) => v.phase === 'results');
    expect(burgerMobileViewSchema.safeParse(mine).success).toBe(true);
    expect(mine.me).toMatchObject({ rank: 1 });
    expect(mine.me.points).toBeGreaterThan(500);

    await roundEnded(a.events, 1);
    const events = await prisma.scoreEvent.findMany({
      where: { reason: BURGER_SCORE_REASON },
      orderBy: { points: 'desc' },
    });
    expect(events).toHaveLength(2);
    expect(events[0]!.playerId).toBe(alice.id);
    const aliceRow = await prisma.player.findUniqueOrThrow({ where: { id: alice.id } });
    expect(aliceRow.scoreTotal).toBe(mine.me.points);
    await until(() => named(a.events, 'session:ended').length === 1);
  });
});
