import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { syncGameFromQuiz } from '../src/modules/games/games.service.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

function validQuestion() {
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
  };
}

describe('games: synchronisation depuis les quiz', () => {
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

  async function createQuiz(title: string): Promise<string> {
    const res = await authed(request(app).post('/api/quizzes'), token)
      .send({ title, description: 'Une description', durationEstimateSeconds: 180 })
      .expect(201);
    return res.body.slug as string;
  }

  async function createPublishedQuiz(title: string): Promise<string> {
    const slug = await createQuiz(title);
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({ title, type: 'standard', language: 'fr', questions: [validQuestion()] })
      .expect(200);
    await authed(request(app).post(`/api/quizzes/${slug}/publish`), token).expect(200);
    return slug;
  }

  it('création d’un quiz → un jeu lié, même slug, moteur quiz, brouillon', async () => {
    const slug = await createQuiz('Jeu lié');
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { slug } });
    const game = await prisma.game.findUnique({ where: { quizId: quiz.id } });
    expect(game).not.toBeNull();
    expect(game!.slug).toBe(slug);
    expect(game!.title).toBe('Jeu lié');
    expect(game!.description).toBe('Une description');
    expect(game!.durationEstimateSeconds).toBe(180);
    expect(game!.engineKey).toBe('quiz');
    expect(game!.kind).toBe('internal');
    expect(game!.status).toBe('draft');
  });

  it('patch, publication, dépublication, archivage, désarchivage → jeu à jour', async () => {
    const slug = await createPublishedQuiz('Cycle');
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { slug } });
    const gameStatus = async () =>
      (await prisma.game.findUniqueOrThrow({ where: { quizId: quiz.id } })).status;

    expect(await gameStatus()).toBe('published');

    await authed(request(app).patch(`/api/quizzes/${slug}`), token)
      .send({ title: 'Cycle renommé' })
      .expect(200);
    const renamed = await prisma.game.findUniqueOrThrow({ where: { quizId: quiz.id } });
    expect(renamed.title).toBe('Cycle renommé');
    expect(renamed.slug).toBe(slug);

    await authed(request(app).post(`/api/quizzes/${slug}/unpublish`), token).expect(200);
    expect(await gameStatus()).toBe('draft');
    await authed(request(app).post(`/api/quizzes/${slug}/archive`), token).expect(200);
    expect(await gameStatus()).toBe('archived');
    await authed(request(app).post(`/api/quizzes/${slug}/unarchive`), token).expect(200);
    expect(await gameStatus()).toBe('draft');
  });

  it('édition complète d’un quiz sponsorisé → jeu kind sponsored avec son sponsor', async () => {
    const sponsor = await prisma.sponsor.create({
      data: { name: 'Sponsor', slug: `sp-${Date.now()}` },
    });
    const slug = await createQuiz('Sponsorisé');
    await authed(request(app).put(`/api/quizzes/${slug}/full`), token)
      .send({
        title: 'Sponsorisé',
        type: 'sponsored',
        sponsorId: sponsor.id.toString(),
        language: 'fr',
        questions: [validQuestion()],
      })
      .expect(200);
    const game = await prisma.game.findUniqueOrThrow({ where: { slug } });
    expect(game.kind).toBe('sponsored');
    expect(game.sponsorId).toBe(sponsor.id);
    await prisma.game.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.quiz.deleteMany({});
    await prisma.sponsor.delete({ where: { id: sponsor.id } });
  });

  it('duplication → un nouveau jeu pour la copie', async () => {
    const slug = await createQuiz('Original');
    const res = await authed(request(app).post(`/api/quizzes/${slug}/duplicate`), token).expect(
      201,
    );
    const copySlug = res.body.slug as string;
    expect(copySlug).not.toBe(slug);
    const copyGame = await prisma.game.findUniqueOrThrow({ where: { slug: copySlug } });
    expect(copyGame.status).toBe('draft');
    expect(copyGame.title).toBe('Original (copie)');
    expect(await prisma.game.count()).toBe(2);
  });

  it('suppression d’un quiz jamais joué → son jeu est supprimé', async () => {
    const slug = await createQuiz('À supprimer');
    expect(await prisma.game.count({ where: { slug } })).toBe(1);
    await authed(request(app).delete(`/api/quizzes/${slug}`), token).expect(204);
    expect(await prisma.game.count({ where: { slug } })).toBe(0);
  });

  it('suppression d’un quiz dont le jeu a des manches → jeu archivé et détaché', async () => {
    const infra = await minimalCinemaAndScreen();
    const playedSlug = await createPublishedQuiz('Support');
    const playedQuiz = await prisma.quiz.findUniqueOrThrow({ where: { slug: playedSlug } });
    const slug = await createQuiz('Supprimé mais joué');
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { slug } });
    const game = await prisma.game.findUniqueOrThrow({ where: { quizId: quiz.id } });

    // Manche rattachée au jeu, dans une séance d'un autre quiz (la séance bloquerait la suppression).
    const session = await prisma.session.create({
      data: { slugShort: '7777', quizId: playedQuiz.id, screenId: infra.screenId },
    });
    await prisma.sessionRound.create({
      data: { sessionId: session.id, position: 1, gameId: game.id, state: 'ended' },
    });

    await authed(request(app).delete(`/api/quizzes/${slug}`), token).expect(204);
    const after = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(after.status).toBe('archived');
    expect(after.quizId).toBeNull();
  });

  it('syncGameFromQuiz refuse un slug pris par un autre jeu (409 SLUG_TAKEN)', async () => {
    await prisma.game.create({
      data: { slug: 'slug-pris', title: 'Autre jeu', engineKey: 'poll' },
    });
    const quiz = await prisma.quiz.create({
      data: { slug: 'slug-pris', title: 'Quiz', createdByUserId: userId },
    });
    await expect(syncGameFromQuiz(quiz.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLUG_TAKEN',
    });
  });

  it('création d’un quiz : le slug évite ceux déjà pris par un jeu', async () => {
    await prisma.game.create({
      data: { slug: 'slug-libre', title: 'Autre jeu', engineKey: 'poll' },
    });
    const slug = await createQuiz('Slug libre');
    expect(slug).toBe('slug-libre-2');
    expect((await prisma.game.findUniqueOrThrow({ where: { slug } })).engineKey).toBe('quiz');
  });
});

describe('sessions: création par quizSlug ou gameSlugs → une manche', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let token: string;
  let userId: bigint;
  let screenId: bigint;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();
    const admin = await createSuperAdminUser();
    token = admin.token;
    userId = admin.user.id;
    screenId = (await minimalCinemaAndScreen()).screenId;
  });

  async function publishedQuizWithGame(slug: string) {
    const quiz = await prisma.quiz.create({
      data: {
        slug,
        title: 'Quiz séance',
        status: 'published',
        createdByUserId: userId,
        questions: {
          create: [
            {
              position: 1,
              text: 'Q1?',
              answers: {
                create: [
                  { position: 'A', text: 'A', isCorrect: true },
                  { position: 'B', text: 'B', isCorrect: false },
                ],
              },
            },
          ],
        },
      },
    });
    const game = await syncGameFromQuiz(quiz.id);
    return { quiz, game };
  }

  it('par quizSlug : une manche position 1, en attente, sur le jeu du quiz', async () => {
    const { game } = await publishedQuizWithGame(`qs-${Date.now()}`);
    const res = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: game.slug, screenId: screenId.toString() })
      .expect(201);
    const rounds = await prisma.sessionRound.findMany({
      where: { sessionId: BigInt(res.body.id) },
    });
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.position).toBe(1);
    expect(rounds[0]!.gameId).toBe(game.id);
    expect(rounds[0]!.state).toBe('pending');
  });

  it('par quizSlug sur un quiz sans jeu : le jeu est créé à la volée', async () => {
    const quiz = await prisma.quiz.create({
      data: {
        slug: `nogame-${Date.now()}`,
        title: 'Sans jeu',
        status: 'published',
        createdByUserId: userId,
      },
    });
    const res = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: quiz.slug, screenId: screenId.toString() })
      .expect(201);
    const game = await prisma.game.findUniqueOrThrow({ where: { quizId: quiz.id } });
    const round = await prisma.sessionRound.findFirstOrThrow({
      where: { sessionId: BigInt(res.body.id) },
    });
    expect(round.gameId).toBe(game.id);
  });

  it('par gameSlugs : une manche, quizId renseigné', async () => {
    const { quiz, game } = await publishedQuizWithGame(`gs-${Date.now()}`);
    const res = await authed(request(app).post('/api/sessions'), token)
      .send({ gameSlugs: [game.slug], screenId: screenId.toString() })
      .expect(201);
    expect(res.body.quizSlug).toBe(quiz.slug);
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: BigInt(res.body.id) },
      include: { rounds: true },
    });
    expect(session.quizId).toBe(quiz.id);
    expect(session.rounds).toHaveLength(1);
    expect(session.rounds[0]!.gameId).toBe(game.id);
    expect(session.rounds[0]!.position).toBe(1);
  });

  it('gameSlugs : jeu en double → 400 DUPLICATE_GAME ; moteur non enregistré → 400 GAME_NOT_SUPPORTED_YET', async () => {
    const { game } = await publishedQuizWithGame(`multi-${Date.now()}`);
    const poll = await prisma.game.create({
      data: {
        slug: `poll-${Date.now()}`,
        title: 'Sondage',
        engineKey: 'poll',
        status: 'published',
      },
    });

    const two = await authed(request(app).post('/api/sessions'), token)
      .send({ gameSlugs: [game.slug, game.slug], screenId: screenId.toString() })
      .expect(400);
    expect(two.body.error.code).toBe('DUPLICATE_GAME');

    const other = await authed(request(app).post('/api/sessions'), token)
      .send({ gameSlugs: [poll.slug], screenId: screenId.toString() })
      .expect(400);
    expect(other.body.error.code).toBe('GAME_NOT_SUPPORTED_YET');
    expect(await prisma.session.count()).toBe(0);
  });

  it('gameSlugs : jeu non publié → 400, jeu inconnu → 404', async () => {
    const { quiz, game } = await publishedQuizWithGame(`unpub-${Date.now()}`);
    await prisma.quiz.update({ where: { id: quiz.id }, data: { status: 'draft' } });
    await syncGameFromQuiz(quiz.id);

    const res = await authed(request(app).post('/api/sessions'), token)
      .send({ gameSlugs: [game.slug], screenId: screenId.toString() })
      .expect(400);
    expect(res.body.error.code).toBe('GAME_NOT_PUBLISHED');

    await authed(request(app).post('/api/sessions'), token)
      .send({ gameSlugs: ['inconnu'], screenId: screenId.toString() })
      .expect(404);
  });

  it('quizSlug et gameSlugs ensemble, ou aucun des deux → 400', async () => {
    const { game } = await publishedQuizWithGame(`both-${Date.now()}`);
    await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: game.slug, gameSlugs: [game.slug], screenId: screenId.toString() })
      .expect(400);
    await authed(request(app).post('/api/sessions'), token)
      .send({ screenId: screenId.toString() })
      .expect(400);
    await authed(request(app).post('/api/sessions'), token)
      .send({ gameSlugs: [], screenId: screenId.toString() })
      .expect(400);
  });
});
