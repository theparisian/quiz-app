import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

function validQuestion(body: Partial<{ id?: string }> = {}) {
  return {
    position: 0,
    text: 'Q?',
    timeLimitSeconds: 20,
    pointsMax: 1000,
    pointsFloor: 500,
    answers: [
      { position: 'A', text: 'a1', isCorrect: true },
      { position: 'B', text: 'a2', isCorrect: false },
    ],
    ...body,
  };
}

describe('quiz status transitions', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('publish ok, unpublish, archive, unarchive', async () => {
    const { token, user } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'T1' }).expect(201)
    ).body.slug as string;

    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        title: 'T1',
        type: 'standard',
        language: 'fr',
        questions: [validQuestion({ position: 0 })],
      })
      .expect(200);

    await authed(request(app).post(`/api/quizzes/${slug}/publish`), token).expect(200);
    await authed(request(app).post(`/api/quizzes/${slug}/unpublish`), token).expect(200);
    await authed(request(app).post(`/api/quizzes/${slug}/archive`), token).expect(200);
    await authed(request(app).post(`/api/quizzes/${slug}/unarchive`), token).expect(200);

    const q = await prisma.quiz.findFirst({ where: { slug } });
    expect(q?.status).toBe('draft');
    expect(q?.createdByUserId.toString()).toBe(user.id.toString());
  });

  it('publish rejects when already published', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'T2' }).expect(201)
    ).body.slug as string;
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        title: 'T2',
        type: 'standard',
        language: 'fr',
        questions: [validQuestion()],
      })
      .expect(200);
    await authed(request(app).post(`/api/quizzes/${slug}/publish`), token).expect(200);
    await authed(request(app).post(`/api/quizzes/${slug}/publish`), token).expect(403);
  });

  it('unpublish rejects draft', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'T3' }).expect(201)
    ).body.slug as string;
    await authed(request(app).post(`/api/quizzes/${slug}/unpublish`), token).expect(403);
  });
});
