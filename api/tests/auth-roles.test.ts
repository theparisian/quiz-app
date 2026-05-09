import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { authed, getIntegrationApp, truncateQuizRelatedTables } from './helpers/integration.js';

describe('auth roles — magic link access (integration)', () => {
  let app: ReturnType<typeof getIntegrationApp>;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    await prisma.user.deleteMany({ where: { email: { endsWith: '@auth-role-test.local' } } });
    app = getIntegrationApp();
  });

  it('projectionist can request + verify magic link', async () => {
    const cinema = await prisma.cinema.create({
      data: { slug: `tmp-auth-${Date.now()}`, name: 'Auth Cinema', status: 'trial' },
    });
    const user = await prisma.user.create({
      data: {
        email: `proj@auth-role-test.local`,
        role: 'projectionist',
        cinemaId: cinema.id,
        displayName: 'Proj Test',
      },
    });

    await request(app).post('/api/auth/magic-link/request').send({ email: user.email }).expect(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.magicLinkToken).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/magic-link/verify')
      .send({ token: updated!.magicLinkToken })
      .expect(200);

    expect(res.body.user.role).toBe('projectionist');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('cinema_admin can request + verify magic link', async () => {
    const cinema = await prisma.cinema.create({
      data: { slug: `tmp-ca-${Date.now()}`, name: 'CA Cinema', status: 'trial' },
    });
    const user = await prisma.user.create({
      data: {
        email: `ca@auth-role-test.local`,
        role: 'cinema_admin',
        cinemaId: cinema.id,
        displayName: 'CA Test',
      },
    });

    await request(app).post('/api/auth/magic-link/request').send({ email: user.email }).expect(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.magicLinkToken).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/magic-link/verify')
      .send({ token: updated!.magicLinkToken })
      .expect(200);

    expect(res.body.user.role).toBe('cinema_admin');
  });

  it('player cannot get a magic link (token stays null)', async () => {
    await prisma.user.create({
      data: {
        email: `player@auth-role-test.local`,
        role: 'player',
        displayName: 'Player Test',
      },
    });

    await request(app)
      .post('/api/auth/magic-link/request')
      .send({ email: 'player@auth-role-test.local' })
      .expect(200);

    const updated = await prisma.user.findFirst({
      where: { email: 'player@auth-role-test.local' },
    });
    expect(updated?.magicLinkToken).toBeNull();
  });

  it('projectionist can access GET /api/users/me with cinemaSlug', async () => {
    const cinema = await prisma.cinema.create({
      data: { slug: `tmp-me-${Date.now()}`, name: 'My Cinema', status: 'trial' },
    });
    const user = await prisma.user.create({
      data: {
        email: `proj-me@auth-role-test.local`,
        role: 'projectionist',
        cinemaId: cinema.id,
        displayName: 'Proj Me',
      },
    });
    const token = await signJwt({
      userId: user.id.toString(),
      role: 'projectionist',
      cinemaId: cinema.id.toString(),
    });

    const res = await authed(request(app).get('/api/users/me'), token).expect(200);

    expect(res.body.role).toBe('projectionist');
    expect(res.body.cinemaSlug).toBe(cinema.slug);
    expect(res.body.cinemaName).toBe('My Cinema');
  });

  it('projectionist can access GET /api/sessions/:id/full', async () => {
    const cinema = await prisma.cinema.create({
      data: { slug: `tmp-full-${Date.now()}`, name: 'Full Cinema', status: 'trial' },
    });
    const screen = await prisma.screen.create({
      data: { cinemaId: cinema.id, name: 'S1', status: 'active' },
    });
    const admin = await prisma.user.create({
      data: {
        email: `admin-full-${Date.now()}@auth-role-test.local`,
        role: 'super_admin',
        displayName: 'Admin',
      },
    });
    const quiz = await prisma.quiz.create({
      data: {
        slug: `quiz-full-${Date.now()}`,
        title: 'Full Quiz',
        status: 'published',
        createdByUserId: admin.id,
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

    const adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
    const createRes = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug: quiz.slug, screenId: screen.id.toString() })
      .expect(201);

    const proj = await prisma.user.create({
      data: {
        email: `proj-full-${Date.now()}@auth-role-test.local`,
        role: 'projectionist',
        cinemaId: cinema.id,
        displayName: 'Proj',
      },
    });
    const projToken = await signJwt({
      userId: proj.id.toString(),
      role: 'projectionist',
      cinemaId: cinema.id.toString(),
    });

    const res = await authed(
      request(app).get(`/api/sessions/${createRes.body.id}/full`),
      projToken,
    ).expect(200);

    expect(res.body.quiz).toBeDefined();
    expect(res.body.quiz.questions).toHaveLength(1);
    expect(res.body.quiz.questions[0].answers).toBeDefined();
    expect(
      res.body.quiz.questions[0].answers.some((a: { isCorrect: boolean }) => a.isCorrect),
    ).toBe(true);
    expect(res.body.players).toBeDefined();
  });
});
