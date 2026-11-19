import request from 'supertest';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import { parsePrizeCodesText } from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { buildSessionReport } from '../src/modules/sessions/session-report.service.js';
import { sponsorPortalService } from '../src/modules/sponsor-portal/sponsor-portal.service.js';
import { buildPrizeEmail } from '../src/shared/email/templates/prize-email.js';
import { resetPrizeRedeemRateLimitForTests } from '../src/shared/rate-limit/prize-redeem.rate-limit.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

/** C5 : lots à codes fournis par la marque (import, attribution, retrait hors du cinéma). */

process.env.EMAIL_SEND_RATE_MS = '100';

const STAFF_PIN = '4321';

function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

describe('prize codes (C5)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let superToken: string;
  let userId: bigint;
  let cinemaId: bigint;
  let screenId: bigint;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    resetPrizeRedeemRateLimitForTests();
    app = getIntegrationApp();
    const admin = await createSuperAdminUser();
    superToken = admin.token;
    userId = admin.user.id;
    const infra = await minimalCinemaAndScreen();
    screenId = infra.screenId;
    const screen = await prisma.screen.findUniqueOrThrow({ where: { id: screenId } });
    cinemaId = screen.cinemaId;
    await prisma.cinema.update({
      where: { id: cinemaId },
      data: { staffPinHash: await bcrypt.hash(STAFF_PIN, 10) },
    });
  });

  async function codeTemplate(
    mode: 'code_pool' | 'static_code',
    extra: { staticCode?: string } = {},
  ) {
    const res = await authed(
      request(app).post(`/api/cinemas/${await cinemaSlug()}/prize-templates`),
      superToken,
    )
      .send({
        label: 'Place offerte',
        type: 'other',
        redeemMode: mode,
        redeemInstructions: 'Présentez ce code en caisse',
        redeemUrl: 'https://partenaire.example/offre',
        ...extra,
      })
      .expect(201);
    return BigInt(res.body.id as string);
  }

  async function cinemaSlug(): Promise<string> {
    const c = await prisma.cinema.findUniqueOrThrow({ where: { id: cinemaId } });
    return c.slug;
  }

  /** Séance terminée dont le lot de consolation (« all ») est le gabarit, et `n` joueurs classés. */
  async function endedSessionWithPlayers(templateId: bigint, n: number) {
    const quiz = await prisma.quiz.create({
      data: {
        slug: `codes-${uid()}`,
        title: 'Quiz codes',
        status: 'published',
        createdByUserId: userId,
        prizesConfig: { all: { mode: 'template', templateId: templateId.toString() } },
      },
    });
    const session = await prisma.session.create({
      data: {
        slugShort: uid(),
        quizId: quiz.id,
        screenId,
        state: 'ended',
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });
    const players = [];
    for (let i = 0; i < n; i++) {
      players.push(
        await prisma.player.create({
          data: {
            sessionId: session.id,
            pseudo: `J${i}`,
            resumeToken: `rt-codes-${uid()}-${i}`,
            rankFinal: 4 + i,
          },
        }),
      );
    }
    return { session, players };
  }

  function claim(player: { id: bigint; resumeToken: string }, email: string) {
    return request(app)
      .patch(`/api/players/${player.id}/email`)
      .set('X-Player-Token', player.resumeToken)
      .send({ email, consent: true });
  }

  function importCodes(templateId: bigint, text: string) {
    return authed(
      request(app).post(`/api/prize-templates/${templateId}/codes/import`),
      superToken,
    ).send({ text });
  }

  it('parses CSV or text: one code per line, header, quotes and duplicates', () => {
    const parsed = parsePrizeCodesText('code\r\n"AB-1",x\nAB-2;y\n\n  AB-1  \nAB-3\n');
    expect(parsed.codes).toEqual(['AB-1', 'AB-2', 'AB-3']);
    expect(parsed.lineCount).toBe(4);
  });

  it('imports codes (super_admin only), ignores duplicates and syncs the stock', async () => {
    const templateId = await codeTemplate('code_pool');
    const tpl = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: templateId } });
    expect(tpl.redeemMode).toBe('code_pool');
    expect(tpl.stock).toBe(0);

    const first = await importCodes(templateId, 'A1\nA2\nA2\nA3').expect(200);
    expect(first.body).toEqual({ imported: 3, duplicates: 1, total: 3, assigned: 0, remaining: 3 });
    const second = await importCodes(templateId, 'A3\nA4').expect(200);
    expect(second.body).toMatchObject({ imported: 1, duplicates: 1, total: 4, remaining: 4 });

    const after = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: templateId } });
    expect(after.stock).toBe(4);
    expect(after.stockInitial).toBe(4);

    const stats = await authed(
      request(app).get(`/api/prize-templates/${templateId}/codes/stats`),
      superToken,
    ).expect(200);
    expect(stats.body).toEqual({ total: 4, assigned: 0, remaining: 4 });

    const cinemaAdmin = await createCinemaUser('cinema_admin', cinemaId);
    await authed(
      request(app).post(`/api/prize-templates/${templateId}/codes/import`),
      cinemaAdmin.token,
    )
      .send({ text: 'B1' })
      .expect(403);
    await authed(
      request(app).get(`/api/prize-templates/${templateId}/codes/stats`),
      cinemaAdmin.token,
    ).expect(403);

    // Le stock d'un lot à codes ne se saisit pas.
    const patch = await authed(request(app).patch(`/api/prize-templates/${templateId}`), superToken)
      .send({ stock: 50 })
      .expect(409);
    expect(patch.body.error.code).toBe('STOCK_MANAGED_BY_CODES');
  });

  it('refuses more than 10 000 codes per import, and imports into a non code_pool template', async () => {
    const templateId = await codeTemplate('code_pool');
    const many = Array.from({ length: 10_001 }, (_, i) => `C${i}`).join('\n');
    const res = await importCodes(templateId, many).expect(400);
    expect(res.body.error.code).toBe('TOO_MANY_CODES');
    const ok = await importCodes(
      templateId,
      Array.from({ length: 10_000 }, (_, i) => `C${i}`).join('\n'),
    ).expect(200);
    expect(ok.body.imported).toBe(10_000);

    const staticId = await codeTemplate('static_code', { staticCode: 'CINE2026' });
    const refused = await importCodes(staticId, 'X1').expect(409);
    expect(refused.body.error.code).toBe('NOT_CODE_POOL');
  });

  it('assigns distinct codes under 20 concurrent claims, then exhausts the pool', async () => {
    const templateId = await codeTemplate('code_pool');
    const codes = Array.from({ length: 15 }, (_, i) => `PROMO-${i.toString().padStart(2, '0')}`);
    await importCodes(templateId, codes.join('\n')).expect(200);
    const { players } = await endedSessionWithPlayers(templateId, 20);

    const results = await Promise.all(players.map((p, i) => claim(p, `j${i}@test.com`)));
    const ok = results.filter((r) => r.status === 200);
    const refused = results.filter((r) => r.status !== 200);
    expect(ok).toHaveLength(15);
    expect(refused).toHaveLength(5);
    for (const r of refused) expect(r.body.error.code).toBe('PRIZE_NOT_CONFIGURED');

    const prizes = await prisma.prize.findMany({ where: { prizeTemplateId: templateId } });
    expect(prizes).toHaveLength(15);
    const assigned = prizes.map(
      (p) => (p.payloadJson as { partnerCode?: string; redeemMode?: string }).partnerCode,
    );
    expect(new Set(assigned).size).toBe(15);
    expect([...assigned].sort()).toEqual(codes);
    for (const p of prizes) {
      expect((p.payloadJson as { redeemMode?: string }).redeemMode).toBe('code_pool');
    }

    const rows = await prisma.prizeCode.findMany({ where: { templateId } });
    expect(rows.every((r) => r.prizeId !== null && r.assignedAt !== null)).toBe(true);
    expect(new Set(rows.map((r) => r.prizeId!.toString())).size).toBe(15);
    const tpl = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: templateId } });
    expect(tpl.stock).toBe(0);
  });

  it('falls back like an exhausted stock when the stock mirror says yes but no code is left', async () => {
    const templateId = await codeTemplate('code_pool');
    await importCodes(templateId, 'ONLY-1').expect(200);
    // Désalignement simulé : le stock annonce 3 codes, il n'en reste qu'un.
    await prisma.prizeTemplate.update({ where: { id: templateId }, data: { stock: 3 } });
    await prisma.cinema.update({
      where: { id: cinemaId },
      data: { prizesConfig: { all: { type: 'discount_qr', label: 'Lot du cinéma' } } },
    });
    const { players } = await endedSessionWithPlayers(templateId, 2);

    await claim(players[0]!, 'a@test.com').expect(200);
    await claim(players[1]!, 'b@test.com').expect(200);

    const second = await prisma.prize.findFirstOrThrow({ where: { playerId: players[1]!.id } });
    expect(second.label).toBe('Lot du cinéma');
    expect(second.prizeTemplateId).toBeNull();
    // Le lot refusé n'a pas consommé de stock (transaction annulée).
    const tpl = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: templateId } });
    expect(tpl.stock).toBe(2);
  });

  it('shows the partner code on /redeem and refuses staff PIN validation (409)', async () => {
    const templateId = await codeTemplate('code_pool');
    await importCodes(templateId, 'PARTNER-42').expect(200);
    const { players } = await endedSessionWithPlayers(templateId, 1);
    await claim(players[0]!, 'p@test.com').expect(200);
    const prize = await prisma.prize.findFirstOrThrow({ where: { playerId: players[0]!.id } });

    const status = await request(app)
      .get(`/api/prizes/redeem/${prize.redeemCode}?sig=${prize.signature}`)
      .expect(200);
    expect(status.body).toMatchObject({
      redeemMode: 'code_pool',
      partnerCode: 'PARTNER-42',
      redeemInstructions: 'Présentez ce code en caisse',
      redeemUrl: 'https://partenaire.example/offre',
    });
    expect(status.body.partnerQrDataUrl).toMatch(/^data:image\/png;base64,/);

    const redeem = await request(app)
      .post(`/api/prizes/redeem/${prize.redeemCode}`)
      .send({ sig: prize.signature, staffPin: STAFF_PIN, redeemedVia: 'qr' })
      .expect(409);
    expect(redeem.body.error.code).toBe('NOT_STAFF_REDEEMABLE');

    const lookup = await request(app)
      .post('/api/prizes/lookup')
      .send({ shortCode: prize.shortCode, staffPin: STAFF_PIN })
      .expect(409);
    expect(lookup.body.error.code).toBe('NOT_STAFF_REDEEMABLE');

    const after = await prisma.prize.findUniqueOrThrow({ where: { id: prize.id } });
    expect(after.redeemedAt).toBeNull();
  });

  it('static_code: every winner gets the same partner code', async () => {
    const templateId = await codeTemplate('static_code', { staticCode: 'CINE2026' });
    const { players } = await endedSessionWithPlayers(templateId, 2);
    await claim(players[0]!, 'a@test.com').expect(200);
    await claim(players[1]!, 'b@test.com').expect(200);
    const prizes = await prisma.prize.findMany({ where: { prizeTemplateId: templateId } });
    expect(prizes.map((p) => (p.payloadJson as { partnerCode?: string }).partnerCode)).toEqual([
      'CINE2026',
      'CINE2026',
    ]);

    const missing = await authed(
      request(app).post(`/api/cinemas/${await cinemaSlug()}/prize-templates`),
      superToken,
    )
      .send({ label: 'Sans code', type: 'other', redeemMode: 'static_code' })
      .expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('staff_pin prizes are unchanged (validation by PIN still works)', async () => {
    const res = await authed(
      request(app).post(`/api/cinemas/${await cinemaSlug()}/prize-templates`),
      superToken,
    )
      .send({ label: 'Popcorn', type: 'discount_qr' })
      .expect(201);
    expect(res.body.redeemMode).toBe('staff_pin');
    const { players } = await endedSessionWithPlayers(BigInt(res.body.id as string), 1);
    await claim(players[0]!, 'a@test.com').expect(200);
    const prize = await prisma.prize.findFirstOrThrow({ where: { playerId: players[0]!.id } });
    expect(prize.payloadJson).toEqual({
      value: undefined,
      configEntry: expect.objectContaining({ label: 'Popcorn' }),
    });
    const status = await request(app)
      .get(`/api/prizes/redeem/${prize.redeemCode}?sig=${prize.signature}`)
      .expect(200);
    expect(status.body.redeemMode).toBe('staff_pin');
    expect(status.body.partnerCode).toBeNull();
    await request(app)
      .post(`/api/prizes/redeem/${prize.redeemCode}`)
      .send({ sig: prize.signature, staffPin: STAFF_PIN, redeemedVia: 'qr' })
      .expect(200);
  });

  it('session report and sponsor portal return null redeemed counts for code prizes', async () => {
    const templateId = await codeTemplate('static_code', { staticCode: 'CINE2026' });
    const { session, players } = await endedSessionWithPlayers(templateId, 1);
    await claim(players[0]!, 'a@test.com').expect(200);

    const report = await buildSessionReport(session.id);
    expect(report.prizes.total).toBe(1);
    expect(report.prizes.redeemedCount).toBeNull();
    expect(report.prizes.redemptionRate).toBeNull();

    const sponsor = await prisma.sponsor.create({ data: { name: 'Marque', slug: `m-${uid()}` } });
    const game = await prisma.game.create({
      data: {
        slug: `jeu-${uid()}`,
        title: 'Jeu',
        engineKey: 'poll',
        kind: 'sponsored',
        sponsorId: sponsor.id,
        status: 'published',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        sponsorId: sponsor.id,
        gameId: game.id,
        name: 'Campagne',
        status: 'active',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2027-12-31T00:00:00Z'),
        pricing: 'per_session',
        unitPriceCents: 100,
        cinemaSharePercent: 50,
      },
    });
    const round = await prisma.sessionRound.create({
      data: { sessionId: session.id, position: 1, gameId: game.id, state: 'ended' },
    });
    await prisma.delivery.create({
      data: {
        campaignId: campaign.id,
        sessionId: session.id,
        roundId: round.id,
        screenId,
        cinemaId,
        playedAt: new Date(),
        participants: 1,
        finishers: 1,
        prizesIssued: 1,
        billable: true,
        amountCents: 100,
        cinemaShareCents: 50,
      },
    });
    const stats = await sponsorPortalService.getCampaignStats(
      { role: 'sponsor', sponsorId: sponsor.id },
      campaign.id,
      {},
    );
    expect(stats.prizesIssued).toBe(1);
    expect(stats.prizesRedeemed).toBeNull();
  });

  it('prize email shows the partner code instead of the PIN QR code', () => {
    const base = {
      pseudo: 'Ana',
      rank: 4,
      quizTitle: 'Quiz',
      cinemaName: 'Ciné',
      cinemaLogoUrl: null,
      prizeLabel: 'Place offerte',
      redeemUrl: 'https://app.example/redeem/x?sig=y',
      redeemCode: 'x',
      shortCode: 'ABC-234',
      unsubscribeUrl: 'https://app.example/unsubscribe',
      qrCodeDataUrl: 'data:image/png;base64,PIN',
    };
    const email = buildPrizeEmail({
      ...base,
      partner: {
        code: 'PARTNER-42',
        qrCodeDataUrl: 'data:image/png;base64,PARTNER',
        instructions: 'Présentez ce code en caisse',
        url: 'https://partenaire.example/offre',
      },
    });
    expect(email.html).toContain('PARTNER-42');
    expect(email.html).toContain('data:image/png;base64,PARTNER');
    expect(email.html).toContain('Présentez ce code en caisse');
    expect(email.html).toContain('https://partenaire.example/offre');
    expect(email.html).not.toContain('data:image/png;base64,PIN');
    expect(email.html).not.toContain('ABC-234');
    expect(email.text).toContain('Ton code : PARTNER-42');
    expect(email.text).not.toContain('Code comptoir');

    const pin = buildPrizeEmail(base);
    expect(pin.html).toContain('data:image/png;base64,PIN');
    expect(pin.html).toContain('ABC-234');
  });
});
