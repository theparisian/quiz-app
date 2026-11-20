import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import {
  TOWER_SCORE_REASON,
  towerBookAt,
  towerConsoleViewSchema,
  towerMobileViewSchema,
  type RoundEndedPayload,
  type RoundInfo,
  type TowerMobileView,
  type TowerScreenView,
} from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import {
  getSessionRuntime,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import { sendGameAction, type GameStateEnvelope } from './helpers/game-protocol.js';

/**
 * Moteur tour de livres dans une vraie séance : création par l'API, lâchers par les sockets,
 * points en base, tour d'un joueur absente des vues des autres.
 */
describe('tower engine in a session', () => {
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

  /** Jeu tour créé et publié par l'API REST (construction de 30 s, compte à rebours 3 s). */
  async function createTowerGame(): Promise<string> {
    const invalid = await post('/games', {
      engineKey: 'tower',
      title: 'Tour invalide',
      configJson: { durationSeconds: 1 },
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'TOWER_CONFIG_INVALID' } });

    const res = await post('/games', {
      engineKey: 'tower',
      title: 'La tour de livres',
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

  it('build end to end: socket drops, forced end, points by standing height', async () => {
    const slug = await createTowerGame();
    const session = await createSession([slug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const bob = await seedPlayer(session.id, 'Bob');
    const a = await connectAs(session.id, alice);
    const b = await connectAs(session.id, bob);
    const consoleConn = await connectConsole(session.id);

    expect((await post(`/sessions/${session.id}/start`)).ok).toBe(true);
    const r1 = await roundStarted(a.events, 1);
    expect(r1).toMatchObject({ engineKey: 'tower', game: { slug } });

    // Compte à rebours : lâcher refusé.
    await viewOf<TowerMobileView>(a.events, r1.roundId, (v) => v.phase === 'countdown');
    const early = await sendGameAction(a.socket, {
      roundId: r1.roundId,
      type: 'drop',
      payload: { index: 0, x: 0 },
    });
    expect(early).toMatchObject({ ok: false, code: 'PHASE_CLOSED' });

    const startA = await viewOf<TowerMobileView>(a.events, r1.roundId, (v) => v.phase === 'build');
    const startB = await viewOf<TowerMobileView>(b.events, r1.roundId, (v) => v.phase === 'build');
    expect(startA.seed).toBe(startB.seed);
    expect(startA.me).toMatchObject({ books: [], drops: 0 });

    // Alice : trois livres centrés ; un lâcher hors limites refusé.
    for (let i = 0; i < 3; i++) {
      if (i > 0) await sleep(220);
      const ack = await sendGameAction(a.socket, {
        roundId: r1.roundId,
        type: 'drop',
        payload: { index: i, x: 0 },
      });
      expect(ack).toMatchObject({ ok: true, result: { fallen: 0, drops: i + 1 } });
    }
    const invalid = await sendGameAction(a.socket, {
      roundId: r1.roundId,
      type: 'drop',
      payload: { index: 3, x: 99 },
    });
    expect(invalid).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    const mineBuild = await viewOf<TowerMobileView>(
      a.events,
      r1.roundId,
      (v) => v.phase === 'build' && v.me.drops === 3,
    );
    expect(mineBuild.me.books.map((x) => x.k)).toEqual(
      [0, 1, 2].map((i) => towerBookAt(startA.seed, i)),
    );

    // Bob : un livre.
    await getSessionRuntime().handleAction(BigInt(session.id), bob.id, {
      type: 'drop',
      payload: { index: 0, x: 0 },
    });

    // La console voit les deux tours ; Bob ne reçoit jamais la tour d'Alice.
    await viewOf<TowerScreenView>(
      consoleConn.events,
      r1.roundId,
      (v) => v.phase === 'build' && v.racers.length === 2 && v.racers[1]!.books.length === 1,
    );
    for (const e of named<GameStateEnvelope<TowerMobileView>>(b.events, 'game:state')) {
      if (e.roundId === r1.roundId) expect(e.view.me.books.length).toBeLessThanOrEqual(1);
    }

    // « Forcer la fin » : résultats.
    await getSessionRuntime().forceAdvance(BigInt(session.id));
    const results = await viewOf<TowerScreenView>(
      consoleConn.events,
      r1.roundId,
      (v) => v.phase === 'results',
    );
    expect(towerConsoleViewSchema.safeParse(results).success).toBe(true);
    if (results.phase !== 'results') throw new Error('unreachable');
    expect(results.racers.map((r) => r.pseudo)).toEqual(['Alice', 'Bob']);
    const mine = await viewOf<TowerMobileView>(a.events, r1.roundId, (v) => v.phase === 'results');
    expect(towerMobileViewSchema.safeParse(mine).success).toBe(true);
    expect(mine.me).toMatchObject({ rank: 1 });
    expect(mine.me.points).toBe(Math.round(mine.me.heightCm * 5) + 300);

    await getSessionRuntime().forceAdvance(BigInt(session.id));
    await roundEnded(a.events, 1);
    const events = await prisma.scoreEvent.findMany({
      where: { reason: TOWER_SCORE_REASON },
      orderBy: { points: 'desc' },
    });
    expect(events).toHaveLength(2);
    expect(events[0]!.playerId).toBe(alice.id);
    const aliceRow = await prisma.player.findUniqueOrThrow({ where: { id: alice.id } });
    expect(aliceRow.scoreTotal).toBe(mine.me.points);
    await until(() => named(a.events, 'session:ended').length === 1);
  });
});
