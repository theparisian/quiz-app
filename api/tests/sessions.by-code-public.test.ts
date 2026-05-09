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

describe('sessions by-code public (integration)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let adminToken: string;
  let slugShort: string;

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
            { position: 'C', text: 'C', isCorrect: false },
            { position: 'D', text: 'D', isCorrect: false },
          ],
        },
      },
    });

    const res = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);

    slugShort = res.body.slugShort;
  });

  it('returns branding info without questions or answers', async () => {
    const res = await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(200);

    expect(res.body.sessionId).toBeDefined();
    expect(res.body.slugShort).toBe(slugShort);
    expect(res.body.state).toBe('lobby');
    expect(res.body.cinema).toBeDefined();
    expect(res.body.cinema.name).toBe('Test Cinema');
    expect(res.body.quiz).toBeDefined();
    expect(res.body.quiz.title).toBe('Test Quiz');
    expect(res.body.totalPlayers).toBe(0);

    expect(res.body.questions).toBeUndefined();
    expect(res.body.answers).toBeUndefined();
    expect(res.body.quiz.questions).toBeUndefined();
  });

  it('returns 404 for unknown code', async () => {
    await request(app).get('/api/sessions/by-code/0000').expect(404);
  });
});
