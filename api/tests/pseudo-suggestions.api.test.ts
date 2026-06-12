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
import {
  checkPseudoSuggestionsRateLimit,
  resetPseudoSuggestionsRateLimitForTests,
} from '../src/shared/rate-limit/pseudo-suggestions.rate-limit.js';

describe('pseudo-suggestions API', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let adminToken: string;
  let sessionSlugShort: string;

  beforeEach(async () => {
    resetPseudoSuggestionsRateLimitForTests();
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

    const createRes = await authed(request(app).post('/api/sessions'), adminToken)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);

    sessionSlugShort = createRes.body.slugShort;
  });

  it('returns 3 suggestions for valid session', async () => {
    const res = await request(app)
      .get(`/api/sessions/by-code/${sessionSlugShort}/pseudo-suggestions`)
      .expect(200);

    expect(res.body.suggestions).toHaveLength(3);
  });

  it('returns 404 for unknown code', async () => {
    await request(app).get('/api/sessions/by-code/9999/pseudo-suggestions').expect(404);
  });

  it('returns 404 when session ended', async () => {
    const session = await prisma.session.findFirst({ where: { slugShort: sessionSlugShort } });
    await prisma.session.update({
      where: { id: session!.id },
      data: { state: 'ended', endedAt: new Date() },
    });

    await request(app)
      .get(`/api/sessions/by-code/${sessionSlugShort}/pseudo-suggestions`)
      .expect(404);
  });

  it('rate limits repeated requests', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .get(`/api/sessions/by-code/${sessionSlugShort}/pseudo-suggestions`)
        .expect(200);
    }

    await request(app)
      .get(`/api/sessions/by-code/${sessionSlugShort}/pseudo-suggestions`)
      .expect(429);

    const unit = checkPseudoSuggestionsRateLimit('unit-test');
    expect(unit.allowed).toBe(true);
  });
});

describe('join pseudoSource persistence', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let sessionSlugShort: string;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();

    const { user, token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `q-${Date.now()}`,
        title: 'PQ',
        status: 'published',
        createdByUserId: user.id,
      },
    });

    const createRes = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);

    sessionSlugShort = createRes.body.slugShort;
  });

  it('persists SUGGESTED pseudoSource', async () => {
    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'PopcornFurtif', pseudoSource: 'SUGGESTED' })
      .expect(201);

    const player = await prisma.player.findFirst({ where: { pseudo: 'PopcornFurtif' } });
    expect(player?.pseudoSource).toBe('SUGGESTED');
  });

  it('defaults to CUSTOM when pseudoSource omitted', async () => {
    await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort, pseudo: 'Alice' })
      .expect(201);

    const player = await prisma.player.findFirst({ where: { pseudo: 'Alice' } });
    expect(player?.pseudoSource).toBe('CUSTOM');
  });
});
