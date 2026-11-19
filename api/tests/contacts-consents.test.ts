import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { signPrize } from '../src/modules/prizes/prize-signature.service.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

/** C5 : consentements email (cases facultatives, désinscription, exports super_admin). */

process.env.EMAIL_SEND_RATE_MS = '100';

function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

describe('email consents and contact exports (C5)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let superToken: string;
  let cinema: { id: bigint; slug: string; screenId: bigint };
  let sponsor: { id: bigint; slug: string };
  let campaignId: bigint;
  let gameId: bigint;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    await prisma.user.deleteMany({ where: { role: 'sponsor' } });
    await prisma.sponsor.deleteMany({});
    app = getIntegrationApp();
    const admin = await createSuperAdminUser();
    superToken = admin.token;
    const infra = await minimalCinemaAndScreen();
    const c = await prisma.cinema.update({
      where: { slug: infra.cinemaSlug },
      data: {
        name: 'Ciné Lumière',
        prizesConfig: { all: { type: 'discount_qr', label: 'Popcorn offert' } },
      },
    });
    cinema = { id: c.id, slug: c.slug, screenId: infra.screenId };
    const s = await prisma.sponsor.create({ data: { name: 'Marque Soda', slug: `soda-${uid()}` } });
    sponsor = { id: s.id, slug: s.slug };
    const game = await prisma.game.create({
      data: {
        slug: `jeu-${uid()}`,
        title: 'Jeu Soda',
        engineKey: 'poll',
        kind: 'sponsored',
        sponsorId: s.id,
        status: 'published',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        sponsorId: s.id,
        gameId: game.id,
        name: 'Campagne Soda',
        status: 'active',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2027-12-31T00:00:00Z'),
        pricing: 'per_session',
        unitPriceCents: 100,
        cinemaSharePercent: 50,
      },
    });
    campaignId = campaign.id;
    gameId = game.id;
  });

  /** Séance terminée avec une manche du jeu sponsorisé, et un joueur classé. */
  async function playerOfEndedSession(pseudo = 'Ana') {
    const session = await prisma.session.create({
      data: {
        slugShort: uid(),
        screenId: cinema.screenId,
        state: 'ended',
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });
    await prisma.sessionRound.create({
      data: {
        sessionId: session.id,
        position: 1,
        gameId,
        state: 'ended',
        startedAt: new Date(),
      },
    });
    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        pseudo,
        resumeToken: `rt-consent-${uid()}`,
        rankFinal: 5,
      },
    });
    return { session, player };
  }

  function claim(
    player: { id: bigint; resumeToken: string },
    body: Record<string, unknown>,
  ): request.Test {
    return request(app)
      .patch(`/api/players/${player.id}/email`)
      .set('X-Player-Token', player.resumeToken)
      .send({ consent: true, ...body });
  }

  async function agreeCinema(enabled: boolean) {
    await authed(request(app).put(`/api/cinemas/${cinema.slug}/email-sharing`), superToken)
      .send({ enabled })
      .expect(200);
  }

  async function agreeSponsor(enabled: boolean) {
    await authed(request(app).patch(`/api/campaigns/${campaignId}`), superToken)
      .send({ emailSharingEnabled: enabled })
      .expect(200);
  }

  it('consent-options: shows a box only when the matching agreement exists', async () => {
    const { player } = await playerOfEndedSession();
    const url = `/api/players/${player.id}/consent-options`;

    await request(app).get(url).expect(401);
    await request(app).get(url).set('X-Player-Token', 'nope').expect(404);

    const none = await request(app).get(url).set('X-Player-Token', player.resumeToken).expect(200);
    expect(none.body).toEqual({ cinema: null, sponsor: null });

    await agreeCinema(true);
    await agreeSponsor(true);
    const both = await request(app).get(url).set('X-Player-Token', player.resumeToken).expect(200);
    expect(both.body).toEqual({
      cinema: { name: 'Ciné Lumière' },
      sponsor: { name: 'Marque Soda' },
    });

    // Une campagne en pause ne compte pas.
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } });
    const paused = await request(app)
      .get(url)
      .set('X-Player-Token', player.resumeToken)
      .expect(200);
    expect(paused.body.sponsor).toBeNull();
  });

  it('the prize works exactly as before without any optional box', async () => {
    const { player } = await playerOfEndedSession();
    const res = await claim(player, { email: 'Ana@Test.com' }).expect(200);
    expect(res.body).toMatchObject({ ok: true, emailQueued: true });
    expect(await prisma.contact.count()).toBe(0);
    expect(await prisma.contactConsent.count()).toBe(0);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(p.emailForPrize).toBe('Ana@Test.com');
  });

  it('records the 3 boxes when every agreement exists (lower-cased email, wording version)', async () => {
    await agreeCinema(true);
    await agreeSponsor(true);
    const { session, player } = await playerOfEndedSession();
    await claim(player, {
      email: 'Ana@Test.com',
      optInPlatform: true,
      optInCinema: true,
      optInSponsor: true,
    }).expect(200);

    const contact = await prisma.contact.findUniqueOrThrow({
      where: { email: 'ana@test.com' },
      include: { consents: true },
    });
    expect(contact.unsubscribedAllAt).toBeNull();
    const byScope = Object.fromEntries(contact.consents.map((c) => [c.scope, c]));
    expect(Object.keys(byScope).sort()).toEqual(['cinema', 'platform', 'sponsor']);
    expect(byScope.cinema!.cinemaId).toBe(cinema.id);
    expect(byScope.sponsor!.sponsorId).toBe(sponsor.id);
    for (const c of contact.consents) {
      expect(c.wordingVersion).toBe('2026-11');
      expect(c.sessionId).toBe(session.id);
      expect(c.revokedAt).toBeNull();
    }
  });

  it('ignores the cinema box without the cinema agreement', async () => {
    await agreeSponsor(true);
    const { player } = await playerOfEndedSession();
    await claim(player, { email: 'a@test.com', optInCinema: true, optInSponsor: true }).expect(200);
    const scopes = (await prisma.contactConsent.findMany()).map((c) => c.scope);
    expect(scopes).toEqual(['sponsor']);
  });

  it('ignores the sponsor box without an active campaign agreeing to share', async () => {
    await agreeCinema(true);
    const { player } = await playerOfEndedSession();
    await claim(player, { email: 'a@test.com', optInCinema: true, optInSponsor: true }).expect(200);
    const scopes = (await prisma.contactConsent.findMany()).map((c) => c.scope);
    expect(scopes).toEqual(['cinema']);
  });

  it('records the platform box alone, which needs no agreement', async () => {
    const { player } = await playerOfEndedSession();
    await claim(player, {
      email: 'a@test.com',
      optInPlatform: true,
      optInCinema: true,
      optInSponsor: true,
    }).expect(200);
    const consents = await prisma.contactConsent.findMany();
    expect(consents.map((c) => c.scope)).toEqual(['platform']);
    expect(consents[0]!.cinemaId).toBeNull();
    expect(consents[0]!.sponsorId).toBeNull();
  });

  it('reuses the contact and reactivates a revoked consent', async () => {
    const first = await playerOfEndedSession('Un');
    await claim(first.player, { email: 'same@test.com', optInPlatform: true }).expect(200);
    await prisma.contactConsent.updateMany({ data: { revokedAt: new Date() } });

    const second = await playerOfEndedSession('Deux');
    await claim(second.player, { email: 'SAME@test.com', optInPlatform: true }).expect(200);

    expect(await prisma.contact.count()).toBe(1);
    const consents = await prisma.contactConsent.findMany();
    expect(consents).toHaveLength(1);
    expect(consents[0]!.revokedAt).toBeNull();
    expect(consents[0]!.sessionId).toBe(second.session.id);
  });

  it('unsubscribe revokes every consent and the contact leaves every export', async () => {
    await agreeCinema(true);
    await agreeSponsor(true);
    const { player } = await playerOfEndedSession();
    await claim(player, {
      email: 'gone@test.com',
      optInPlatform: true,
      optInCinema: true,
      optInSponsor: true,
    }).expect(200);
    const kept = await playerOfEndedSession('Reste');
    await claim(kept.player, { email: 'kept@test.com', optInPlatform: true }).expect(200);

    const prize = await prisma.prize.findFirstOrThrow({ where: { playerId: player.id } });
    await request(app)
      .post(`/api/prizes/unsubscribe/${prize.redeemCode}`)
      .send({ signature: signPrize(prize.redeemCode) })
      .expect(200);

    const contact = await prisma.contact.findUniqueOrThrow({
      where: { email: 'gone@test.com' },
      include: { consents: true },
    });
    expect(contact.unsubscribedAllAt).not.toBeNull();
    expect(contact.consents).toHaveLength(3);
    expect(contact.consents.every((c) => c.revokedAt !== null)).toBe(true);

    for (const q of [
      'scope=platform',
      `scope=cinema&cinemaSlug=${cinema.slug}`,
      `scope=sponsor&sponsorSlug=${sponsor.slug}`,
    ]) {
      const res = await authed(
        request(app).get(`/api/contacts/export.csv?${q}`),
        superToken,
      ).expect(200);
      expect(res.text).not.toContain('gone@test.com');
    }
    const platform = await authed(
      request(app).get('/api/contacts/export.csv?scope=platform'),
      superToken,
    ).expect(200);
    expect(platform.text).toContain('kept@test.com');
  });

  it('exports CSV per scope and writes a contacts.exported event', async () => {
    await agreeCinema(true);
    const { player } = await playerOfEndedSession();
    await claim(player, { email: 'fan@test.com', optInCinema: true }).expect(200);

    const res = await authed(
      request(app).get(`/api/contacts/export.csv?scope=cinema&cinemaSlug=${cinema.slug}`),
      superToken,
    ).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('email,date_consentement,version_libelle');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^fan@test\.com,\d{4}-\d{2}-\d{2}T[^,]+,2026-11$/);

    let event = null;
    for (let i = 0; i < 20 && !event; i++) {
      event = await prisma.eventLog.findFirst({
        where: { eventType: 'contacts.exported', cinemaId: cinema.id },
      });
      if (!event) await new Promise((r) => setTimeout(r, 50));
    }
    expect(event).not.toBeNull();
    expect(event!.cinemaId).toBe(cinema.id);
    expect(event!.payloadJson).toMatchObject({ scope: 'cinema', rows: 1 });

    const stats = await authed(request(app).get('/api/contacts/stats'), superToken).expect(200);
    expect(stats.body.contacts).toBe(1);
    expect(stats.body.platform).toBe(0);
    expect(stats.body.cinemas.find((c: { slug: string }) => c.slug === cinema.slug)).toMatchObject({
      count: 1,
      emailSharingEnabled: true,
    });
  });

  it('refuses an export without the matching agreement (409 SHARING_NOT_AGREED)', async () => {
    const cinemaRes = await authed(
      request(app).get(`/api/contacts/export.csv?scope=cinema&cinemaSlug=${cinema.slug}`),
      superToken,
    ).expect(409);
    expect(cinemaRes.body.error.code).toBe('SHARING_NOT_AGREED');
    const sponsorRes = await authed(
      request(app).get(`/api/contacts/export.csv?scope=sponsor&sponsorSlug=${sponsor.slug}`),
      superToken,
    ).expect(409);
    expect(sponsorRes.body.error.code).toBe('SHARING_NOT_AGREED');
    await authed(request(app).get('/api/contacts/export.csv?scope=cinema'), superToken).expect(400);

    // Accord retiré après coup : de nouveau refusé, même avec des consentements déjà recueillis.
    await agreeCinema(true);
    const { player } = await playerOfEndedSession();
    await claim(player, { email: 'fan@test.com', optInCinema: true }).expect(200);
    await agreeCinema(false);
    await authed(
      request(app).get(`/api/contacts/export.csv?scope=cinema&cinemaSlug=${cinema.slug}`),
      superToken,
    ).expect(409);
  });

  it('cinema and sponsor roles can neither export nor read a player email', async () => {
    await agreeCinema(true);
    await agreeSponsor(true);
    const { player } = await playerOfEndedSession();
    await claim(player, { email: 'secret@test.com', optInCinema: true }).expect(200);

    const cinemaAdmin = await createCinemaUser('cinema_admin', cinema.id);
    const projectionist = await createCinemaUser('projectionist', cinema.id);
    const sponsorUser = await prisma.user.create({
      data: { email: `s-${uid()}@test.local`, role: 'sponsor', sponsorId: sponsor.id },
    });
    const sponsorToken = await signJwt({ userId: sponsorUser.id.toString(), role: 'sponsor' });

    for (const token of [cinemaAdmin.token, projectionist.token, sponsorToken]) {
      for (const path of [
        `/api/contacts/export.csv?scope=cinema&cinemaSlug=${cinema.slug}`,
        `/api/contacts/export.csv?scope=sponsor&sponsorSlug=${sponsor.slug}`,
        '/api/contacts/export.csv?scope=platform',
        '/api/contacts/stats',
      ]) {
        await authed(request(app).get(path), token).expect(403);
      }
      await authed(request(app).put(`/api/cinemas/${cinema.slug}/email-sharing`), token)
        .send({ enabled: false })
        .expect(403);
    }

    // Liste des lots du cinéma : l'email n'est donné qu'au super_admin.
    const asCinema = await authed(
      request(app).get(`/api/cinemas/${cinema.slug}/prizes`),
      cinemaAdmin.token,
    ).expect(200);
    expect(asCinema.body.items).toHaveLength(1);
    expect(asCinema.body.items[0].playerEmail).toBeNull();
    expect(JSON.stringify(asCinema.body)).not.toContain('secret@test.com');
    const asSuper = await authed(
      request(app).get(`/api/cinemas/${cinema.slug}/prizes`),
      superToken,
    ).expect(200);
    expect(asSuper.body.items[0].playerEmail).toBe('secret@test.com');
  });

  it('a new explicit opt-in after a global unsubscribe lifts it', async () => {
    const first = await playerOfEndedSession('Un');
    await claim(first.player, { email: 'back@test.com', optInPlatform: true }).expect(200);
    const prize = await prisma.prize.findFirstOrThrow({ where: { playerId: first.player.id } });
    await request(app)
      .post(`/api/prizes/unsubscribe/${prize.redeemCode}`)
      .send({ signature: signPrize(prize.redeemCode) })
      .expect(200);
    expect(
      (await prisma.contact.findUniqueOrThrow({ where: { email: 'back@test.com' } }))
        .unsubscribedAllAt,
    ).not.toBeNull();

    const second = await playerOfEndedSession('Deux');
    await claim(second.player, { email: 'back@test.com', optInPlatform: true }).expect(200);
    const contact = await prisma.contact.findUniqueOrThrow({
      where: { email: 'back@test.com' },
      include: { consents: true },
    });
    expect(contact.unsubscribedAllAt).toBeNull();
    expect(contact.consents[0]!.revokedAt).toBeNull();
  });
});
