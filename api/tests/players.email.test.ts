import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
  minimalCinemaAndScreen,
} from './helpers/integration.js';
import { flushPrizeEmailQueueForTests } from '../src/shared/email/prize-email-queue.service.js';

describe('players email collection (integration)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let adminToken: string;
  let sessionId: bigint;
  let playerId: bigint;
  let resumeToken: string;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();

    const { user, token } = await createSuperAdminUser();
    adminToken = token;

    const infra = await minimalCinemaAndScreen();

    const screen = await prisma.screen.findUnique({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen missing');
    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: '20% confiserie', value: 'WIN20' },
          rank2: { type: 'discount_qr', label: '10% confiserie', value: 'WIN10' },
          rank3: { type: 'discount_qr', label: '5% confiserie', value: 'WIN5' },
        },
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `quiz-${Date.now()}`,
        title: 'Test Quiz',
        status: 'published',
        createdByUserId: user.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q1?',
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

    const sessionRes = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);

    sessionId = BigInt(sessionRes.body.id);

    const joinRes = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: sessionRes.body.slugShort, pseudo: 'Winner' })
      .expect(201);

    playerId = BigInt(joinRes.body.player.id);
    resumeToken = joinRes.body.resumeToken;

    await prisma.session.update({
      where: { id: sessionId },
      data: { state: 'ended', endedAt: new Date() },
    });

    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 1, scoreTotal: 1000 },
    });
  });

  it('PATCH /api/players/:id/email — top 3 OK', async () => {
    const res = await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'winner@test.com', consent: true })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, emailQueued: true });
    expect(typeof res.body.prizeId).toBe('string');

    await flushPrizeEmailQueueForTests();

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    expect(player?.emailForPrize).toBe('winner@test.com');
    expect(player?.emailConsentAt).not.toBeNull();

    const prize = await prisma.prize.findUnique({
      where: { playerId_sessionId: { playerId, sessionId } },
    });
    expect(prize?.emailSentAt).not.toBeNull();
    expect(prize?.rank).toBe(1);
  });

  it('PATCH /api/players/:id/email — rang 5 avec consolation OK', async () => {
    const screen = await prisma.screen.findUnique({
      where: { id: (await prisma.session.findUnique({ where: { id: sessionId } }))!.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen missing');
    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          all: { type: 'discount_qr', label: '−10 % confiserie', value: 'ALL10' },
        },
      },
    });

    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 5 },
    });

    const res = await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'consolation@test.com', consent: true })
      .expect(200);

    expect(res.body.emailQueued).toBe(true);
    await flushPrizeEmailQueueForTests();

    const prize = await prisma.prize.findUnique({
      where: { playerId_sessionId: { playerId, sessionId } },
    });
    expect(prize?.isConsolation).toBe(true);
  });

  it('PATCH /api/players/:id/email — sans lot configuré → 404', async () => {
    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 5 },
    });

    await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'loser@test.com', consent: true })
      .expect(404);
  });

  it('PATCH /api/players/:id/email — wrong token → 403', async () => {
    await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', 'bad-token')
      .send({ email: 'hacker@test.com' })
      .expect(404);
  });

  it('PATCH /api/players/:id/email — consent requis → CONSENT_REQUIRED', async () => {
    const res = await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'winner@test.com', consent: false })
      .expect(400);

    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('PATCH /api/players/:id/email — session not ended → 409', async () => {
    await prisma.session.update({
      where: { id: sessionId },
      data: { state: 'running', endedAt: null },
    });

    await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'early@test.com' })
      .expect(409);
  });
});
