import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
  minimalCinemaAndScreen,
} from './helpers/integration.js';

describe('sessions API (integration)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let adminToken: string;
  let screenId: bigint;
  let quizSlug: string;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();

    const { user, token } = await createSuperAdminUser();
    adminToken = token;

    const infra = await minimalCinemaAndScreen();
    screenId = infra.screenId;

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
    quizSlug = quiz.slug;
  });

  it('creates a session (super_admin)', async () => {
    const res = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug, screenId: screenId.toString() })
      .expect(201);

    expect(res.body.slugShort).toMatch(/^\d{4}$/);
    expect(res.body.state).toBe('lobby');
    expect(res.body.quizTitle).toBe('Test Quiz');
  });

  it('rejects creation for unpublished quiz', async () => {
    const quiz2 = await prisma.quiz.create({
      data: {
        slug: `draft-${Date.now()}`,
        title: 'Draft',
        status: 'draft',
        createdByUserId: (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!.id,
      },
    });

    await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug: quiz2.slug, screenId: screenId.toString() })
      .expect(400);
  });

  it('rejects creation if screen has active session', async () => {
    await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug, screenId: screenId.toString() })
      .expect(201);

    await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug, screenId: screenId.toString() })
      .expect(409);
  });

  it('403 for projectionist on another cinema', async () => {
    const otherCinema = await prisma.cinema.create({
      data: { slug: `tmp-other-${Date.now()}`, name: 'Other', status: 'trial' },
    });
    const proj = await prisma.user.create({
      data: {
        email: `proj-${Date.now()}@test.local`,
        role: 'projectionist',
        cinemaId: otherCinema.id,
        displayName: 'Proj',
      },
    });
    const projToken = await signJwt({
      userId: proj.id.toString(),
      role: 'projectionist',
      cinemaId: otherCinema.id.toString(),
    });

    // The screen belongs to another cinema: the tenant scope refuses the creation.
    const res = await authed(request(app).post('/api/sessions'), projToken)
      .send({ quizSlug, screenId: screenId.toString() })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /sessions/by-code/:slugShort is public', async () => {
    const createRes = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug, screenId: screenId.toString() })
      .expect(201);

    const res = await request(app)
      .get(`/api/sessions/by-code/${createRes.body.slugShort}`)
      .expect(200);

    expect(res.body.slugShort).toBe(createRes.body.slugShort);
    expect(res.body.state).toBe('lobby');
    expect(res.body.quiz.title).toBe('Test Quiz');
    expect(res.body.cinema.name).toBeDefined();
    expect(res.body.totalPlayers).toBe(0);
  });

  it('POST /sessions/:id/abort transitions to aborted', async () => {
    const createRes = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug, screenId: screenId.toString() })
      .expect(201);

    await authed(request(app).post(`/api/sessions/${createRes.body.id}/abort`), adminToken)
      .send({ reason: 'test' })
      .expect(200);

    const session = await prisma.session.findUnique({
      where: { id: BigInt(createRes.body.id) },
    });
    expect(session?.state).toBe('aborted');
  });
});
