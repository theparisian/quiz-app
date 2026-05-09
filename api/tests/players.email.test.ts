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
    await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'winner@test.com' })
      .expect(200);

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    expect(player?.emailForPrize).toBe('winner@test.com');
  });

  it('PATCH /api/players/:id/email — not top 3 → 403', async () => {
    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 5 },
    });

    await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'loser@test.com' })
      .expect(403);
  });

  it('PATCH /api/players/:id/email — wrong token → 403', async () => {
    await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', 'bad-token')
      .send({ email: 'hacker@test.com' })
      .expect(404);
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
