import request from 'supertest';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/db/index.js';
import { signPrize } from '../src/modules/prizes/prize-signature.service.js';
import {
  getIntegrationApp,
  truncateQuizRelatedTables,
  minimalCinemaAndScreen,
  createSuperAdminUser,
  authed,
} from './helpers/integration.js';
import {
  resetPrizeRedeemRateLimitForTests,
  checkPrizeRedeemRateLimit,
} from '../src/shared/rate-limit/prize-redeem.rate-limit.js';

import * as emailNs from '../src/shared/email/index.js';

const STAFF_PIN = '4321';

async function seedStaffPin(cinemaId: bigint, pin = STAFF_PIN) {
  const hash = await bcrypt.hash(pin, 10);
  await prisma.cinema.update({ where: { id: cinemaId }, data: { staffPinHash: hash } });
}

async function seedPrize(opts: {
  screenId: bigint;
  cinemaId: bigint;
  userId: bigint;
  redeemCode?: string;
  shortCode?: string;
  expiresAt?: Date | null;
  redeemedAt?: Date | null;
}) {
  const quiz = await prisma.quiz.create({
    data: {
      slug: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'T',
      status: 'published',
      createdByUserId: opts.userId,
    },
  });
  const session = await prisma.session.create({
    data: {
      slugShort: `s${Date.now()}`.slice(-10).padStart(4, '0'),
      quizId: quiz.id,
      screenId: opts.screenId,
      state: 'ended',
      endedAt: new Date(),
    },
  });
  const player = await prisma.player.create({
    data: {
      sessionId: session.id,
      pseudo: 'P1',
      resumeToken: `rt-${Date.now()}-prize-redeem-test-token`,
      rankFinal: 1,
      emailForPrize: 'p@test.com',
    },
  });
  const redeemCode = opts.redeemCode ?? `code${Date.now()}`.slice(0, 16);
  const signature = signPrize(redeemCode);
  const prize = await prisma.prize.create({
    data: {
      sessionId: session.id,
      playerId: player.id,
      redeemCode,
      signature,
      shortCode: opts.shortCode ?? 'ABC-234',
      rank: 1,
      label: 'Lot test',
      type: 'discount_qr',
      expiresAt: opts.expiresAt ?? null,
      redeemedAt: opts.redeemedAt ?? null,
      emailSentAt: new Date(),
    },
  });
  return { prize, session, cinemaId: opts.cinemaId, redeemCode, signature };
}

describe('prize redeem Phase B', () => {
  let app: ReturnType<typeof getIntegrationApp>;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    resetPrizeRedeemRateLimitForTests();
    app = getIntegrationApp();
  });

  it('GET status — valide / expiré / déjà utilisé', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    await seedStaffPin(screen.cinemaId);

    const valid = await seedPrize({
      screenId: infra.screenId,
      cinemaId: screen.cinemaId,
      userId: user.id,
      shortCode: 'XYZ-567',
    });
    const res = await request(app)
      .get(`/api/prizes/redeem/${valid.redeemCode}?sig=${valid.signature}`)
      .expect(200);
    expect(res.body.status).toBe('valid');
    expect(res.body.shortCode).toBe('XYZ-567');

    const expired = await seedPrize({
      screenId: infra.screenId,
      cinemaId: screen.cinemaId,
      userId: user.id,
      shortCode: 'DEF-456',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const expRes = await request(app)
      .get(`/api/prizes/redeem/${expired.redeemCode}?sig=${expired.signature}`)
      .expect(200);
    expect(expRes.body.status).toBe('expired');

    const used = await seedPrize({
      screenId: infra.screenId,
      cinemaId: screen.cinemaId,
      userId: user.id,
      shortCode: 'GHI-789',
      redeemedAt: new Date(),
    });
    const usedRes = await request(app)
      .get(`/api/prizes/redeem/${used.redeemCode}?sig=${used.signature}`)
      .expect(200);
    expect(usedRes.body.status).toBe('redeemed');
  });

  it('GET status — signature invalide et introuvable', async () => {
    const code = 'abcdefghijklmnop';
    const badSig = await request(app)
      .get(`/api/prizes/redeem/${code}?sig=${'a'.repeat(64)}`)
      .expect(401);
    expect(badSig.body.error.code).toBe('INVALID_SIGNATURE');

    const sig = signPrize(code);
    const notFound = await request(app).get(`/api/prizes/redeem/${code}?sig=${sig}`).expect(404);
    expect(notFound.body.error.code).toBe('PRIZE_NOT_FOUND');
  });

  it('POST redeem — PIN non configuré', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });

    const { redeemCode, signature } = await seedPrize({
      screenId: infra.screenId,
      cinemaId: screen.cinemaId,
      userId: user.id,
    });

    const noPin = await request(app)
      .post(`/api/prizes/redeem/${redeemCode}`)
      .send({ sig: signature, staffPin: STAFF_PIN })
      .expect(403);
    expect(noPin.body.error.code).toBe('PIN_NOT_CONFIGURED');
  });

  it('POST redeem — mauvais PIN et succès', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    await seedStaffPin(screen.cinemaId);

    const { redeemCode, signature } = await seedPrize({
      screenId: infra.screenId,
      cinemaId: screen.cinemaId,
      userId: user.id,
    });

    const badPin = await request(app)
      .post(`/api/prizes/redeem/${redeemCode}`)
      .send({ sig: signature, staffPin: '9999' })
      .expect(401);
    expect(badPin.body.error.code).toBe('INVALID_PIN');

    const ok = await request(app)
      .post(`/api/prizes/redeem/${redeemCode}`)
      .send({ sig: signature, staffPin: STAFF_PIN })
      .expect(200);
    expect(ok.body.redeemedAt).toBeTruthy();

    const again = await request(app)
      .post(`/api/prizes/redeem/${redeemCode}`)
      .send({ sig: signature, staffPin: STAFF_PIN })
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_REDEEMED');
    expect(again.body.error.details.redeemedAt).toBeTruthy();
  });

  it('POST lookup — PIN obligatoire, pas de fuite sur mauvais PIN', async () => {
    const { user } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    await seedStaffPin(screen.cinemaId);
    await seedPrize({
      screenId: infra.screenId,
      cinemaId: screen.cinemaId,
      userId: user.id,
      shortCode: 'JKL-345',
    });

    const bad = await request(app)
      .post('/api/prizes/lookup')
      .send({ shortCode: 'JKL-345', staffPin: '0000' })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_PIN');

    const unknown = await request(app)
      .post('/api/prizes/lookup')
      .send({ shortCode: 'MNO-678', staffPin: STAFF_PIN })
      .expect(401);
    expect(unknown.body.error.code).toBe('INVALID_PIN');

    const ok = await request(app)
      .post('/api/prizes/lookup')
      .send({ shortCode: 'JKL-345', staffPin: STAFF_PIN })
      .expect(200);
    expect(ok.body.redeemCode).toBeTruthy();
    expect(ok.body.sig).toBeTruthy();
  });

  it('rate limit lookup/redeem', () => {
    resetPrizeRedeemRateLimitForTests();
    const key = 'test-ip';
    for (let i = 0; i < 5; i++) {
      expect(checkPrizeRedeemRateLimit(key).allowed).toBe(true);
    }
    expect(checkPrizeRedeemRateLimit(key).allowed).toBe(false);
  });

  it('POST resend-email — limite 3 et scoping', async () => {
    vi.spyOn(emailNs, 'sendEmail').mockResolvedValue(undefined);
    const { user, token } = await createSuperAdminUser();
    const infra = await minimalCinemaAndScreen();
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: infra.screenId } });
    const { prize } = await seedPrize({
      screenId: infra.screenId,
      cinemaId: screen.cinemaId,
      userId: user.id,
    });

    for (let i = 0; i < 3; i++) {
      await authed(request(app).post(`/api/prizes/${prize.id}/resend-email`), token).expect(200);
    }
    const blocked = await authed(
      request(app).post(`/api/prizes/${prize.id}/resend-email`),
      token,
    ).expect(429);
    expect(blocked.body.error.code).toBe('RESEND_LIMIT_REACHED');
  });
});
