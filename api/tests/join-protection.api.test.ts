import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { maxPlayersForCapacity } from '../src/modules/players/players.service.js';
import { buildConsoleStateSnapshot } from '../src/modules/sessions/session-resume.service.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
  minimalCinemaAndScreen,
} from './helpers/integration.js';

describe('join protection (A2)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let slugShort: string;
  let sessionId: string;
  let screenId: bigint;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();

    const { user, token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    screenId = infra.screenId;
    const quiz = await prisma.quiz.create({
      data: {
        slug: `jp-${Date.now()}`,
        title: 'JP',
        status: 'published',
        createdByUserId: user.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q?',
        timeLimitSeconds: 20,
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
    const res = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);
    slugShort = res.body.slugShort;
    sessionId = res.body.id;
  });

  async function joinToken(): Promise<string> {
    const s = await prisma.session.findUniqueOrThrow({ where: { id: BigInt(sessionId) } });
    expect(s.joinToken).toHaveLength(20);
    return s.joinToken!;
  }

  describe('security headers', () => {
    it('sends helmet headers with a cross-origin resource policy', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });
  });

  describe('magic link', () => {
    it('returns 429 RATE_LIMITED on the 6th request from the same IP', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/magic-link/request')
          .send({ email: `nobody-${i}@test.local` })
          .expect(200);
      }
      const res = await request(app)
        .post('/api/auth/magic-link/request')
        .send({ email: 'nobody-6@test.local' })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('limits to 3 requests per email (case-insensitive)', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/magic-link/request')
          .send({ email: 'Same@Test.local' })
          .expect(200);
      }
      await request(app)
        .post('/api/auth/magic-link/request')
        .send({ email: 'same@test.local' })
        .expect(429);
    });
  });

  describe('by-code / by-token', () => {
    it('blocks after 10 unknown codes, even for a valid code that answered 200 before', async () => {
      await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(200);
      const unknown = slugShort === '0000' ? '0001' : '0000';
      for (let i = 0; i < 10; i++) {
        await request(app).get(`/api/sessions/by-code/${unknown}`).expect(404);
      }
      const res = await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.headers['retry-after']).toBeDefined();
      await request(app).get(`/api/sessions/by-code/${slugShort}/avatars`).expect(429);
    });

    it('does not count successful lookups', async () => {
      for (let i = 0; i < 15; i++) {
        await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(200);
      }
    });

    it('by-token returns the same body as by-code', async () => {
      const token = await joinToken();
      const byCode = await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(200);
      const byToken = await request(app).get(`/api/sessions/by-token/${token}`).expect(200);
      expect(byToken.body).toEqual(byCode.body);
      expect(byToken.body.joinToken).toBeUndefined();
      await request(app).get('/api/sessions/by-token/unknown-token-xyz').expect(404);
    });
  });

  describe('POST /api/players/join', () => {
    it('joins with the QR joinToken', async () => {
      const token = await joinToken();
      const res = await request(app)
        .post('/api/players/join')
        .send({ joinToken: token, pseudo: 'Tokenized' })
        .expect(201);
      expect(res.body.player.sessionId).toBe(sessionId);
    });

    it('joins with the 4-digit code', async () => {
      const res = await request(app)
        .post('/api/players/join')
        .send({ sessionSlugShort: slugShort, pseudo: 'Coded' })
        .expect(201);
      expect(res.body.player.sessionId).toBe(sessionId);
    });

    it('rejects a payload with both or neither identifier', async () => {
      const token = await joinToken();
      await request(app)
        .post('/api/players/join')
        .send({ sessionSlugShort: slugShort, joinToken: token, pseudo: 'Both' })
        .expect(400);
      await request(app).post('/api/players/join').send({ pseudo: 'Neither' }).expect(400);
    });

    it('returns 404 for an unknown joinToken', async () => {
      await request(app)
        .post('/api/players/join')
        .send({ joinToken: 'abcdefghijklmnopqrst', pseudo: 'Lost' })
        .expect(404);
    });

    it('returns 409 SESSION_FULL once the player cap is reached', async () => {
      await prisma.screen.update({ where: { id: screenId }, data: { capacity: 10 } });
      expect(maxPlayersForCapacity(10)).toBe(50);
      await prisma.player.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          sessionId: BigInt(sessionId),
          pseudo: `Filler${i}`,
          resumeToken: `filler-${sessionId}-${i}`,
          status: 'active' as const,
          scoreTotal: 0,
        })),
      });
      const res = await request(app)
        .post('/api/players/join')
        .send({ sessionSlugShort: slugShort, pseudo: 'OneTooMany' })
        .expect(409);
      expect(res.body.error.code).toBe('SESSION_FULL');

      // Un joueur kické libère une place.
      await prisma.player.updateMany({
        where: { sessionId: BigInt(sessionId), pseudo: 'Filler0' },
        data: { status: 'kicked' },
      });
      await request(app)
        .post('/api/players/join')
        .send({ sessionSlugShort: slugShort, pseudo: 'OneTooMany' })
        .expect(201);
    });

    it('computes the player cap from the room capacity', () => {
      expect(maxPlayersForCapacity(null)).toBe(400);
      expect(maxPlayersForCapacity(20)).toBe(50);
      expect(maxPlayersForCapacity(101)).toBe(152);
    });
  });

  it('exposes joinToken in the console snapshot', async () => {
    const token = await joinToken();
    const snap = await buildConsoleStateSnapshot(BigInt(sessionId));
    expect((snap.session as { joinToken: string }).joinToken).toBe(token);
  });
});
