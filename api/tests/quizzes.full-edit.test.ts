import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

const qSkeleton = () => ({
  position: 0,
  text: 'Question',
  timeLimitSeconds: 20,
  pointsMax: 1000,
  pointsFloor: 500,
  answers: [
    { position: 'A', text: 'ok', isCorrect: true },
    { position: 'B', text: 'bad', isCorrect: false },
  ],
});

describe('saveFullEdit', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('draft: add/remove questions', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'FE' }).expect(201)
    ).body.slug as string;

    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        title: 'FE',
        type: 'standard',
        language: 'fr',
        questions: [
          { ...qSkeleton(), position: 0, text: 'Q1' },
          { ...qSkeleton(), position: 1, text: 'Q2' },
        ],
      })
      .expect(200);

    let quiz = await prisma.quiz.findUnique({
      where: { slug },
      include: { questions: true },
    });
    expect(quiz?.questions.length).toBe(2);

    const qKeep = quiz!.questions[0];
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        title: 'FE',
        type: 'standard',
        language: 'fr',
        questions: [{ ...qSkeleton(), id: qKeep!.id.toString(), position: 0, text: 'Q1b' }],
      })
      .expect(200);
    quiz = await prisma.quiz.findUnique({
      where: { slug },
      include: { questions: true },
    });
    expect(quiz?.questions.length).toBe(1);
    expect(quiz!.questions[0]!.text).toBe('Q1b');
  });

  it('published: rejects extra question in payload', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const slug = (
      await authed(request(app).post('/api/quizzes'), token).send({ title: 'Pub' }).expect(201)
    ).body.slug as string;
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        title: 'Pub',
        type: 'standard',
        language: 'fr',
        questions: [{ ...qSkeleton(), position: 0 }],
      })
      .expect(200);
    await authed(request(app).post(`/api/quizzes/${slug}/publish`), token).expect(200);

    const apiQuiz = (await authed(request(app).get(`/api/quizzes/${slug}`), token).expect(200))
      .body as {
      title: string;
      description: string | null;
      type: string;
      sponsorId: string | null;
      language: string;
      durationEstimateSeconds: number | null;
      brandingJson: unknown;
      coverImageUrl: string | null;
      questions: {
        id: string;
        position: number;
        text: string;
        imageUrl: string | null;
        timeLimitSeconds: number;
        pointsMax: number;
        pointsFloor: number;
        explanation: string | null;
        answers: {
          id: string;
          position: string;
          text: string;
          isCorrect: boolean;
        }[];
      }[];
    };

    const savePayload = {
      title: apiQuiz.title,
      description: apiQuiz.description,
      type: apiQuiz.type,
      sponsorId: apiQuiz.sponsorId,
      language: apiQuiz.language,
      durationEstimateSeconds: apiQuiz.durationEstimateSeconds,
      brandingJson:
        apiQuiz.brandingJson === null ? null : (apiQuiz.brandingJson as Record<string, unknown>),
      coverImageUrl: apiQuiz.coverImageUrl ?? undefined,
      questions: [
        ...apiQuiz.questions.map((qq) => ({
          id: qq.id,
          position: qq.position,
          text: qq.text,
          imageUrl: qq.imageUrl ?? undefined,
          timeLimitSeconds: qq.timeLimitSeconds,
          pointsMax: qq.pointsMax,
          pointsFloor: qq.pointsFloor,
          explanation: qq.explanation,
          answers: qq.answers.map((a) => ({
            id: a.id,
            position: a.position as 'A' | 'B' | 'C' | 'D',
            text: a.text,
            isCorrect: a.isCorrect,
          })),
        })),
        { ...qSkeleton(), position: apiQuiz.questions.length, text: 'intrus' },
      ],
    };

    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send(savePayload)
      .expect(403);
  });
});
