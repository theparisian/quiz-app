import request from 'supertest';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/db/index.js';
import { signPrize } from '../src/modules/prizes/prize-signature.service.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
  minimalCinemaAndScreen,
} from './helpers/integration.js';
import * as emailNs from '../src/shared/email/index.js';
import { flushPrizeEmailQueueForTests } from '../src/shared/email/prize-email-queue.service.js';

function uniqueSlugShort(): string {
  return `s${Date.now()}`.slice(-10).padStart(4, '0');
}

async function seedCinemaPrizesConfig(cinemaId: bigint) {
  await prisma.cinema.update({
    where: { id: cinemaId },
    data: {
      prizesConfig: {
        rank1: { type: 'discount_qr', label: 'Lot cinéma #1', value: 'C1' },
        rank2: { type: 'discount_qr', label: 'Lot cinéma #2', value: 'C2' },
        rank3: { type: 'discount_qr', label: 'Lot cinéma #3', value: 'C3' },
      },
    },
  });
}

async function seedStaffPin(cinemaId: bigint, pin = '1234') {
  const hash = await bcrypt.hash(pin, 10);
  await prisma.cinema.update({ where: { id: cinemaId }, data: { staffPinHash: hash } });
}

describe('PR7 prizes (integration)', () => {
  let app: ReturnType<typeof getIntegrationApp>;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();
  });

  it('POST redeem — signature valide puis 409 déjà utilisé', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUnique({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen');
    await seedCinemaPrizesConfig(screen.cinemaId);
    await seedStaffPin(screen.cinemaId);

    const quiz = await prisma.quiz.create({
      data: {
        slug: `pq-${Date.now()}`,
        title: 'PQ',
        status: 'published',
        createdByUserId: user.id,
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
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
        totalPlayers: 1,
      },
    });
    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'P1',
        resumeToken: 'rt-redemption-test-token-32chars__',
        status: 'active',
        rankFinal: 1,
        emailForPrize: 'p@test.com',
      },
    });

    const redeemCode = 'fixedcode1234567';
    const signature = signPrize(redeemCode);
    await prisma.prize.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        redeemCode,
        signature,
        shortCode: 'TST-234',
        rank: 1,
        label: 'Lot cinéma #1',
        type: 'discount_qr',
        emailSentAt: new Date(),
      },
    });

    const ok = await request(app)
      .post(`/api/prizes/redeem/${redeemCode}`)
      .send({ sig: signature, staffPin: '1234' })
      .expect(200);
    expect(ok.body.label).toBe('Lot cinéma #1');
    expect(ok.body.redeemedAt).toBeTruthy();

    const again = await request(app)
      .post(`/api/prizes/redeem/${redeemCode}`)
      .send({ sig: signature, staffPin: '1234' })
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_REDEEMED');
    expect(again.body.error.details.redeemedAt).toBeTruthy();
  });

  it('POST redeem — mauvaise signature → 401', async () => {
    const res = await request(app)
      .post('/api/prizes/redeem/abcdefghijklmnop')
      .send({ signature: 'a'.repeat(64) })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('POST redeem — code inconnu → 404', async () => {
    const code = 'zzzzzzzzzzzzzzzz';
    const res = await request(app)
      .post(`/api/prizes/redeem/${code}`)
      .send({ signature: signPrize(code) })
      .expect(404);
    expect(res.body.error.code).toBe('PRIZE_NOT_FOUND');
  });

  it('POST unsubscribe — retire emailForPrize', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUnique({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen');
    await seedCinemaPrizesConfig(screen.cinemaId);

    const quiz = await prisma.quiz.create({
      data: {
        slug: `pu-${Date.now()}`,
        title: 'PU',
        status: 'published',
        createdByUserId: user.id,
      },
    });
    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
        totalPlayers: 1,
      },
    });
    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo: 'Unsub',
        resumeToken: 'rt-unsub-test-token-32chars___',
        status: 'active',
        rankFinal: 1,
        emailForPrize: 'keep@test.com',
        emailConsentAt: new Date(),
      },
    });
    const redeemCode = 'unsubcode1234567';
    const signature = signPrize(redeemCode);
    await prisma.prize.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        redeemCode,
        signature,
        shortCode: 'UNS-567',
        rank: 1,
        label: 'L',
        type: 'discount_qr',
      },
    });

    await request(app)
      .post(`/api/prizes/unsubscribe/${redeemCode}`)
      .send({ signature })
      .expect(200);

    const p = await prisma.player.findUnique({ where: { id: player.id } });
    expect(p?.emailForPrize).toBeNull();
    expect(p?.emailConsentAt).toBeNull();
  });

  it('createForPlayer — double validation → 409', async () => {
    const { user, token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUnique({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen');
    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'L1', value: 'X' },
        },
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qd-${Date.now()}`,
        title: 'QD',
        status: 'published',
        createdByUserId: user.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q',
        answers: {
          create: [
            { position: 'A', text: 'A', isCorrect: true },
            { position: 'B', text: 'B', isCorrect: false },
          ],
        },
      },
    });

    const sessionRes = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);
    const sessionId = BigInt(sessionRes.body.id);
    const joinRes = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: sessionRes.body.slugShort, pseudo: 'WinnerDup' })
      .expect(201);
    const playerId = BigInt(joinRes.body.player.id);
    const resumeToken = joinRes.body.resumeToken;

    await prisma.session.update({
      where: { id: sessionId },
      data: { state: 'ended', endedAt: new Date() },
    });
    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 1 },
    });

    await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'd@test.com', consent: true })
      .expect(200);

    const dup = await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'd@test.com', consent: true })
      .expect(409);
    expect(dup.body.error.code).toBe('PRIZE_ALREADY_EXISTS');
  });

  it('createForPlayer — pas de config lot → 404', async () => {
    const { token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();

    const { user } = await createSuperAdminUser();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `qn-${Date.now()}`,
        title: 'QN',
        status: 'published',
        createdByUserId: user.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q',
        answers: {
          create: [
            { position: 'A', text: 'A', isCorrect: true },
            { position: 'B', text: 'B', isCorrect: false },
          ],
        },
      },
    });

    const sessionRes = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);
    const sessionId = BigInt(sessionRes.body.id);
    const joinRes = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: sessionRes.body.slugShort, pseudo: 'NoCfgPlay' })
      .expect(201);
    const playerId = BigInt(joinRes.body.player.id);
    const resumeToken = joinRes.body.resumeToken;

    await prisma.session.update({
      where: { id: sessionId },
      data: { state: 'ended', endedAt: new Date() },
    });
    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 2 },
    });

    const res = await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'n@test.com', consent: true })
      .expect(404);
    expect(res.body.error.code).toBe('PRIZE_NOT_CONFIGURED');
  });

  it('config sponsor surcharge cinéma pour quiz sponsorisé', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUnique({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen');
    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: {
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Cinéma seul', value: 'C' },
        },
      },
    });

    const sponsor = await prisma.sponsor.create({
      data: {
        name: 'Spon',
        slug: `sp-${Date.now()}`,
        prizesConfig: {
          rank1: { type: 'discount_qr', label: 'Sponsor override', value: 'S' },
        },
      },
    });

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qs-${Date.now()}`,
        title: 'QS',
        type: 'sponsored',
        sponsorId: sponsor.id,
        status: 'published',
        createdByUserId: user.id,
      },
    });

    const { resolvePrizeConfig } = await import('../src/modules/prizes/prize-config.service.js');
    const session = await prisma.session.create({
      data: {
        slugShort: uniqueSlugShort(),
        quizId: quiz.id,
        screenId: infra.screenId,
        state: 'ended',
        endedAt: new Date(),
      },
    });

    const cfg = await resolvePrizeConfig(session.id, 1);
    expect(cfg?.label).toBe('Sponsor override');
  });

  it('PATCH /api/cinemas/:slug/prizes-config + lecture', async () => {
    const { token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const cinema = await prisma.cinema.findFirst({
      where: { id: (await prisma.screen.findUnique({ where: { id: infra.screenId } }))!.cinemaId },
    });
    if (!cinema) throw new Error('cinema');

    await authed(request(app).patch(`/api/cinemas/${cinema.slug}/prizes-config`), token)
      .send({
        config: {
          rank1: { type: 'video', label: 'Vidéo bonus', value: 'https://example.com/v' },
        },
      })
      .expect(200);

    const read = await authed(
      request(app).get(`/api/cinemas/${cinema.slug}/prizes-config`),
      token,
    ).expect(200);
    expect(read.body.config.rank1?.label).toBe('Vidéo bonus');
  });
});

describe('PR7 prize email retry', () => {
  let app: ReturnType<typeof getIntegrationApp>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await truncateQuizRelatedTables();
    app = getIntegrationApp();
  });

  it('échec puis retry OK → emailSentAt défini', async () => {
    const sendEmail = vi.spyOn(emailNs, 'sendEmail');
    sendEmail.mockRejectedValueOnce(new Error('smtp fail')).mockResolvedValueOnce(undefined);

    const { user, token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUnique({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen');
    await seedCinemaPrizesConfig(screen.cinemaId);

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qe-${Date.now()}`,
        title: 'QE',
        status: 'published',
        createdByUserId: user.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q',
        answers: {
          create: [
            { position: 'A', text: 'A', isCorrect: true },
            { position: 'B', text: 'B', isCorrect: false },
          ],
        },
      },
    });

    const sessionRes = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);
    const sessionId = BigInt(sessionRes.body.id);
    const joinRes = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: sessionRes.body.slugShort, pseudo: 'EmailRetry' })
      .expect(201);
    const playerId = BigInt(joinRes.body.player.id);
    const resumeToken = joinRes.body.resumeToken;

    await prisma.session.update({
      where: { id: sessionId },
      data: { state: 'ended', endedAt: new Date() },
    });
    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 1 },
    });

    const patchRes = await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'e@test.com', consent: true })
      .expect(200);
    expect(patchRes.body.emailQueued).toBe(true);

    await flushPrizeEmailQueueForTests();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const prize = await prisma.prize.findUnique({
      where: { playerId_sessionId: { playerId, sessionId } },
    });
    expect(prize?.emailSentAt).not.toBeNull();
  });

  it('double échec envoi → prize créé, emailSentAt null après file', async () => {
    const sendEmail = vi.spyOn(emailNs, 'sendEmail');
    sendEmail.mockRejectedValue(new Error('smtp dead'));

    const { user, token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUnique({
      where: { id: infra.screenId },
      select: { cinemaId: true },
    });
    if (!screen) throw new Error('screen');
    await seedCinemaPrizesConfig(screen.cinemaId);

    const quiz = await prisma.quiz.create({
      data: {
        slug: `qf-${Date.now()}`,
        title: 'QF',
        status: 'published',
        createdByUserId: user.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q',
        answers: {
          create: [
            { position: 'A', text: 'A', isCorrect: true },
            { position: 'B', text: 'B', isCorrect: false },
          ],
        },
      },
    });

    const sessionRes = await authed(request(app).post('/api/sessions'), token)
      .send({ quizSlug: quiz.slug, screenId: infra.screenId.toString() })
      .expect(201);
    const sessionId = BigInt(sessionRes.body.id);
    const joinRes = await request(app)
      .post('/api/players/join')
      .send({ sessionSlugShort: sessionRes.body.slugShort, pseudo: 'EmailFailX' })
      .expect(201);
    const playerId = BigInt(joinRes.body.player.id);
    const resumeToken = joinRes.body.resumeToken;

    await prisma.session.update({
      where: { id: sessionId },
      data: { state: 'ended', endedAt: new Date() },
    });
    await prisma.player.update({
      where: { id: playerId },
      data: { rankFinal: 1 },
    });

    const res = await request(app)
      .patch(`/api/players/${playerId}/email`)
      .set('X-Player-Token', resumeToken)
      .send({ email: 'f@test.com', consent: true })
      .expect(200);
    expect(res.body.emailQueued).toBe(true);

    await flushPrizeEmailQueueForTests();

    const prize = await prisma.prize.findUnique({
      where: { playerId_sessionId: { playerId, sessionId } },
    });
    expect(prize?.emailSentAt).toBeNull();
  });
});
