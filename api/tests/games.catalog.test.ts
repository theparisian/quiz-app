import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { gamesService } from '../src/modules/games/games.service.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  resetStorage,
  truncateSponsorsAndQuizzes,
} from './helpers/integration.js';

/** C1 : catalogue des jeux (super_admin) et lecture par les cinémas. */

const POLL_CONFIG = {
  questions: ['Film préféré ?', 'Saga préférée ?', 'Acteur préféré ?', 'Snack préféré ?'].map(
    (text, i) => ({
      id: `q${i + 1}`,
      text,
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
      ],
    }),
  ),
};

interface CinemaFixture {
  id: bigint;
  slug: string;
  screenId: bigint;
}

async function cinemaFixture(): Promise<CinemaFixture> {
  const infra = await minimalCinemaAndScreen();
  const cinema = await prisma.cinema.findUniqueOrThrow({ where: { slug: infra.cinemaSlug } });
  return { id: cinema.id, slug: cinema.slug, screenId: infra.screenId };
}

describe('games catalogue (C1)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let superToken: string;
  let userId: bigint;
  let a: CinemaFixture;
  let b: CinemaFixture;
  let projA: string;
  let adminA: string;

  beforeEach(async () => {
    await truncateSponsorsAndQuizzes();
    await resetStorage();
    app = getIntegrationApp();
    const sa = await createSuperAdminUser();
    superToken = sa.token;
    userId = sa.user.id;
    a = await cinemaFixture();
    b = await cinemaFixture();
    projA = (await createCinemaUser('projectionist', a.id)).token;
    adminA = (await createCinemaUser('cinema_admin', a.id)).token;
  });

  /** Quiz publié (4 questions) et son jeu, avec les options de catalogue données. */
  async function quizGame(
    slug: string,
    game: { catalogEnabled?: boolean; audience?: 'all_cinemas' | 'selected_cinemas' } = {},
  ) {
    const quiz = await prisma.quiz.create({
      data: { slug, title: `Quiz ${slug}`, status: 'published', createdByUserId: userId },
    });
    for (let position = 1; position <= 4; position += 1) {
      await prisma.question.create({
        data: {
          quizId: quiz.id,
          position,
          text: `Question ${position} ?`,
          answers: {
            create: [
              { position: 'A', text: `Bonne ${position}`, isCorrect: true },
              { position: 'B', text: `Mauvaise ${position}`, isCorrect: false },
            ],
          },
        },
      });
    }
    await gamesService.syncGameFromQuiz(quiz.id);
    return prisma.game.update({
      where: { slug },
      data: { catalogEnabled: game.catalogEnabled ?? true, audience: game.audience },
    });
  }

  async function pollGame(slug: string, data: Record<string, unknown> = {}) {
    return prisma.game.create({
      data: {
        slug,
        title: `Sondage ${slug}`,
        engineKey: 'poll',
        status: 'published',
        catalogEnabled: true,
        configJson: POLL_CONFIG,
        durationEstimateSeconds: 104,
        ...data,
      },
    });
  }

  it('availability: published + in catalogue + (all cinemas or listed cinema)', async () => {
    const all = await pollGame('pour-tous');
    const draft = await pollGame('brouillon', { status: 'draft' });
    const off = await pollGame('hors-catalogue', { catalogEnabled: false });
    const selected = await pollGame('reserve', { audience: 'selected_cinemas' });
    await prisma.gameCinemaAccess.create({ data: { gameId: selected.id, cinemaId: a.id } });

    expect(await gamesService.isAvailableForCinema(all.id, a.id)).toBe(true);
    expect(await gamesService.isAvailableForCinema(draft.id, a.id)).toBe(false);
    expect(await gamesService.isAvailableForCinema(off.id, a.id)).toBe(false);
    expect(await gamesService.isAvailableForCinema(selected.id, a.id)).toBe(true);
    expect(await gamesService.isAvailableForCinema(selected.id, b.id)).toBe(false);
  });

  it('GET /api/catalog lists the games available to the cinema, with filters', async () => {
    await quizGame('quiz-pour-tous');
    await pollGame('sondage-pour-tous', { tagline: 'Votez !', tags: ['fun'] });
    await pollGame('sondage-off', { catalogEnabled: false });
    const reserved = await pollGame('sondage-de-b', { audience: 'selected_cinemas' });
    await prisma.gameCinemaAccess.create({ data: { gameId: reserved.id, cinemaId: b.id } });

    const resA = await authed(request(app).get(`/api/catalog?cinemaSlug=${a.slug}`), projA).expect(
      200,
    );
    expect(resA.body.items.map((g: { slug: string }) => g.slug).sort()).toEqual([
      'quiz-pour-tous',
      'sondage-pour-tous',
    ]);
    const poll = resA.body.items.find((g: { slug: string }) => g.slug === 'sondage-pour-tous');
    expect(poll).toEqual({
      slug: 'sondage-pour-tous',
      title: 'Sondage sondage-pour-tous',
      tagline: 'Votez !',
      coverImageUrl: null,
      engineKey: 'poll',
      kind: 'internal',
      sponsor: null,
      durationEstimateSeconds: 104,
      tags: ['fun'],
    });

    const bToken = (await createCinemaUser('cinema_admin', b.id)).token;
    const resB = await authed(request(app).get(`/api/catalog?cinemaSlug=${b.slug}`), bToken);
    expect(resB.body.items).toHaveLength(3);

    const polls = await authed(
      request(app).get(`/api/catalog?cinemaSlug=${a.slug}&engineKey=poll`),
      adminA,
    );
    expect(polls.body.items.map((g: { slug: string }) => g.slug)).toEqual(['sondage-pour-tous']);
    const search = await authed(
      request(app).get(`/api/catalog?cinemaSlug=${a.slug}&search=quiz-pour`),
      superToken,
    );
    expect(search.body.items.map((g: { slug: string }) => g.slug)).toEqual(['quiz-pour-tous']);
    const sponsored = await authed(
      request(app).get(`/api/catalog?cinemaSlug=${a.slug}&kind=sponsored`),
      adminA,
    );
    expect(sponsored.body.items).toEqual([]);
  });

  it('detail: content summary without correct answers nor raw configuration', async () => {
    const sponsor = await prisma.sponsor.create({
      data: { name: 'Pop Corp', slug: 'pop-corp', logoUrl: 'http://x/logo.png' },
    });
    await quizGame('quiz-fiche');
    await prisma.game.update({
      where: { slug: 'quiz-fiche' },
      data: { rulesText: 'Répondez vite.', kind: 'sponsored', sponsorId: sponsor.id },
    });
    await pollGame('sondage-fiche');

    const quiz = await authed(
      request(app).get(`/api/catalog/quiz-fiche?cinemaSlug=${a.slug}`),
      projA,
    ).expect(200);
    expect(quiz.body).toMatchObject({
      slug: 'quiz-fiche',
      rulesText: 'Répondez vite.',
      kind: 'sponsored',
      sponsor: { name: 'Pop Corp', logoUrl: 'http://x/logo.png' },
      contentSummary: {
        questionsCount: 4,
        sampleQuestions: ['Question 1 ?', 'Question 2 ?', 'Question 3 ?'],
      },
    });
    const raw = JSON.stringify(quiz.body);
    expect(raw).not.toContain('isCorrect');
    expect(raw).not.toContain('Bonne');
    expect(raw).not.toContain('configJson');

    const poll = await authed(
      request(app).get(`/api/catalog/sondage-fiche?cinemaSlug=${a.slug}`),
      projA,
    ).expect(200);
    expect(poll.body.contentSummary).toEqual({
      questionsCount: 4,
      sampleQuestions: ['Film préféré ?', 'Saga préférée ?', 'Acteur préféré ?'],
    });
    expect(JSON.stringify(poll.body)).not.toContain('Option A');
    expect(poll.body).not.toHaveProperty('configJson');

    // Jeu non disponible : 404, comme un jeu absent.
    await pollGame('sondage-cache', { catalogEnabled: false });
    await authed(request(app).get(`/api/catalog/sondage-cache?cinemaSlug=${a.slug}`), projA).expect(
      404,
    );
  });

  it("refuses another cinema's catalogue, and requires authentication", async () => {
    await pollGame('sondage');
    const list = await authed(request(app).get(`/api/catalog?cinemaSlug=${b.slug}`), projA);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');
    await authed(request(app).get(`/api/catalog/sondage?cinemaSlug=${b.slug}`), adminA).expect(403);
    await authed(request(app).get('/api/catalog/sondage?cinemaSlug=absent'), superToken).expect(
      404,
    );
    await authed(request(app).get('/api/catalog'), projA).expect(400);
    await request(app).get(`/api/catalog?cinemaSlug=${a.slug}`).expect(401);
  });

  it('session creation refuses a game that is not available to the cinema (403)', async () => {
    await quizGame('quiz-off', { catalogEnabled: false });
    await pollGame('sondage-on');
    const reserved = await pollGame('sondage-de-b', { audience: 'selected_cinemas' });
    await prisma.gameCinemaAccess.create({ data: { gameId: reserved.id, cinemaId: b.id } });
    const screenId = a.screenId.toString();
    const post = (token: string, body: Record<string, unknown>) =>
      authed(request(app).post('/api/sessions'), token).send({ ...body, screenId });

    for (const body of [
      { gameSlugs: ['sondage-on', 'quiz-off'] },
      { quizSlug: 'quiz-off' },
      { gameSlugs: ['sondage-de-b'] },
    ]) {
      const res = await post(projA, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.body.error.code).toBe('GAME_NOT_AVAILABLE');
    }
    expect(await prisma.session.count()).toBe(0);

    // super_admin n'est pas soumis au catalogue.
    const asSuper = await post(superToken, { gameSlugs: ['quiz-off'] }).expect(201);
    await authed(request(app).post(`/api/sessions/${asSuper.body.id}/abort`), superToken)
      .send({})
      .expect(200);
    // Jeu disponible : accepté.
    await post(adminA, { gameSlugs: ['sondage-on'] }).expect(201);
  });

  it('/api/games routes are forbidden to cinema roles', async () => {
    await pollGame('sondage');
    for (const token of [projA, adminA]) {
      await authed(request(app).get('/api/games'), token).expect(403);
      await authed(request(app).get('/api/games/sondage'), token).expect(403);
      await authed(request(app).patch('/api/games/sondage'), token)
        .send({ tagline: 'X' })
        .expect(403);
      await authed(request(app).post('/api/games/sondage/enable'), token).expect(403);
      await authed(request(app).post('/api/games/sondage/disable'), token).expect(403);
      await authed(request(app).delete('/api/games/sondage/cover'), token).expect(403);
    }
    expect((await prisma.game.findUniqueOrThrow({ where: { slug: 'sondage' } })).tagline).toBe(
      null,
    );
  });

  it('super_admin: list filters, enable/disable, catalogue fields, audience and cinemas', async () => {
    await quizGame('quiz-a', { catalogEnabled: false });
    await pollGame('sondage-b');
    await pollGame('sondage-brouillon', { status: 'draft', catalogEnabled: false });
    const get = (q: string) =>
      authed(request(app).get(`/api/games${q}`), superToken)
        .expect(200)
        .then((r) => r.body.items.map((g: { slug: string }) => g.slug).sort());

    expect(await get('?catalogEnabled=false')).toEqual(['quiz-a', 'sondage-brouillon']);
    expect(await get('?catalogEnabled=true')).toEqual(['sondage-b']);
    expect(await get('?status=draft')).toEqual(['sondage-brouillon']);
    expect(await get('?engineKey=quiz')).toEqual(['quiz-a']);
    expect(await get('?search=brouillon')).toEqual(['sondage-brouillon']);
    expect(await get('?kind=sponsored')).toEqual([]);
    const page = await authed(request(app).get('/api/games?limit=2&page=2'), superToken);
    expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(page.body.items).toHaveLength(1);

    const enabled = await authed(request(app).post('/api/games/quiz-a/enable'), superToken).expect(
      200,
    );
    expect(enabled.body.catalogEnabled).toBe(true);
    await authed(request(app).post('/api/games/sondage-b/disable'), superToken).expect(200);
    expect(await get('?catalogEnabled=true')).toEqual(['quiz-a']);

    // Champs du catalogue sur un sondage.
    const sponsor = await prisma.sponsor.create({ data: { name: 'Pop', slug: 'pop' } });
    const missing = await authed(request(app).patch('/api/games/sondage-b'), superToken).send({
      kind: 'sponsored',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('SPONSOR_REQUIRED');
    const patched = await authed(request(app).patch('/api/games/sondage-b'), superToken)
      .send({
        tagline: 'Le public décide',
        rulesText: 'Votez avec votre téléphone.',
        kind: 'sponsored',
        sponsorId: sponsor.id.toString(),
        audience: 'selected_cinemas',
        cinemaIds: [a.id.toString(), a.id.toString()],
        tags: ['famille', 'famille', 'rapide'],
        minPlayers: 5,
        durationEstimateSeconds: 300,
      })
      .expect(200);
    expect(patched.body).toMatchObject({
      tagline: 'Le public décide',
      rulesText: 'Votez avec votre téléphone.',
      kind: 'sponsored',
      sponsor: { id: sponsor.id.toString(), name: 'Pop' },
      audience: 'selected_cinemas',
      cinemas: [{ id: a.id.toString(), slug: a.slug }],
      tags: ['famille', 'rapide'],
      minPlayers: 5,
      durationEstimateSeconds: 300,
    });
    const noSponsor = await authed(request(app).patch('/api/games/sondage-b'), superToken).send({
      sponsorId: null,
    });
    expect(noSponsor.body.error.code).toBe('SPONSOR_REQUIRED');
    const unknownCinema = await authed(request(app).patch('/api/games/sondage-b'), superToken).send(
      { cinemaIds: ['999999999'] },
    );
    expect(unknownCinema.status).toBe(404);
    await authed(request(app).patch('/api/games/sondage-b'), superToken)
      .send({ cinemaIds: [b.id.toString()] })
      .expect(200);
    const detail = await authed(request(app).get('/api/games/sondage-b'), superToken).expect(200);
    expect(detail.body.cinemas.map((c: { id: string }) => c.id)).toEqual([b.id.toString()]);

    // Jeu quiz : titre, type, sponsor, durée et couverture viennent du quiz.
    for (const body of [
      { title: 'Autre' },
      { kind: 'sponsored', sponsorId: sponsor.id.toString() },
      { durationEstimateSeconds: 60 },
    ]) {
      const res = await authed(request(app).patch('/api/games/quiz-a'), superToken).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('GAME_MANAGED_BY_QUIZ');
    }
    const quizPatched = await authed(request(app).patch('/api/games/quiz-a'), superToken)
      .send({ tagline: 'Culture ciné', tags: ['ciné'], audience: 'all_cinemas' })
      .expect(200);
    expect(quizPatched.body).toMatchObject({ tagline: 'Culture ciné', tags: ['ciné'] });
    // La synchronisation depuis le quiz garde les champs du catalogue.
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { slug: 'quiz-a' } });
    await gamesService.syncGameFromQuiz(quiz.id);
    const synced = await prisma.game.findUniqueOrThrow({ where: { slug: 'quiz-a' } });
    expect(synced).toMatchObject({ tagline: 'Culture ciné', catalogEnabled: true });
  });

  it('cover upload: poll games only', async () => {
    await quizGame('quiz-cover');
    await pollGame('sondage-cover');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const up = await authed(request(app).post('/api/games/sondage-cover/cover'), superToken)
      .attach('file', png, { filename: 'c.png', contentType: 'image/png' })
      .expect(200);
    expect(up.body.coverImageUrl).toMatch(/^http:\/\/localhost:3999\/uploads\/game-cover\//);
    const removed = await authed(
      request(app).delete('/api/games/sondage-cover/cover'),
      superToken,
    ).expect(200);
    expect(removed.body.coverImageUrl).toBeNull();

    const quiz = await authed(request(app).post('/api/games/quiz-cover/cover'), superToken).attach(
      'file',
      png,
      { filename: 'c.png', contentType: 'image/png' },
    );
    expect(quiz.status).toBe(400);
    expect(quiz.body.error.code).toBe('GAME_MANAGED_BY_QUIZ');
    const del = await authed(request(app).delete('/api/games/quiz-cover/cover'), superToken);
    expect(del.body.error.code).toBe('GAME_MANAGED_BY_QUIZ');
  });
});
