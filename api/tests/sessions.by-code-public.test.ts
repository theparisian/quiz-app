import request from 'supertest';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
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
  let quizSlug: string;
  let screenId: bigint;
  let sessionId: string;

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
    sessionId = res.body.id;
    quizSlug = quiz.slug;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('reuses the code of an ended session: creation succeeds, by-code and join target the new session', async () => {
    await prisma.session.update({
      where: { id: BigInt(sessionId) },
      data: { state: 'ended', endedAt: new Date() },
    });
    // Premier tirage forcé sur le code de la séance terminée.
    vi.spyOn(Math, 'random').mockReturnValueOnce((Number(slugShort) - 1000 + 0.5) / 9000);

    const res = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug, screenId: screenId.toString() })
      .expect(201);
    expect(res.body.slugShort).toBe(slugShort);
    expect(res.body.id).not.toBe(sessionId);

    const byCode = await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(200);
    expect(byCode.body.sessionId).toBe(res.body.id);
    expect(byCode.body.state).toBe('lobby');

    const join = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: slugShort, pseudo: 'Alice' })
      .expect(201);
    const player = await prisma.player.findFirstOrThrow({ where: { pseudo: 'Alice' } });
    expect(player.sessionId.toString()).toBe(res.body.id);
    expect(join.body.player.pseudo).toBe('Alice');

    await request(app).get(`/api/sessions/by-code/${slugShort}/pseudo-suggestions`).expect(200);
  });

  it('prefers the active session even when a newer ended session shares the code', async () => {
    await prisma.session.create({
      data: {
        slugShort,
        screenId,
        state: 'ended',
        endedAt: new Date(),
        totalPlayers: 0,
        createdAt: new Date(Date.now() + 60_000),
      },
    });

    const byCode = await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(200);
    expect(byCode.body.sessionId).toBe(sessionId);
    expect(byCode.body.state).toBe('lobby');

    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: slugShort, pseudo: 'Bob' })
      .expect(201);
  });

  it('still serves the latest ended session when no active session has the code', async () => {
    await prisma.session.update({
      where: { id: BigInt(sessionId) },
      data: { state: 'ended', endedAt: new Date() },
    });
    const older = await prisma.session.create({
      data: {
        slugShort,
        screenId,
        state: 'aborted',
        endedAt: new Date(),
        totalPlayers: 0,
        createdAt: new Date(Date.now() - 86_400_000),
      },
    });

    const byCode = await request(app).get(`/api/sessions/by-code/${slugShort}`).expect(200);
    expect(byCode.body.sessionId).toBe(sessionId);
    expect(byCode.body.sessionId).not.toBe(older.id.toString());
    expect(byCode.body.state).toBe('ended');

    const join = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: slugShort, pseudo: 'Carol' })
      .expect(409);
    expect(join.body.error?.code ?? join.body.code).toBe('SESSION_FINISHED');
  });
});
