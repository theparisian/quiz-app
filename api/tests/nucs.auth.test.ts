import request from 'supertest';
import bcrypt from 'bcrypt';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  getIntegrationApp,
  truncateQuizRelatedTables,
  minimalCinemaAndScreen,
} from './helpers/integration.js';

describe('NUC auth (integration)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let nucUid: string;
  const authKey = 'test-auth-key-64-chars-' + 'x'.repeat(41);

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    await prisma.nuc.deleteMany({});
    app = getIntegrationApp();

    const infra = await minimalCinemaAndScreen();
    const hash = await bcrypt.hash(authKey, 10);
    nucUid = `nuc-${Date.now()}`;
    await prisma.nuc.create({
      data: {
        screenId: infra.screenId,
        nucUid,
        authKeyHash: hash,
        status: 'provisioning',
      },
    });
  });

  it('POST /api/nucs/auth — valid key sets cookie and returns context', async () => {
    const res = await request(app).post('/api/nucs/auth').send({ nucUid, authKey }).expect(200);

    expect(res.body.nucId).toBeDefined();
    expect(res.body.screenId).toBeDefined();
    expect(res.body.cinemaSlug).toBeDefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const nucCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c: string) =>
      c.startsWith('nuc_session='),
    );
    expect(nucCookie).toBeDefined();

    const nuc = await prisma.nuc.findUnique({ where: { nucUid } });
    expect(nuc?.status).toBe('online');
    expect(nuc?.lastHeartbeatAt).not.toBeNull();
  });

  it('POST /api/nucs/auth — bad key returns 401', async () => {
    await request(app).post('/api/nucs/auth').send({ nucUid, authKey: 'wrong-key' }).expect(401);
  });

  it('POST /api/nucs/auth — unknown NUC returns 401', async () => {
    await request(app).post('/api/nucs/auth').send({ nucUid: 'nonexistent', authKey }).expect(401);
  });

  it('POST /api/nucs/heartbeat (cookie) — updates lastHeartbeatAt', async () => {
    const authRes = await request(app).post('/api/nucs/auth').send({ nucUid, authKey }).expect(200);

    const cookies = authRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies;

    const before = await prisma.nuc.findUnique({ where: { nucUid } });

    await new Promise((r) => setTimeout(r, 50));

    await request(app)
      .post('/api/nucs/heartbeat')
      .set('Cookie', cookieHeader)
      .send({ appVersion: '1.0.0' })
      .expect(200);

    const after = await prisma.nuc.findUnique({ where: { nucUid } });
    expect(after?.lastHeartbeatAt!.getTime()).toBeGreaterThan(before?.lastHeartbeatAt!.getTime());
    expect(after?.appVersion).toBe('1.0.0');
  });
});
