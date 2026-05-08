import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

function base(slugTitle: string) {
  return {
    title: slugTitle,
    type: 'standard' as const,
    language: 'fr',
  };
}

describe('quiz publish validation', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('errors when no questions', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'P0' }).expect(201)
    ).body.slug as string;
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({ ...base('P0'), questions: [] })
      .expect(200);
    const res = await authed(request(app).post(`/api/quizzes/${slug}/publish`), token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUIZ_PUBLISH_VALIDATION_FAILED');
  });

  it('two correct answers fails', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'P2' }).expect(201)
    ).body.slug as string;
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        ...base('P2'),
        questions: [
          {
            position: 0,
            text: 'Q',
            timeLimitSeconds: 20,
            pointsMax: 1000,
            pointsFloor: 500,
            answers: [
              { position: 'A', text: 'x', isCorrect: true },
              { position: 'B', text: 'y', isCorrect: true },
            ],
          },
        ],
      })
      .expect(400);
  });

  it('pointsFloor >= pointsMax fails validation on save', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'P3' }).expect(201)
    ).body.slug as string;
    const res = await authed(request(app).put(`/api/quizzes/${slug}/full`), token).send({
      ...base('P3'),
      questions: [
        {
          position: 0,
          text: 'Q',
          timeLimitSeconds: 20,
          pointsMax: 500,
          pointsFloor: 500,
          answers: [
            { position: 'A', text: 'x', isCorrect: true },
            { position: 'B', text: 'y', isCorrect: false },
          ],
        },
      ],
    });
    expect(res.status).toBe(400);
  });
});
