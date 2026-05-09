import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { setIoInstance } from '../src/modules/sessions/session-orchestrator.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';

function waitSnap(socket: ClientSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('session:state_snapshot timeout')), 8000);
    socket.once('session:state_snapshot', (data: unknown) => {
      clearTimeout(t);
      resolve(data as Record<string, unknown>);
    });
  });
}

describe('session resume (integration)', () => {
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

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `sr-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('player:resume returns lobby snapshot', async () => {
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `qr-${Date.now()}`,
        title: 'R',
        status: 'published',
        createdByUserId: (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!.id,
      },
    });

    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const sess = (await res.json()) as { id: string; slugShort: string };

    const mobile = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(mobile);
    await new Promise<void>((r) => mobile.on('connect', r));

    const joinRes = await new Promise<{
      playerId: string;
      resumeToken: string;
    }>((resolve, reject) => {
      mobile.emit(
        'player:join',
        { pseudo: 'Snap', sessionSlugShort: sess.slugShort },
        (cb: unknown) => {
          const o = cb as Record<string, unknown>;
          if (o.playerId && o.resumeToken) resolve(o as { playerId: string; resumeToken: string });
          else reject(new Error(JSON.stringify(o)));
        },
      );
      setTimeout(() => reject(new Error('join timeout')), 5000);
    });

    const snapP = waitSnap(mobile);
    mobile.emit('player:resume', { resumeToken: joinRes.resumeToken, sessionId: sess.id });
    const snap = await snapP;

    expect((snap.session as { state: string }).state).toBe('lobby');
    expect((snap.player as { pseudo: string }).pseudo).toBe('Snap');
  });

  it('player:resume with bad token → error', async () => {
    const mobile = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(mobile);
    await new Promise<void>((r) => mobile.on('connect', r));

    const errP = new Promise<{ code: string }>((resolve) => {
      mobile.once('error', (e: unknown) => resolve(e as { code: string }));
    });
    mobile.emit('player:resume', { resumeToken: 'nope', sessionId: '1' });
    const err = await errP;
    expect(err.code).toBe('INVALID_RESUME_TOKEN');
  });

  it('nuc:resume without session → session null', async () => {
    const infra = await minimalCinemaAndScreen();
    const authKey = 'k'.repeat(64);
    const hash = await bcrypt.hash(authKey, 8);
    const nucUid = `nuc-r-${Date.now()}`;
    await prisma.nuc.create({
      data: { screenId: infra.screenId, nucUid, authKeyHash: hash, status: 'online' },
    });

    const authRes = await request(httpServer)
      .post('/api/nucs/auth')
      .send({ nucUid, authKey })
      .expect(200);
    const rawCookies = authRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(rawCookies)
      ? rawCookies.join('; ')
      : String(rawCookies ?? '');

    const nucSocket = ioClient(`${baseUrl}/player`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookieHeader },
    });
    sockets.push(nucSocket);
    await new Promise<void>((r) => nucSocket.on('connect', r));

    const snapP = waitSnap(nucSocket);
    nucSocket.emit('nuc:resume', { nucUid });
    const snap = await snapP;

    expect(snap.session).toBeNull();
    expect(snap.nuc).toBeDefined();
  });

  it('console:resume returns quiz with isCorrect', async () => {
    const infra = await minimalCinemaAndScreen();
    const admin = (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!;
    const quiz = await prisma.quiz.create({
      data: {
        slug: `qc-${Date.now()}`,
        title: 'Console R',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q?',
        timeLimitSeconds: 10,
        pointsMax: 100,
        pointsFloor: 50,
        answers: {
          create: [
            { position: 'A', text: 'Y', isCorrect: true },
            { position: 'B', text: 'N', isCorrect: false },
          ],
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const sess = (await res.json()) as { id: string };

    const con = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `token=${adminToken}` },
    });
    sockets.push(con);
    await new Promise<void>((r) => con.on('connect', r));

    const snapP = waitSnap(con);
    con.emit('console:resume', { sessionId: sess.id });
    const snap = await snapP;

    const quizSnap = snap.quiz as {
      questions: { answers: { isCorrect: boolean }[] }[];
    };
    expect(quizSnap.questions[0]!.answers.some((a) => a.isCorrect === true)).toBe(true);
  });
});
