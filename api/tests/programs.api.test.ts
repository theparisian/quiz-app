import request from 'supertest';
import type { Express } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { buildApp } from '../src/create-app.js';
import { resetLobbyTimersForTests } from '../src/modules/sessions/lobby-timer.service.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  minimalCinemaAndScreen,
  resetStorage,
  truncateSponsorsAndQuizzes,
} from './helpers/integration.js';

/** C2 : programmation des salles (lecture, remplacement, lancement). */

const POLL_CONFIG = {
  questions: [
    {
      id: 'q1',
      text: 'Film préféré ?',
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
      ],
    },
  ],
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

/** Faux serveur socket.io : enregistre les émissions (namespace, room, événement, payload). */
function fakeIo() {
  const emitted: { ns: string; room: string; event: string; payload: unknown }[] = [];
  return {
    emitted,
    of: (ns: string) => ({
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ ns, room, event, payload });
          return true;
        },
      }),
    }),
  };
}

describe('screen programs (C2)', () => {
  let app: Express;
  let io: ReturnType<typeof fakeIo>;
  let superToken: string;
  let a: CinemaFixture;
  let b: CinemaFixture;
  let adminA: string;
  let projA: string;
  let adminB: string;

  beforeEach(async () => {
    await truncateSponsorsAndQuizzes();
    await resetStorage();
    app = buildApp();
    io = fakeIo();
    app.set('io', io);
    superToken = (await createSuperAdminUser()).token;
    a = await cinemaFixture();
    b = await cinemaFixture();
    adminA = (await createCinemaUser('cinema_admin', a.id)).token;
    projA = (await createCinemaUser('projectionist', a.id)).token;
    adminB = (await createCinemaUser('cinema_admin', b.id)).token;
  });

  afterEach(() => {
    resetLobbyTimersForTests();
  });

  async function pollGame(slug: string, data: Record<string, unknown> = {}) {
    return prisma.game.create({
      data: {
        slug,
        title: `Sondage ${slug}`,
        engineKey: 'poll',
        status: 'published',
        catalogEnabled: true,
        configJson: POLL_CONFIG,
        durationEstimateSeconds: 60,
        ...data,
      },
    });
  }

  const putProgram = (token: string, screenId: bigint, gameSlugs: unknown) =>
    authed(request(app).put(`/api/screens/${screenId}/program`), token).send({ gameSlugs });

  const getPrograms = (token: string, slug: string) =>
    authed(request(app).get(`/api/cinemas/${slug}/programs`), token);

  const launch = (token: string, screenId: bigint) =>
    authed(request(app).post(`/api/screens/${screenId}/program/launch`), token);

  it('PUT replaces the program and keeps the order; GET lists every screen', async () => {
    const sponsor = await prisma.sponsor.create({ data: { name: 'Pop Corp', slug: 'pop-corp' } });
    await pollGame('un', { tagline: 'Le premier' });
    await pollGame('deux', { kind: 'sponsored', sponsorId: sponsor.id });
    await pollGame('trois');
    const second = await prisma.screen.create({
      data: { cinemaId: a.id, name: 'S2', status: 'active', capacity: 120 },
    });
    await prisma.nuc.create({
      data: { screenId: a.screenId, nucUid: `nuc-${Date.now()}`, status: 'online' },
    });

    const res = await putProgram(adminA, a.screenId, ['trois', 'un', 'deux']).expect(200);
    expect(res.body.items.map((i: { gameSlug: string }) => i.gameSlug)).toEqual([
      'trois',
      'un',
      'deux',
    ]);
    // Remplacement complet, nouvel ordre.
    await putProgram(adminA, a.screenId, ['deux', 'un']).expect(200);

    const list = await getPrograms(projA, a.slug).expect(200);
    expect(list.body.items).toHaveLength(2);
    const s1 = list.body.items.find((s: { screenId: string }) => s.screenId === String(a.screenId));
    expect(s1).toMatchObject({
      name: 'S1',
      capacity: null,
      status: 'active',
      nuc: { status: 'online', lastSeenAt: null },
      activeSession: null,
    });
    expect(s1.items).toEqual([
      {
        gameSlug: 'deux',
        title: 'Sondage deux',
        tagline: null,
        coverImageUrl: null,
        engineKey: 'poll',
        kind: 'sponsored',
        sponsorName: 'Pop Corp',
        durationEstimateSeconds: 60,
        available: true,
      },
      expect.objectContaining({ gameSlug: 'un', tagline: 'Le premier', sponsorName: null }),
    ]);
    const s2 = list.body.items.find((s: { screenId: string }) => s.screenId === String(second.id));
    expect(s2).toMatchObject({ name: 'S2', capacity: 120, nuc: null, items: [] });

    // Programme vidé.
    await putProgram(adminA, a.screenId, []).expect(200);
    expect(await prisma.screenProgramItem.count({ where: { screenId: a.screenId } })).toBe(0);
  });

  it('PUT refuses more than 5 games, duplicates and unknown games', async () => {
    const slugs = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
    for (const slug of slugs) await pollGame(slug);

    const tooMany = await putProgram(adminA, a.screenId, slugs);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe('VALIDATION_ERROR');
    await putProgram(adminA, a.screenId, slugs.slice(0, 5)).expect(200);

    const dup = await putProgram(adminA, a.screenId, ['g1', 'g1']);
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe('DUPLICATE_GAME');
    await putProgram(adminA, a.screenId, ['absent']).expect(404);
    await putProgram(adminA, a.screenId, 'g1').expect(400);
    // Les refus ne touchent pas au programme en place.
    expect(await prisma.screenProgramItem.count({ where: { screenId: a.screenId } })).toBe(5);
  });

  it('PUT refuses a game not available to the cinema; a withdrawn game may stay', async () => {
    await pollGame('dispo');
    await pollGame('hors-catalogue', { catalogEnabled: false });
    await pollGame('brouillon', { status: 'draft' });
    const reserved = await pollGame('reserve-b', { audience: 'selected_cinemas' });
    await prisma.gameCinemaAccess.create({ data: { gameId: reserved.id, cinemaId: b.id } });

    for (const slug of ['hors-catalogue', 'brouillon', 'reserve-b']) {
      const res = await putProgram(adminA, a.screenId, ['dispo', slug]);
      expect(res.status, slug).toBe(403);
      expect(res.body.error.code).toBe('GAME_NOT_AVAILABLE');
    }
    // super_admin non plus : le programme appartient au cinéma.
    await putProgram(superToken, a.screenId, ['hors-catalogue']).expect(403);

    // Retiré du catalogue après coup : affiché indisponible, conservé, puis retirable.
    await putProgram(adminA, a.screenId, ['dispo']).expect(200);
    await pollGame('bientot-retire');
    await putProgram(adminA, a.screenId, ['dispo', 'bientot-retire']).expect(200);
    await prisma.game.update({
      where: { slug: 'bientot-retire' },
      data: { catalogEnabled: false },
    });
    const list = await getPrograms(adminA, a.slug).expect(200);
    expect(
      list.body.items[0].items.map((i: { gameSlug: string; available: boolean }) => [
        i.gameSlug,
        i.available,
      ]),
    ).toEqual([
      ['dispo', true],
      ['bientot-retire', false],
    ]);
    await putProgram(adminA, a.screenId, ['bientot-retire', 'dispo']).expect(200);
    await putProgram(adminA, a.screenId, ['dispo']).expect(200);
  });

  it("refuses another cinema's screens and the projectionist's writes", async () => {
    await pollGame('jeu');
    const otherScreen = await putProgram(adminA, b.screenId, ['jeu']);
    expect(otherScreen.status).toBe(403);
    expect(otherScreen.body.error.code).toBe('FORBIDDEN');
    await getPrograms(adminA, b.slug).expect(403);
    await getPrograms(projA, b.slug).expect(403);
    await putProgram(adminB, b.screenId, ['jeu']).expect(200);
    await launch(projA, b.screenId).expect(403);

    const asProj = await putProgram(projA, a.screenId, ['jeu']);
    expect(asProj.status).toBe(403);
    expect(await prisma.screenProgramItem.count({ where: { screenId: a.screenId } })).toBe(0);

    await getPrograms(superToken, a.slug).expect(200);
    await putProgram(superToken, a.screenId, ['jeu']).expect(200);
    await request(app).get(`/api/cinemas/${a.slug}/programs`).expect(401);
    await getPrograms(adminA, 'absent').expect(404);
    await putProgram(adminA, 999999999n, ['jeu']).expect(404);
  });

  it('launch creates a session with the available games in order, skipping withdrawn ones', async () => {
    await pollGame('premier');
    await pollGame('retire');
    await pollGame('dernier');
    await putProgram(adminA, a.screenId, ['dernier', 'retire', 'premier']).expect(200);
    await prisma.game.update({ where: { slug: 'retire' }, data: { catalogEnabled: false } });

    // Le projectionniste lance (lecture seule sur le programme, mais « Lancer » reste permis).
    const res = await launch(projA, a.screenId).expect(201);
    expect(
      res.body.rounds.map((r: { position: number; game: { slug: string } }) => r.game.slug),
    ).toEqual(['dernier', 'premier']);
    expect(res.body.screenId).toBe(String(a.screenId));
    const rounds = await prisma.sessionRound.findMany({
      where: { sessionId: BigInt(res.body.id) },
      orderBy: { position: 'asc' },
      include: { game: true },
    });
    expect(rounds.map((r) => [r.position, r.game.slug])).toEqual([
      [1, 'dernier'],
      [2, 'premier'],
    ]);

    // Même notification à l'écran que POST /api/sessions.
    const session = await prisma.session.findUniqueOrThrow({ where: { id: BigInt(res.body.id) } });
    expect(io.emitted).toContainEqual({
      ns: '/player',
      room: `screen:${a.screenId}`,
      event: 'screen:session_started',
      payload: {
        sessionId: res.body.id,
        slugShort: session.slugShort,
        joinToken: session.joinToken,
      },
    });

    // Séance active : visible dans le programme, et un second lancement est refusé.
    const list = await getPrograms(projA, a.slug).expect(200);
    expect(list.body.items[0].activeSession).toEqual({ id: res.body.id, state: 'lobby' });
    const again = await launch(adminA, a.screenId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SCREEN_HAS_ACTIVE_SESSION');
  });

  it('launch refuses an empty program, or one whose games were all withdrawn', async () => {
    const empty = await launch(adminA, a.screenId);
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('PROGRAM_EMPTY');

    await pollGame('seul');
    await putProgram(adminA, a.screenId, ['seul']).expect(200);
    await prisma.game.update({ where: { slug: 'seul' }, data: { status: 'archived' } });
    const withdrawn = await launch(superToken, a.screenId);
    expect(withdrawn.status).toBe(400);
    expect(withdrawn.body.error.code).toBe('PROGRAM_EMPTY');
    expect(await prisma.session.count()).toBe(0);
  });
});
