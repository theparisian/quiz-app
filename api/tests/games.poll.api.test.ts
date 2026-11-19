import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

/** /api/games (B6) : création, modification et publication d'un sondage. */

const CONFIG = {
  questions: [
    {
      id: 'q1',
      text: 'Film préféré ?',
      options: [
        { id: 'a', text: 'Alien' },
        { id: 'b', text: 'Brazil' },
      ],
    },
  ],
};

describe('games REST: poll', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let token: string;
  let userId: bigint;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();
    const admin = await createSuperAdminUser();
    token = admin.token;
    userId = admin.user.id;
  });

  const create = (body: unknown) => authed(request(app).post('/api/games'), token).send(body);

  it('creates a draft poll with defaults, slug from the title, duration estimate', async () => {
    const res = await create({ engineKey: 'poll', title: 'Sondage d’été', configJson: CONFIG });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      slug: 'sondage-d-ete',
      title: 'Sondage d’été',
      engineKey: 'poll',
      kind: 'internal',
      status: 'draft',
      quizId: null,
      // 20 s de vote + 6 s de résultats (valeurs par défaut).
      durationEstimateSeconds: 26,
      configJson: {
        participationPoints: 300,
        resultsSeconds: 6,
        questions: [{ id: 'q1', durationSeconds: 20 }],
      },
    });
    // Même titre : suffixe.
    const again = await create({ engineKey: 'poll', title: 'Sondage d’été', configJson: CONFIG });
    expect(again.body.slug).toBe('sondage-d-ete-2');

    const got = await authed(request(app).get('/api/games/sondage-d-ete'), token).expect(200);
    expect(got.body.configJson.questions).toHaveLength(1);
    const list = await authed(request(app).get('/api/games?engineKey=poll'), token).expect(200);
    expect(list.body).toMatchObject({ total: 2, page: 1 });
  });

  it('refuses the quiz engine, an unknown engine and an invalid configuration', async () => {
    const quiz = await create({ engineKey: 'quiz', title: 'Un quiz', configJson: CONFIG });
    expect(quiz.status).toBe(400);
    expect(quiz.body.error.code).toBe('GAME_MANAGED_BY_QUIZ');
    const other = await create({ engineKey: 'bingo', title: 'Bingo', configJson: CONFIG });
    expect(other.body.error.code).toBe('GAME_NOT_SUPPORTED_YET');

    const oneOption = {
      questions: [{ id: 'q1', text: 'Q ?', options: [{ id: 'a', text: 'A' }] }],
    };
    for (const configJson of [
      oneOption,
      { questions: [] },
      { ...CONFIG, participationPoints: 5000 },
      { questions: [{ ...CONFIG.questions[0], durationSeconds: 61 }] },
      { questions: [CONFIG.questions[0], CONFIG.questions[0]] },
    ]) {
      const res = await create({ engineKey: 'poll', title: 'Sondage', configJson });
      expect(res.status, JSON.stringify(configJson)).toBe(400);
      expect(res.body.error.code).toBe('POLL_CONFIG_INVALID');
    }
    expect(await prisma.game.count()).toBe(0);
  });

  it('409 SLUG_TAKEN for a slug used by a quiz or a game', async () => {
    await prisma.quiz.create({
      data: { slug: 'pris-par-quiz', title: 'Q', createdByUserId: userId },
    });
    const byQuiz = await create({
      engineKey: 'poll',
      title: 'Sondage',
      slug: 'pris-par-quiz',
      configJson: CONFIG,
    });
    expect(byQuiz.status).toBe(409);
    expect(byQuiz.body.error.code).toBe('SLUG_TAKEN');

    await create({
      engineKey: 'poll',
      title: 'Sondage',
      slug: 'mon-sondage',
      configJson: CONFIG,
    }).expect(201);
    const byGame = await create({
      engineKey: 'poll',
      title: 'Sondage',
      slug: 'mon-sondage',
      configJson: CONFIG,
    });
    expect(byGame.status).toBe(409);
    expect(byGame.body.error.code).toBe('SLUG_TAKEN');

    // Chemin de l'admin réservé.
    const reserved = await create({
      engineKey: 'poll',
      title: 'Sondage',
      slug: 'new-poll',
      configJson: CONFIG,
    });
    expect(reserved.body.error.code).toBe('SLUG_TAKEN');
  });

  it('PATCH title and content; publish; content locked while scheduled', async () => {
    const created = await create({ engineKey: 'poll', title: 'Avant', configJson: CONFIG });
    const slug = created.body.slug as string;

    const newConfig = {
      ...CONFIG,
      resultsSeconds: 10,
      questions: [{ ...CONFIG.questions[0], durationSeconds: 30 }],
    };
    const patched = await authed(request(app).patch(`/api/games/${slug}`), token)
      .send({ title: 'Après', configJson: newConfig })
      .expect(200);
    expect(patched.body).toMatchObject({ title: 'Après', durationEstimateSeconds: 40 });
    expect(patched.body.configJson.resultsSeconds).toBe(10);

    const invalid = await authed(request(app).patch(`/api/games/${slug}`), token).send({
      configJson: { questions: [] },
    });
    expect(invalid.body.error.code).toBe('POLL_CONFIG_INVALID');
    const empty = await authed(request(app).patch(`/api/games/${slug}`), token).send({});
    expect(empty.status).toBe(400);

    const published = await authed(request(app).post(`/api/games/${slug}/publish`), token).expect(
      200,
    );
    expect(published.body.status).toBe('published');
    const twice = await authed(request(app).post(`/api/games/${slug}/publish`), token);
    expect(twice.status).toBe(403);
    expect(twice.body.error.code).toBe('GAME_INVALID_TRANSITION');

    // Programmé dans une séance : le contenu ne change plus, le titre si.
    const infra = await minimalCinemaAndScreen();
    await authed(request(app).post('/api/sessions'), token)
      .send({ gameSlugs: [slug], screenId: infra.screenId.toString() })
      .expect(201);
    const locked = await authed(request(app).patch(`/api/games/${slug}`), token).send({
      configJson: CONFIG,
    });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('GAME_IN_USE');
    await authed(request(app).patch(`/api/games/${slug}`), token)
      .send({ title: 'Renommé' })
      .expect(200);
  });

  it('quiz games are not editable here; routes are super_admin only', async () => {
    const quiz = await prisma.quiz.create({
      data: { slug: 'un-quiz', title: 'Q', createdByUserId: userId },
    });
    await prisma.game.create({
      data: { slug: 'un-quiz', title: 'Q', engineKey: 'quiz', quizId: quiz.id },
    });
    const res = await authed(request(app).patch('/api/games/un-quiz'), token).send({
      title: 'Xy',
    });
    expect(res.body.error.code).toBe('GAME_MANAGED_BY_QUIZ');
    const pub = await authed(request(app).post('/api/games/un-quiz/publish'), token);
    expect(pub.body.error.code).toBe('GAME_MANAGED_BY_QUIZ');
    await authed(request(app).get('/api/games/absent'), token).expect(404);

    const infra = await minimalCinemaAndScreen();
    const cinema = await prisma.cinema.findUniqueOrThrow({ where: { slug: infra.cinemaSlug } });
    const { token: staff } = await createCinemaUser('cinema_admin', cinema.id);
    await authed(request(app).post('/api/games'), staff)
      .send({ engineKey: 'poll', title: 'Sondage', configJson: CONFIG })
      .expect(403);
    await authed(request(app).get('/api/games'), staff).expect(403);
    await request(app).get('/api/games').expect(401);
  });
});
