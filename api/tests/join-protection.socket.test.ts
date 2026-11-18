import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { setIoInstance } from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';

type JoinAck = { ok?: boolean; code?: string; playerId?: string; sessionId?: string };

describe('player:join protection (socket, A2)', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let sessionId: string;
  let slugShort: string;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    const app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `jp-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    const adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `jps-${Date.now()}`,
        title: 'JPS',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const body = (await res.json()) as { id: string; slugShort: string };
    sessionId = body.id;
    slugShort = body.slugShort;
  });

  afterEach(async () => {
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function connect(forwardedFor: string): Promise<ClientSocket> {
    const s = ioClient(`${baseUrl}/mobile`, {
      transports: ['websocket'],
      // Valeur forgée en tête, IP réelle ajoutée en dernier par le proxy.
      extraHeaders: { 'x-forwarded-for': `198.51.100.7, ${forwardedFor}` },
    });
    sockets.push(s);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    return s;
  }

  function join(socket: ClientSocket, payload: Record<string, unknown>): Promise<JoinAck> {
    return new Promise((resolve) => socket.emit('player:join', payload, resolve));
  }

  it('joins with the QR joinToken', async () => {
    const session = await prisma.session.findUniqueOrThrow({ where: { id: BigInt(sessionId) } });
    const socket = await connect('203.0.113.10');
    const ack = await join(socket, { joinToken: session.joinToken, pseudo: 'Qr' });
    expect(ack.ok).toBe(true);
    expect(ack.sessionId).toBe(sessionId);
  });

  it('rejects both identifiers at once', async () => {
    const session = await prisma.session.findUniqueOrThrow({ where: { id: BigInt(sessionId) } });
    const socket = await connect('203.0.113.11');
    const ack = await join(socket, {
      joinToken: session.joinToken,
      sessionSlugShort: slugShort,
      pseudo: 'Both',
    });
    expect(ack.ok).toBe(false);
    expect(ack.code).toBe('VALIDATION_ERROR');
  });

  it('rate limits unknown codes per forwarded client IP, not per proxy', async () => {
    const unknown = slugShort === '0000' ? '0001' : '0000';
    const attacker = await connect('203.0.113.20');
    for (let i = 0; i < 10; i++) {
      const ack = await join(attacker, { sessionSlugShort: unknown, pseudo: `Bad${i}` });
      expect(ack.code).toBe('SESSION_NOT_FOUND');
    }
    const blocked = await join(attacker, { sessionSlugShort: slugShort, pseudo: 'Blocked' });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('RATE_LIMITED');

    // Même proxy, autre client : pas bloqué.
    const neighbour = await connect('203.0.113.21');
    const ok = await join(neighbour, { sessionSlugShort: slugShort, pseudo: 'Neighbour' });
    expect(ok.ok).toBe(true);
  });
});
