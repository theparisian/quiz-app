import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { signNucJwt } from '../src/shared/auth/nuc-jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { setIoInstance } from '../src/modules/sessions/session-orchestrator.service.js';
import {
  NUC_OFFLINE_THRESHOLD_MS,
  scanStaleOnlineNucsAndMarkOffline,
} from '../src/shared/nuc-monitor/nuc-offline-monitor.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import type { Server } from 'socket.io';

function waitNucStatus(socket: ClientSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('nuc:status_changed timeout')), 8000);
    socket.once('nuc:status_changed', (data: unknown) => {
      clearTimeout(t);
      resolve(data as Record<string, unknown>);
    });
  });
}

async function minimalSessionOnScreen(
  baseUrl: string,
  adminToken: string,
  screenId: bigint,
): Promise<{ id: string }> {
  const quiz = await prisma.quiz.create({
    data: {
      slug: `qz-${Date.now()}`,
      title: 'Q',
      status: 'published',
      createdByUserId: (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!.id,
    },
  });
  await prisma.question.create({
    data: {
      quizId: quiz.id,
      position: 1,
      text: '?',
      timeLimitSeconds: 10,
      pointsMax: 10,
      pointsFloor: 0,
      answers: { create: [{ position: 'A', text: 'a', isCorrect: true }] },
    },
  });
  const res = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
    body: JSON.stringify({ quizSlug: quiz.slug, screenId: screenId.toString() }),
  });
  return (await res.json()) as { id: string };
}

describe('NUC offline monitor (integration)', () => {
  let httpServer: HttpServer;
  let io: Server;
  let baseUrl: string;
  let adminToken: string;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateQuizRelatedTables();

    const app = buildApp();
    httpServer = createServer(app);
    io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `nm-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('scanStaleOnlineNucs marks stale NUC offline and emits nuc:status_changed', async () => {
    const infra = await minimalCinemaAndScreen();
    const sess = await minimalSessionOnScreen(baseUrl, adminToken, infra.screenId);

    const authKey = 'z'.repeat(64);
    const hash = await bcrypt.hash(authKey, 8);
    const nucUid = `nuc-mon-${Date.now()}`;
    const nuc = await prisma.nuc.create({
      data: {
        screenId: infra.screenId,
        nucUid,
        authKeyHash: hash,
        status: 'online',
        lastHeartbeatAt: new Date(Date.now() - NUC_OFFLINE_THRESHOLD_MS - 60_000),
      },
    });

    const con = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `token=${adminToken}` },
    });
    sockets.push(con);
    await new Promise<void>((r) => con.on('connect', r));

    const statusP = waitNucStatus(con);
    con.emit('console:join', { sessionId: sess.id });
    await new Promise<void>((r) => setTimeout(r, 300));

    const n = await scanStaleOnlineNucsAndMarkOffline(io);
    expect(n).toBe(1);

    const evt = await statusP;
    expect(evt.status).toBe('offline');
    expect(evt.reason).toBe('heartbeat_timeout');
    expect(evt.nucId).toBe(nuc.id.toString());
    expect(evt.screenId).toBe(infra.screenId.toString());

    const updated = await prisma.nuc.findUnique({ where: { id: nuc.id } });
    expect(updated?.status).toBe('offline');
  });

  it('POST /api/nuc/heartbeat when NUC was offline emits nuc:status_changed online', async () => {
    const infra = await minimalCinemaAndScreen();
    const sess = await minimalSessionOnScreen(baseUrl, adminToken, infra.screenId);

    const authKey = 'y'.repeat(64);
    const hash = await bcrypt.hash(authKey, 8);
    const nucUid = `nuc-hb-${Date.now()}`;
    const nuc = await prisma.nuc.create({
      data: {
        screenId: infra.screenId,
        nucUid,
        authKeyHash: hash,
        status: 'offline',
        lastHeartbeatAt: new Date(Date.now() - 300_000),
      },
    });

    const con = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `token=${adminToken}` },
    });
    sockets.push(con);
    await new Promise<void>((r) => con.on('connect', r));

    const statusP = waitNucStatus(con);
    con.emit('console:join', { sessionId: sess.id });
    await new Promise<void>((r) => setTimeout(r, 300));

    const hb = await fetch(`${baseUrl}/api/nuc/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nucUid, authKey, appVersion: '1.0.0' }),
    });
    expect(hb.ok).toBe(true);

    const evt = await statusP;
    expect(evt.status).toBe('online');
    expect(evt.nucId).toBe(nuc.id.toString());
    expect(evt.screenId).toBe(infra.screenId.toString());

    const updated = await prisma.nuc.findUnique({ where: { id: nuc.id } });
    expect(updated?.status).toBe('online');
  });

  it('POST /api/nucs/auth when NUC was provisioning emits nuc:status_changed on /admin', async () => {
    const infra = await minimalCinemaAndScreen();

    const authKey = 'p'.repeat(64);
    const hash = await bcrypt.hash(authKey, 8);
    const nucUid = `nuc-prov-${Date.now()}`;
    const nuc = await prisma.nuc.create({
      data: {
        screenId: infra.screenId,
        nucUid,
        authKeyHash: hash,
        status: 'provisioning',
      },
    });

    const adminSock = ioClient(`${baseUrl}/admin`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `token=${adminToken}` },
    });
    sockets.push(adminSock);
    await new Promise<void>((r) => adminSock.on('connect', r));

    const statusP = waitNucStatus(adminSock);
    adminSock.emit('admin:watch_cinema', { cinemaSlug: infra.cinemaSlug });
    await new Promise<void>((r) => setTimeout(r, 300));

    const auth = await fetch(`${baseUrl}/api/nucs/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nucUid, authKey }),
    });
    expect(auth.ok).toBe(true);

    const evt = await statusP;
    expect(evt.status).toBe('online');
    expect(evt.nucId).toBe(nuc.id.toString());
    expect(evt.screenId).toBe(infra.screenId.toString());
  });

  it('nuc:join_screen when NUC was offline emits nuc:status_changed on /admin', async () => {
    const infra = await minimalCinemaAndScreen();

    const authKey = 'q'.repeat(64);
    const hash = await bcrypt.hash(authKey, 8);
    const nucUid = `nuc-js-${Date.now()}`;
    const nuc = await prisma.nuc.create({
      data: {
        screenId: infra.screenId,
        nucUid,
        authKeyHash: hash,
        status: 'offline',
      },
    });

    const nucToken = await signNucJwt({
      nucId: nuc.id.toString(),
      screenId: infra.screenId.toString(),
    });

    const adminSock = ioClient(`${baseUrl}/admin`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `token=${adminToken}` },
    });
    sockets.push(adminSock);
    await new Promise<void>((r) => adminSock.on('connect', r));

    const statusP = waitNucStatus(adminSock);
    adminSock.emit('admin:watch_cinema', { cinemaSlug: infra.cinemaSlug });
    await new Promise<void>((r) => setTimeout(r, 300));

    const playerSock = ioClient(`${baseUrl}/player`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `nuc_session=${nucToken}` },
    });
    sockets.push(playerSock);
    await new Promise<void>((r) => playerSock.on('connect', r));

    await new Promise<void>((resolve, reject) => {
      playerSock.emit('nuc:join_screen', { nucId: nuc.nucUid }, (res: { ok?: boolean }) => {
        if (res?.ok) resolve();
        else reject(new Error('nuc:join_screen failed'));
      });
    });

    const evt = await statusP;
    expect(evt.status).toBe('online');
    expect(evt.nucId).toBe(nuc.id.toString());
    expect(evt.screenId).toBe(infra.screenId.toString());
  });
});
