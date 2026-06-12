import request from 'supertest';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { resolvePrizeConfig } from '../src/modules/prizes/prize-config.service.js';
import { drawSuperPrizeForSession } from '../src/modules/prizes/prize-catalog.service.js';
import { prizesService } from '../src/modules/prizes/prizes.service.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';
import * as emailNs from '../src/shared/email/index.js';

function uniqueSlugShort(): string {
  return `s${Date.now()}`.slice(-10).padStart(4, '0');
}

async function seedQuiz(userId: bigint, screenId: bigint, overrides?: { prizesConfig?: object }) {
  const quiz = await prisma.quiz.create({
    data: {
      slug: `pq-${Date.now()}`,
      title: 'PQ',
      status: 'published',
      createdByUserId: userId,
      ...(overrides?.prizesConfig ? { prizesConfig: overrides.prizesConfig } : {}),
    },
  });
  await prisma.question.create({
    data: {
      quizId: quiz.id,
      position: 1,
      text: 'Q?',
      answers: {
        create: [
          { position: 'A', text: 'A', isCorrect: true },
          { position: 'B', text: 'B', isCorrect: false },
        ],
      },
    },
  });
  const session = await prisma.session.create({
    data: {
      slugShort: uniqueSlugShort(),
      quizId: quiz.id,
      screenId,
      state: 'ended',
      endedAt: new Date(),
      totalPlayers: 1,
    },
  });
  return { quiz, session };
}

describe('prize catalog — resolution', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('super lot > quiz template > quiz none > sponsor > cinema > rien', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({
      where: { id: infra.screenId },
      include: { cinema: true },
    });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Cinema R1', value: 'C' },
        },
      },
    });

    const sponsor = await prisma.sponsor.create({
      data: {
        slug: `sp-${Date.now()}`,
        name: 'Sponsor',
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Sponsor R1', value: 'S' },
        },
      },
    });

    const cinemaTpl = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Tpl Cinema',
        type: 'discount_qr',
        payloadJson: { value: 'T' },
      },
    });

    const superTpl = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Super Lot',
        type: 'discount_qr',
        payloadJson: { value: 'SUPER' },
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qz-${Date.now()}`,
        title: 'Q',
        status: 'published',
        createdByUserId: user.id,
        sponsorId: sponsor.id,
        prizesConfig: {
          rank1: { mode: 'template', templateId: cinemaTpl.id.toString() },
          rank2: { mode: 'none' },
        },
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        superPrizeTemplateId: superTpl.id,
      },
    });

    const r1 = await resolvePrizeConfig(session.id, 1);
    expect(r1?.label).toBe('Super Lot');
    expect(r1?.templateId).toBe(superTpl.id.toString());

    const sessionNoSuper = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
      },
    });
    const r1b = await resolvePrizeConfig(sessionNoSuper.id, 1);
    expect(r1b?.label).toBe('Tpl Cinema');

    const r2 = await resolvePrizeConfig(sessionNoSuper.id, 2);
    expect(r2).toBeNull();

    const quizInherit = await prisma.quiz.create({
      data: {
        slug: `qz-inh-${Date.now()}`,
        title: 'Inherit',
        status: 'published',
        createdByUserId: user.id,
        sponsorId: sponsor.id,
      },
    });
    const sessionInherit = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quizInherit.id,
        screenId: infra.screenId,
        state: 'ended',
      },
    });
    const r1inh = await resolvePrizeConfig(sessionInherit.id, 1);
    expect(r1inh?.label).toBe('Sponsor R1');
  });

  it('template inactif ou épuisé → fallback niveau suivant', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Fallback cinéma', value: 'FB' },
        },
      },
    });

    const exhausted = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Épuisé',
        type: 'discount_qr',
        stock: 0,
        stockInitial: 1,
        isActive: true,
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qz-ex-${Date.now()}`,
        title: 'Ex',
        status: 'published',
        createdByUserId: user.id,
        prizesConfig: {
          rank1: { mode: 'template', templateId: exhausted.id.toString() },
        },
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
      },
    });

    const cfg = await resolvePrizeConfig(session.id, 1);
    expect(cfg?.label).toBe('Fallback cinéma');
    expect(cfg?.templateId).toBeUndefined();
  });
});

describe('prize catalog — super draw', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('persiste superPrizeTemplateId et ne double pas au re-draw', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const tpl = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Super',
        type: 'discount_qr',
      },
    });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        superPrizeConfig: {
          enabled: true,
          templateId: tpl.id.toString(),
          oddsOneIn: 2,
        },
      },
    });

    const { user } = await createSuperAdminUser();
    const { session } = await seedQuiz(user.id, infra.screenId);
    await prisma.session.update({
      where: { id: session.id },
      data: { state: 'lobby' },
    });

    const drawn = await drawSuperPrizeForSession(session.id, screen.cinemaId, () => 0);
    expect(drawn).toBe(tpl.id);

    const again = await drawSuperPrizeForSession(session.id, screen.cinemaId, () => 0);
    expect(again).toBe(tpl.id);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.superPrizeTemplateId).toBe(tpl.id);
  });

  it('pas de tirage si disabled ou template épuisé', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const tpl = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Super',
        type: 'discount_qr',
        stock: 0,
      },
    });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        superPrizeConfig: {
          enabled: true,
          templateId: tpl.id.toString(),
          oddsOneIn: 2,
        },
      },
    });

    const { user } = await createSuperAdminUser();
    const { session } = await seedQuiz(user.id, infra.screenId);

    const drawn = await drawSuperPrizeForSession(session.id, screen.cinemaId, () => 0);
    expect(drawn).toBeNull();
  });
});

describe('prize catalog — stock', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    vi.spyOn(emailNs, 'sendEmail').mockResolvedValue(undefined);
  });

  it('décrément atomique — stock=1 un seul prize, second session en fallback', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Fallback', value: 'FB' },
        },
      },
    });

    const tpl = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Unique',
        type: 'discount_qr',
        stock: 1,
        stockInitial: 1,
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qz-st-${Date.now()}`,
        title: 'Stock',
        status: 'published',
        createdByUserId: user.id,
        prizesConfig: {
          rank1: { mode: 'template', templateId: tpl.id.toString() },
        },
      },
    });

    const session1 = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });
    const session2 = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });

    const p1 = await prisma.player.create({
      data: {
        sessionId: session1.id,
        pseudo: 'P1',
        resumeToken: 'tok-p1-unique-prize-test-32chars__',
        rankFinal: 1,
      },
    });
    const p2 = await prisma.player.create({
      data: {
        sessionId: session2.id,
        pseudo: 'P2',
        resumeToken: 'tok-p2-unique-prize-test-32chars__',
        rankFinal: 1,
      },
    });

    await prizesService.createForPlayer(p1.id, 'a@test.com');
    await prizesService.createForPlayer(p2.id, 'b@test.com');

    const updated = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: tpl.id } });
    expect(updated.stock).toBe(0);
    const tplPrizes = await prisma.prize.findMany({ where: { prizeTemplateId: tpl.id } });
    expect(tplPrizes).toHaveLength(1);

    const p2Prize = await prisma.prize.findFirst({ where: { playerId: p2.id } });
    expect(p2Prize?.label).toBe('Fallback');
    expect(p2Prize?.prizeTemplateId).toBeNull();
  });
});

describe('prize catalog — endpoints', () => {
  let app: ReturnType<typeof getIntegrationApp>;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();
  });

  it('scoping multi-tenant + archivage sans hard delete', async () => {
    const { user, token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();

    const createRes = await authed(
      request(app).post(`/api/cinemas/${infra.cinemaSlug}/prize-templates`),
      token,
    )
      .send({ label: 'Popcorn', type: 'discount_qr', stock: 10 })
      .expect(201);

    const id = createRes.body.id as string;

    await authed(request(app).delete(`/api/prize-templates/${id}`), token).expect(200);

    const archived = await prisma.prizeTemplate.findUniqueOrThrow({
      where: { id: BigInt(id) },
    });
    expect(archived.isActive).toBe(false);
  });
});

describe('prize catalog — rétrocompatibilité', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('quiz sans prizesConfig → sponsor puis cinéma inchangé', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Lot cinéma #1', value: 'C1' },
        },
      },
    });

    const sponsor = await prisma.sponsor.create({
      data: {
        slug: `sp-rc-${Date.now()}`,
        name: 'SP',
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Lot sponsor #1', value: 'S1' },
        },
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qz-rc-${Date.now()}`,
        title: 'RC',
        status: 'published',
        createdByUserId: user.id,
        sponsorId: sponsor.id,
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
      },
    });

    const cfg = await resolvePrizeConfig(session.id, 1);
    expect(cfg).toEqual({
      type: 'discount_qr',
      label: 'Lot sponsor #1',
      value: 'S1',
    });
  });
});
