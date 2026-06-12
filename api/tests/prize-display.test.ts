import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { resolvePrizeDisplay } from '../src/modules/prizes/prize-display.service.js';
import { drawSuperPrizeForSession } from '../src/modules/prizes/prize-catalog.service.js';
import {
  buildConsoleStateSnapshot,
  buildMobilePlayerStateSnapshot,
  buildNucStateSnapshot,
} from '../src/modules/sessions/session-resume.service.js';
import { sessionPrizesDisplaySchema, sessionEndedSchema } from '@quiz-app/validation';
import {
  createSuperAdminUser,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
  uniqueSlugShort,
} from './helpers/integration.js';

function uniqueSlugShort(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

describe('resolvePrizeDisplay', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('mappe template quiz, héritage et none → clé absente', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const tpl1 = await prisma.prizeTemplate.create({
      data: { cinemaId: screen.cinemaId, label: 'Lot quiz R1', type: 'discount_qr' },
    });
    const tpl3 = await prisma.prizeTemplate.create({
      data: { cinemaId: screen.cinemaId, label: 'Lot quiz R3', type: 'discount_qr' },
    });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank2: { type: 'discount_qr', label: 'Hérité cinéma R2', value: 'R2' },
        },
      },
    });

    const { user } = await createSuperAdminUser();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `pd-${Date.now()}`,
        title: 'PD',
        status: 'published',
        createdByUserId: user.id,
        prizesConfig: {
          rank1: { mode: 'template', templateId: tpl1.id.toString() },
          rank2: { mode: 'none' },
          rank3: { mode: 'template', templateId: tpl3.id.toString() },
        },
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'lobby',
      },
    });

    const display = await resolvePrizeDisplay(session.id);
    expect(display.rank1?.label).toBe('Lot quiz R1');
    expect(display.rank2).toBeUndefined();
    expect(display.rank3?.label).toBe('Lot quiz R3');
    expect(sessionPrizesDisplaySchema.parse(display)).toEqual(display);
  });

  it('super lot → isSuperPrize sur rank1 uniquement', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const superTpl = await prisma.prizeTemplate.create({
      data: { cinemaId: screen.cinemaId, label: 'Mega lot', type: 'discount_qr' },
    });
    const rank2Tpl = await prisma.prizeTemplate.create({
      data: { cinemaId: screen.cinemaId, label: 'Lot 2', type: 'discount_qr' },
    });

    const { user } = await createSuperAdminUser();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `sp-${Date.now()}`,
        title: 'SP',
        status: 'published',
        createdByUserId: user.id,
        prizesConfig: {
          rank1: { mode: 'template', templateId: superTpl.id.toString() },
          rank2: { mode: 'template', templateId: rank2Tpl.id.toString() },
        },
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'lobby',
        superPrizeTemplateId: superTpl.id,
      },
    });

    const display = await resolvePrizeDisplay(session.id);
    expect(display.rank1).toEqual({ label: 'Mega lot', isSuperPrize: true });
    expect(display.rank2).toEqual({ label: 'Lot 2' });
    expect(display.rank2).not.toHaveProperty('isSuperPrize');
  });

  it('template épuisé → fallback reflété', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const exhausted = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Épuisé',
        type: 'discount_qr',
        stock: 0,
      },
    });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Fallback cinéma', value: 'FB' },
        },
      },
    });

    const { user } = await createSuperAdminUser();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `ex-${Date.now()}`,
        title: 'EX',
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
        state: 'lobby',
      },
    });

    const display = await resolvePrizeDisplay(session.id);
    expect(display.rank1?.label).toBe('Fallback cinéma');
    expect(display.rank1?.isSuperPrize).toBeUndefined();
  });
});

describe('Phase C — payloads prizes', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  async function seedLobbySessionWithPrizes() {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Popcorn', value: 'POP' },
          rank2: { type: 'discount_qr', label: 'Boisson', value: 'DRK' },
        },
      },
    });

    const { user } = await createSuperAdminUser();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `pl-${Date.now()}`,
        title: 'PL',
        status: 'published',
        createdByUserId: user.id,
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'lobby',
      },
    });

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'J1',
        resumeToken: `rt-${Date.now()}-token-32chars-min____`,
        status: 'active',
      },
    });

    const nuc = await prisma.nuc.create({
      data: {
        screenId: infra.screenId,
        nucUid: `nuc-pl-${Date.now()}`,
        authKeyHash: 'x'.repeat(64),
        status: 'online',
      },
    });

    return { infra, session, player, nuc };
  }

  it('snapshots lobby contiennent prizes conformes sans données sensibles', async () => {
    const { infra, session, player, nuc } = await seedLobbySessionWithPrizes();

    const nucSnap = await buildNucStateSnapshot({
      nucId: nuc.id,
      screenId: infra.screenId,
      sessionId: session.id,
    });
    const mobileSnap = await buildMobilePlayerStateSnapshot(player.id, session.id);
    const consoleSnap = await buildConsoleStateSnapshot(session.id);

    for (const snap of [nucSnap, mobileSnap, consoleSnap]) {
      expect(sessionPrizesDisplaySchema.parse(snap.prizes)).toBeTruthy();
      const json = JSON.stringify(snap);
      expect(json).not.toMatch(/payloadJson|redeemCode|shortCode|"stock"/);
      expect(json).not.toMatch(/emailForPrize|email_for_prize/);
    }
  });

  it('snapshot ended NUC contient prizes', async () => {
    const { infra, session, player, nuc } = await seedLobbySessionWithPrizes();
    await prisma.session.update({
      where: { id: session.id },
      data: { state: 'ended', endedAt: new Date() },
    });
    await prisma.player.update({
      where: { id: player.id },
      data: { rankFinal: 1, scoreTotal: 100 },
    });

    const nucSnap = await buildNucStateSnapshot({
      nucId: nuc.id,
      screenId: infra.screenId,
      sessionId: session.id,
    });

    expect(sessionPrizesDisplaySchema.parse(nucSnap.prizes)).toMatchObject({
      rank1: { label: 'Popcorn' },
    });
  });

  it('session:ended schema accepte prizes', () => {
    const payload = sessionEndedSchema.parse({
      finalScoreboard: [{ playerId: '1', pseudo: 'A', scoreTotal: 100, rank: 1 }],
      winnerPlayerId: '1',
      prizeAvailabilityByRank: { rank1: true },
      prizes: { rank1: { label: 'Popcorn' } },
    });
    expect(payload.prizes?.rank1?.label).toBe('Popcorn');
  });
});

describe('Phase C — tirage super lot à l’ouverture lobby', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('tirage à la création de session, pas au start', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const tpl = await prisma.prizeTemplate.create({
      data: { cinemaId: screen.cinemaId, label: 'Super', type: 'discount_qr' },
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
    const quiz = await prisma.quiz.create({
      data: {
        slug: `draw-${Date.now()}`,
        title: 'Draw',
        status: 'published',
        createdByUserId: user.id,
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'lobby',
      },
    });

    const drawnAtCreate = await drawSuperPrizeForSession(session.id, screen.cinemaId, () => 0);
    expect(drawnAtCreate).toBe(tpl.id);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.superPrizeTemplateId).toBe(tpl.id);

    const again = await drawSuperPrizeForSession(session.id, screen.cinemaId, () => 0);
    expect(again).toBe(tpl.id);
  });

  it('abort en lobby ne consomme pas de stock template', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const tpl = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Stocké',
        type: 'discount_qr',
        stock: 5,
      },
    });

    const { user } = await createSuperAdminUser();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `ab-${Date.now()}`,
        title: 'AB',
        status: 'published',
        createdByUserId: user.id,
        prizesConfig: {
          rank1: { mode: 'template', templateId: tpl.id.toString() },
        },
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'aborted',
        endedAt: new Date(),
      },
    });

    const after = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: tpl.id } });
    expect(after.stock).toBe(5);
    expect(session.state).toBe('aborted');
  });
});
