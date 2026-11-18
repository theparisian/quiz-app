import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import type { Express } from 'express';
import { prisma } from '../src/shared/db/index.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { setIoInstance } from '../src/modules/sessions/session-runtime.service.js';
import { assertCanAccessCinema } from '../src/shared/auth/tenant-scope.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

interface CinemaFixture {
  cinemaId: bigint;
  cinemaSlug: string;
  screenId: bigint;
  sessionId: string;
  playerId: string;
}

describe('tenant scope (cloisonnement entre cinémas)', () => {
  let httpServer: HttpServer;
  let app: Express;
  let baseUrl: string;
  let sockets: ClientSocket[];
  let superToken: string;
  let projAToken: string;
  let quizSlug: string;
  let a: CinemaFixture;
  let b: CinemaFixture;

  async function createCinemaFixture(): Promise<CinemaFixture> {
    const infra = await minimalCinemaAndScreen();
    const cinema = await prisma.cinema.findUniqueOrThrow({ where: { slug: infra.cinemaSlug } });
    const res = await authed(request(app).post('/api/sessions'), superToken)
      .send({ quizSlug, screenId: infra.screenId.toString() })
      .expect(201);
    const player = await prisma.player.create({
      data: {
        sessionId: BigInt(res.body.id as string),
        pseudo: `p-${Math.random().toString(36).slice(2, 8)}`,
        resumeToken: `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
    return {
      cinemaId: cinema.id,
      cinemaSlug: infra.cinemaSlug,
      screenId: infra.screenId,
      sessionId: res.body.id as string,
      playerId: player.id.toString(),
    };
  }

  beforeEach(async () => {
    await truncateQuizRelatedTables();

    app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
    sockets = [];

    const sa = await createSuperAdminUser();
    superToken = sa.token;

    const quiz = await prisma.quiz.create({
      data: {
        slug: `tenant-${Date.now()}`,
        title: 'Tenant Quiz',
        status: 'published',
        createdByUserId: sa.user.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q1?',
        timeLimitSeconds: 60,
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
    quizSlug = quiz.slug;

    a = await createCinemaFixture();
    b = await createCinemaFixture();

    projAToken = (await createCinemaUser('projectionist', a.cinemaId)).token;
  });

  afterEach(async () => {
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("projectionist of A gets 403 on B's session (start, pause, abort, GET, kick)", async () => {
    const forbidden = async (t: request.Test) => {
      const res = await authed(t, projAToken).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    };

    await forbidden(request(app).post(`/api/sessions/${b.sessionId}/start`));
    await forbidden(request(app).post(`/api/sessions/${b.sessionId}/pause`));
    await forbidden(request(app).post(`/api/sessions/${b.sessionId}/resume`));
    await forbidden(request(app).post(`/api/sessions/${b.sessionId}/force-end-question`));
    await forbidden(request(app).post(`/api/sessions/${b.sessionId}/toggle-mute`));
    await forbidden(request(app).post(`/api/sessions/${b.sessionId}/abort`).send({}));
    await forbidden(request(app).get(`/api/sessions/${b.sessionId}`));
    await forbidden(request(app).get(`/api/sessions/${b.sessionId}/full`));
    await forbidden(request(app).post(`/api/players/${b.playerId}/kick`));

    const session = await prisma.session.findUniqueOrThrow({ where: { id: BigInt(b.sessionId) } });
    expect(session.state).toBe('lobby');
    const player = await prisma.player.findUniqueOrThrow({ where: { id: BigInt(b.playerId) } });
    expect(player.status).toBe('active');
  });

  it("projectionist of A gets 403 when creating a session on B's screen", async () => {
    const extraB = await prisma.screen.create({
      data: { cinemaId: b.cinemaId, name: 'S2', status: 'active' },
    });
    await authed(request(app).post('/api/sessions'), projAToken)
      .send({ quizSlug, screenId: extraB.id.toString() })
      .expect(403);
    expect(await prisma.session.count({ where: { screenId: extraB.id } })).toBe(0);
  });

  it("projectionist of A gets 403 on B's cinema, screens and session lists", async () => {
    await authed(request(app).get(`/api/cinemas/${b.cinemaSlug}`), projAToken).expect(403);
    await authed(request(app).get(`/api/cinemas/${b.cinemaSlug}/screens`), projAToken).expect(403);
    await authed(request(app).get(`/api/cinemas/${b.cinemaSlug}/sessions`), projAToken).expect(403);
    await authed(request(app).get(`/api/screens/${b.screenId}/sessions`), projAToken).expect(403);
  });

  it('projectionist of A succeeds on its own cinema', async () => {
    await authed(request(app).get(`/api/sessions/${a.sessionId}`), projAToken).expect(200);
    await authed(request(app).get(`/api/sessions/${a.sessionId}/full`), projAToken).expect(200);
    await authed(request(app).get(`/api/cinemas/${a.cinemaSlug}`), projAToken).expect(200);
    await authed(request(app).get(`/api/cinemas/${a.cinemaSlug}/screens`), projAToken).expect(200);
    await authed(request(app).get(`/api/cinemas/${a.cinemaSlug}/sessions`), projAToken).expect(200);
    await authed(request(app).get(`/api/screens/${a.screenId}/sessions`), projAToken).expect(200);
    await authed(request(app).post(`/api/players/${a.playerId}/kick`), projAToken).expect(200);

    await authed(request(app).post(`/api/sessions/${a.sessionId}/start`), projAToken).expect(200);
    await authed(request(app).post(`/api/sessions/${a.sessionId}/pause`), projAToken).expect(200);
    await authed(request(app).post(`/api/sessions/${a.sessionId}/abort`), projAToken)
      .send({})
      .expect(200);

    const extraA = await prisma.screen.create({
      data: { cinemaId: a.cinemaId, name: 'S2', status: 'active' },
    });
    await authed(request(app).post('/api/sessions'), projAToken)
      .send({ quizSlug, screenId: extraA.id.toString() })
      .expect(201);
  });

  it('super_admin succeeds everywhere', async () => {
    await authed(request(app).get(`/api/sessions/${b.sessionId}`), superToken).expect(200);
    await authed(request(app).get(`/api/cinemas/${b.cinemaSlug}`), superToken).expect(200);
    await authed(request(app).get(`/api/cinemas/${b.cinemaSlug}/screens`), superToken).expect(200);
    await authed(request(app).post(`/api/players/${b.playerId}/kick`), superToken).expect(200);
    await authed(request(app).post(`/api/sessions/${b.sessionId}/start`), superToken).expect(200);
    await authed(request(app).post(`/api/sessions/${b.sessionId}/pause`), superToken).expect(200);
    await authed(request(app).post(`/api/sessions/${b.sessionId}/abort`), superToken)
      .send({})
      .expect(200);
  });

  it('cinema user without cinemaId is refused', async () => {
    await expect(
      assertCanAccessCinema({ role: 'cinema_admin', cinemaId: null }, a.cinemaId),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    await expect(
      assertCanAccessCinema({ role: 'super_admin', cinemaId: null }, a.cinemaId),
    ).resolves.toBeUndefined();
  });

  async function connectConsole(token: string): Promise<ClientSocket> {
    const s = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `token=${token}` },
      forceNew: true,
    });
    sockets.push(s);
    await new Promise<void>((resolve) => s.on('connect', resolve));
    return s;
  }

  it("console:join on B's session returns FORBIDDEN for projectionist of A", async () => {
    const con = await connectConsole(projAToken);

    const errorP = new Promise<{ code: string; message: string }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('error event timeout')), 5000);
      con.once('error', (e: { code: string; message: string }) => {
        clearTimeout(t);
        resolve(e);
      });
    });
    let joined = false;
    con.emit('console:join', { sessionId: b.sessionId }, () => {
      joined = true;
    });

    const err = await errorP;
    expect(err).toEqual({ code: 'FORBIDDEN', message: 'Not allowed for this session' });
    expect(joined).toBe(false);

    const resumeErrP = new Promise<{ code: string }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('error event timeout')), 5000);
      con.once('error', (e: { code: string }) => {
        clearTimeout(t);
        resolve(e);
      });
    });
    con.emit('console:resume', { sessionId: b.sessionId });
    expect((await resumeErrP).code).toBe('FORBIDDEN');

    // Own session still works.
    const ack = await new Promise<{ sessionId: string }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('join ack timeout')), 5000);
      con.emit('console:join', { sessionId: a.sessionId }, (res: { sessionId: string }) => {
        clearTimeout(t);
        resolve(res);
      });
    });
    expect(ack.sessionId).toBe(a.sessionId);
  });
});
