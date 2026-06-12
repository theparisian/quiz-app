import request from 'supertest';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error.js';
import { prisma } from '../src/shared/db/index.js';
import {
  resolveEligiblePrizeForPlayer,
  resolvePrizeConfig,
} from '../src/modules/prizes/prize-config.service.js';
import {
  resolvePrizeDisplay,
  resolvePrizesPayload,
} from '../src/modules/prizes/prize-display.service.js';
import { prizesService } from '../src/modules/prizes/prizes.service.js';
import {
  enqueuePrizeEmail,
  flushPrizeEmailQueueForTests,
  getEmailSendRateMs,
  requeuePendingPrizeEmailsOnBoot,
  resetPrizeEmailQueueForTests,
} from '../src/shared/email/prize-email-queue.service.js';
import { sendEmail } from '../src/shared/email/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
  minimalCinemaAndScreen,
} from './helpers/integration.js';

vi.mock('../src/shared/email/index.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

function uniqueSlugShort(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function seedSessionWithConsolationAll(cinemaId: bigint, screenId: bigint, userId: bigint) {
  const tpl = await prisma.prizeTemplate.create({
    data: {
      cinemaId,
      label: '−10 % confiserie',
      type: 'discount_qr',
    },
  });

  await prisma.cinema.update({
    where: { id: cinemaId },
    data: {
      prizesConfig: {
        rank1: { type: 'discount_qr', label: 'Podium 1', value: 'P1' },
        all: { type: 'discount_qr', label: '−10 % confiserie', value: 'ALL10' },
      },
    },
  });

  const quiz = await prisma.quiz.create({
    data: {
      slug: `cons-${Date.now()}`,
      title: 'Consolation',
      status: 'published',
      createdByUserId: userId,
      prizesConfig: { all: { mode: 'inherit' } },
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

  const session = await prisma.session.create({
    data: {
      slugShort: uniqueSlugShort(),
      quizId: quiz.id,
      screenId,
      state: 'ended',
      endedAt: new Date(),
    },
  });

  return { quiz, session, tpl };
}

describe('Phase D — éligibilité consolation', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    vi.mocked(sendEmail).mockClear();
  });

  it('rang avec lot → lot de rang (isConsolation=false)', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'Winner',
        resumeToken: `rt-${Date.now()}-winner-token-32chars__`,
        rankFinal: 1,
        status: 'active',
      },
    });

    const eligible = await resolveEligiblePrizeForPlayer(session.id, player.rankFinal);
    expect(eligible?.isConsolation).toBe(false);
    expect(eligible?.config.label).toBe('Podium 1');
  });

  it('rang 5 avec all résolu → consolation', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const eligible = await resolveEligiblePrizeForPlayer(session.id, 5);
    expect(eligible?.isConsolation).toBe(true);
    expect(eligible?.config.label).toBe('−10 % confiserie');
  });

  it('top 2 rank2 none + all → consolation', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          all: { type: 'discount_qr', label: 'Consolation', value: 'C' },
        },
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `q2-${Date.now()}`,
        title: 'Q2',
        status: 'published',
        createdByUserId: user.id,
        prizesConfig: { rank2: { mode: 'none' }, all: { mode: 'inherit' } },
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });

    const eligible = await resolveEligiblePrizeForPlayer(session.id, 2);
    expect(eligible?.isConsolation).toBe(true);
  });

  it('createForPlayer — rang 5 reçoit consolation', async () => {
    const app = getIntegrationApp();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'Rank5',
        resumeToken: `rt-${Date.now()}-rank5-token-32chars____`,
        rankFinal: 5,
        status: 'active',
      },
    });

    const res = await request(app)
      .patch(`/api/players/${player.id}/email`)
      .set('X-Player-Token', player.resumeToken)
      .send({ email: 'rank5@test.com', consent: true })
      .expect(200);

    expect(res.body.emailQueued).toBe(true);

    await flushPrizeEmailQueueForTests();

    const prize = await prisma.prize.findUniqueOrThrow({
      where: { playerId_sessionId: { playerId: player.id, sessionId: session.id } },
    });
    expect(prize.isConsolation).toBe(true);
    expect(prize.rank).toBe(5);
    expect(prize.emailSentAt).not.toBeNull();
  });
});

describe('Phase D — résolution all', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('chaîne quiz → sponsor → cinéma avec none bloquant', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();

    const sponsor = await prisma.sponsor.create({
      data: {
        name: 'Sp',
        slug: `sp-${Date.now()}`,
        prizesConfig: {
          all: { type: 'discount_qr', label: 'Sponsor all', value: 'SA' },
        },
      },
    });

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          all: { type: 'discount_qr', label: 'Cinema all', value: 'CA' },
        },
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `inh-${Date.now()}`,
        title: 'Inh',
        status: 'published',
        createdByUserId: user.id,
        sponsorId: sponsor.id,
        prizesConfig: { all: { mode: 'inherit' } },
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

    expect((await resolvePrizeConfig(session.id, 'all'))?.label).toBe('Sponsor all');

    await prisma.quiz.update({
      where: { id: quiz.id },
      data: { prizesConfig: { all: { mode: 'none' } } },
    });
    expect(await resolvePrizeConfig(session.id, 'all')).toBeNull();
  });
});

describe('Phase D — payloads all', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('all présent dans resolvePrizeDisplay, absent si non configuré', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const withAll = await resolvePrizesPayload(session.id);
    expect(withAll?.all?.label).toBe('−10 % confiserie');

    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: { prizesConfig: {} },
    });
    await prisma.quiz.update({
      where: { id: session.quizId },
      data: { prizesConfig: { all: { mode: 'none' } } },
    });

    const display = await resolvePrizeDisplay(session.id);
    expect(display.all).toBeUndefined();
    expect(await resolvePrizesPayload(session.id)).toBeUndefined();
  });
});

describe('Phase D — file email', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    await flushPrizeEmailQueueForTests();
    resetPrizeEmailQueueForTests();
    vi.mocked(sendEmail).mockReset();
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    process.env.EMAIL_SEND_RATE_MS = '50';
  });

  it('envois espacés et emailSentAt après envoi', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const p1 = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'A',
        resumeToken: `rt-${Date.now()}-a-token-32chars_________`,
        rankFinal: 4,
        emailForPrize: 'a@test.com',
        emailConsentAt: new Date(),
        status: 'active',
      },
    });
    const p2 = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'B',
        resumeToken: `rt-${Date.now()}-b-token-32chars_________`,
        rankFinal: 5,
        emailForPrize: 'b@test.com',
        emailConsentAt: new Date(),
        status: 'active',
      },
    });

    const sendTimestamps: number[] = [];
    vi.mocked(sendEmail).mockImplementation(async () => {
      sendTimestamps.push(Date.now());
    });

    const syncStart = Date.now();
    await prizesService.createForPlayer(p1.id, 'a@test.com');
    await prizesService.createForPlayer(p2.id, 'b@test.com');
    expect(Date.now() - syncStart).toBeLessThan(200);

    await flushPrizeEmailQueueForTests();

    expect(sendTimestamps.length).toBeGreaterThanOrEqual(2);
    expect(sendTimestamps[1]! - sendTimestamps[0]!).toBeGreaterThanOrEqual(
      getEmailSendRateMs() - 10,
    );

    const prizes = await prisma.prize.findMany({ where: { sessionId: session.id } });
    expect(prizes.every((p) => p.emailSentAt !== null)).toBe(true);
  });
});

describe('Phase D — balayage boot', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    vi.mocked(sendEmail).mockClear();
  });

  it('remet en file les prizes < 24 h sans emailSentAt', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'Old',
        resumeToken: `rt-${Date.now()}-old-token-32chars_______`,
        rankFinal: 4,
        emailForPrize: 'old@test.com',
        emailConsentAt: new Date(),
        status: 'active',
      },
    });

    await prisma.prize.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        redeemCode: 'pendingcode123456',
        signature: 'a'.repeat(64),
        shortCode: 'PND-123',
        rank: 4,
        label: 'Consolation',
        type: 'discount_qr',
        isConsolation: true,
      },
    });

    await requeuePendingPrizeEmailsOnBoot();
    await flushPrizeEmailQueueForTests();

    const prize = await prisma.prize.findFirstOrThrow({ where: { playerId: player.id } });
    expect(prize.emailSentAt).not.toBeNull();
  });

  it('ignore les prizes de session créée il y a plus de 24 h', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const oldCreated = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: session.id },
      data: { createdAt: oldCreated },
    });

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'Stale',
        resumeToken: `rt-${Date.now()}-stale-token-32chars_____`,
        rankFinal: 4,
        emailForPrize: 'stale@test.com',
        emailConsentAt: new Date(),
        status: 'active',
      },
    });

    await prisma.prize.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        redeemCode: 'stalecode12345678',
        signature: 'b'.repeat(64),
        shortCode: 'STL-456',
        rank: 4,
        label: 'Consolation',
        type: 'discount_qr',
        isConsolation: true,
      },
    });

    await requeuePendingPrizeEmailsOnBoot();
    await flushPrizeEmailQueueForTests();

    expect(vi.mocked(sendEmail).mock.calls.length).toBe(0);
    const prize = await prisma.prize.findFirstOrThrow({ where: { playerId: player.id } });
    expect(prize.emailSentAt).toBeNull();
  });
});

describe('Phase D — stock consolation', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    vi.mocked(sendEmail).mockClear();
  });

  it('stock=10 avec 15 réclamations → 10 prizes, 5 échecs gracieux', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();

    const tpl = await prisma.prizeTemplate.create({
      data: {
        cinemaId: screen.cinemaId,
        label: 'Consolation limitée',
        type: 'discount_qr',
        stock: 10,
        stockInitial: 10,
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `stk-${Date.now()}`,
        title: 'Stock',
        status: 'published',
        createdByUserId: user.id,
        prizesConfig: {
          all: { mode: 'template', templateId: tpl.id.toString() },
        },
      },
    });

    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });

    const players = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        prisma.player.create({
          data: {
            sessionId: session.id,
            pseudo: `P${i + 4}`,
            resumeToken: `rt-${Date.now()}-${i}-stock-token-32chars__`,
            rankFinal: i + 4,
            status: 'active',
          },
        }),
      ),
    );

    const outcomes = await Promise.all(
      players.map((p, i) =>
        prizesService
          .createForPlayer(p.id, `p${i}@test.com`)
          .then(() => 'ok' as const)
          .catch((err: unknown) => {
            if (err instanceof AppError) return err.code;
            throw err;
          }),
      ),
    );

    const okCount = outcomes.filter((o) => o === 'ok').length;
    const failCount = outcomes.filter((o) => o === 'PRIZE_NOT_CONFIGURED').length;
    expect(okCount).toBe(10);
    expect(failCount).toBe(5);

    const prizeCount = await prisma.prize.count({ where: { sessionId: session.id } });
    expect(prizeCount).toBe(10);

    const updated = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: tpl.id } });
    expect(updated.stock).toBe(0);
  });
});

describe('Phase D — échec SMTP', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp dead'));
  });

  it('double échec → emailSentAt reste null', async () => {
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { user } = await createSuperAdminUser();
    const { session } = await seedSessionWithConsolationAll(
      screen.cinemaId,
      infra.screenId,
      user.id,
    );

    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'SmtpFail',
        resumeToken: `rt-${Date.now()}-smtp-token-32chars______`,
        rankFinal: 5,
        status: 'active',
      },
    });

    await prizesService.createForPlayer(player.id, 'fail@test.com');
    await flushPrizeEmailQueueForTests();

    const prize = await prisma.prize.findUniqueOrThrow({
      where: { playerId_sessionId: { playerId: player.id, sessionId: session.id } },
    });
    expect(prize.emailSentAt).toBeNull();
    expect(vi.mocked(sendEmail).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
