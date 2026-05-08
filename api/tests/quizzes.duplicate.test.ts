import request from 'supertest';
import { nanoid } from 'nanoid';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

function oneQuestion() {
  return {
    position: 0,
    text: 'Q',
    timeLimitSeconds: 20,
    pointsMax: 1000,
    pointsFloor: 500,
    answers: [
      { position: 'A', text: 'x', isCorrect: true },
      { position: 'B', text: 'y', isCorrect: false },
    ],
  };
}

describe('quiz duplicate', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('copies content, new slug, draft, shared image URLs', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'Orig' }).expect(201)
    ).body.slug as string;
    const cover = 'http://localhost:3999/uploads/quiz-cover/' + slug + '/x.png';
    await prisma.quiz.update({ where: { slug }, data: { coverImageUrl: cover } });
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        title: 'Orig',
        type: 'standard',
        language: 'fr',
        coverImageUrl: cover,
        questions: [oneQuestion()],
      })
      .expect(200);

    const dupRes = await authed(request(app).post(`/api/quizzes/${slug}/duplicate`), token).expect(
      201,
    );
    const newSlug = dupRes.body.slug as string;
    expect(newSlug).not.toBe(slug);
    expect(dupRes.body.title).toBe('Orig (copie)');
    expect(dupRes.body.status).toBe('draft');
    expect(dupRes.body.coverImageUrl).toBe(cover);
  });
});

describe('quiz delete', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('409 when sessions exist', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const { screenId } = await minimalCinemaAndScreen();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'Del' }).expect(201)
    ).body.slug as string;
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    await prisma.session.create({
      data: {
        slugShort: nanoid(10),
        quizId: quiz!.id,
        screenId,
        state: 'lobby',
      },
    });
    await authed(request(app).delete(`/api/quizzes/${slug}`), token).expect(409);
  });

  it('204 when no sessions', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'OkDel' }).expect(201)
    ).body.slug as string;
    await authed(request(app).delete(`/api/quizzes/${slug}`), token).expect(204);
  });
});
