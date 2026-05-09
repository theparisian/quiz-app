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

describe('players API (integration)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let adminToken: string;
  let sessionSlugShort: string;
  let sessionId: string;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();

    const { user, token } = await createSuperAdminUser();
    adminToken = token;

    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `q-${Date.now()}`,
        title: 'PQ',
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

    const createRes = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);

    sessionSlugShort = createRes.body.slugShort;
    sessionId = createRes.body.id;
  });

  it('join success and returns resumeToken', async () => {
    const res = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'Alice' })
      .expect(201);

    expect(res.body.player.pseudo).toBe('Alice');
    expect(res.body.resumeToken).toBeDefined();
    expect(res.body.resumeToken.length).toBeGreaterThan(10);
    expect(res.body.player.scoreTotal).toBe(0);
  });

  it('join with bad-word pseudo → 400', async () => {
    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'connard' })
      .expect(400);
  });

  it('join with duplicate pseudo (case-insensitive) → 409', async () => {
    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'Alice' })
      .expect(201);

    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'alice' })
      .expect(409);
  });

  it('join with too short pseudo → 400', async () => {
    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'A' })
      .expect(400);
  });

  it('join when session not in lobby → 409', async () => {
    await prisma.session.update({
      where: { id: BigInt(sessionId) },
      data: { state: 'ended', endedAt: new Date() },
    });

    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'Bob' })
      .expect(409);
  });

  it('GET /sessions/:id/players returns player list', async () => {
    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'Alice' })
      .expect(201);

    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'Bob' })
      .expect(201);

    const res = await request(app).get(`/api/sessions/${sessionId}/players`).expect(200);

    expect(res.body.length).toBe(2);
    expect(res.body[0].pseudo).toBe('Alice');
    expect(res.body[1].pseudo).toBe('Bob');
  });
});
