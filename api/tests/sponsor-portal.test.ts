import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { assertCanAccessSponsor } from '../src/shared/auth/tenant-scope.js';
import { resolveSessionSponsor } from '../src/modules/sessions/session-content.service.js';
import { buildMobilePlayerStateSnapshot } from '../src/modules/sessions/session-resume.service.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateSponsorsAndQuizzes,
} from './helpers/integration.js';

/** C4 : rôle sponsor, portail sponsor (agrégats, export), invitations, sponsor de séance. */

function code(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function sponsorUser(sponsorId: bigint) {
  const user = await prisma.user.create({
    data: {
      email: `sponsor-${code().toLowerCase()}@sponsor-test.local`,
      displayName: 'Contact sponsor',
      role: 'sponsor',
      sponsorId,
    },
  });
  const token = await signJwt({ userId: user.id.toString(), role: 'sponsor' });
  return { user, token };
}

describe('sponsor portal and sponsor role (C4)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let superToken: string;
  let sponsorA: { id: bigint; slug: string };
  let sponsorB: { id: bigint; slug: string };
  let gameA: { id: bigint };
  let gameB: { id: bigint };
  let cinema1: { id: bigint; screenId: bigint; slug: string };
  let cinema2: { id: bigint; screenId: bigint; slug: string };

  async function cinema(name: string, city: string | null) {
    const infra = await minimalCinemaAndScreen();
    const c = await prisma.cinema.update({
      where: { slug: infra.cinemaSlug },
      data: { name, city },
    });
    return { id: c.id, screenId: infra.screenId, slug: c.slug };
  }

  async function sponsoredGame(sponsorId: bigint, kind: 'sponsored' | 'internal' = 'sponsored') {
    return prisma.game.create({
      data: {
        slug: `jeu-${code().toLowerCase()}`,
        title: 'Quiz du sponsor',
        engineKey: 'poll',
        kind,
        sponsorId,
        status: 'published',
        catalogEnabled: true,
      },
      select: { id: true },
    });
  }

  async function campaign(
    sponsorId: bigint,
    gameId: bigint,
    status: 'active' | 'draft' = 'active',
  ) {
    return prisma.campaign.create({
      data: {
        sponsorId,
        gameId,
        name: `Campagne ${code()}`,
        status,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2027-12-31T00:00:00Z'),
        pricing: 'per_session',
        unitPriceCents: 1000,
        cinemaSharePercent: 40,
      },
    });
  }

  /** Une diffusion figée (séance, manche, joueurs nommés, journal) : agrégats connus. */
  async function delivery(input: {
    campaignId: bigint;
    gameId: bigint;
    cinema: { id: bigint; screenId: bigint };
    playedAt: string;
    participants: number;
    finishers: number;
    prizesIssued: number;
    attendance: number | null;
    billable: boolean;
    amountCents: number;
    redeemedPrizes?: number;
  }) {
    const playedAt = new Date(input.playedAt);
    const session = await prisma.session.create({
      data: {
        slugShort: code(),
        screenId: input.cinema.screenId,
        state: 'ended',
        startedAt: playedAt,
        endedAt: playedAt,
        attendance: input.attendance,
      },
    });
    const round = await prisma.sessionRound.create({
      data: {
        sessionId: session.id,
        position: 1,
        gameId: input.gameId,
        state: 'ended',
        startedAt: playedAt,
        endedAt: playedAt,
      },
    });
    // Joueurs avec pseudo et email : ils ne doivent jamais sortir du portail.
    for (let i = 0; i < (input.redeemedPrizes ?? 0) + 1; i++) {
      const player = await prisma.player.create({
        data: {
          sessionId: session.id,
          pseudo: `SecretPseudo${i}`,
          resumeToken: `rt-${code()}-${i}-${Date.now()}`,
          emailForPrize: `secret${i}@player-test.local`,
        },
      });
      if (i < (input.redeemedPrizes ?? 0)) {
        await prisma.prize.create({
          data: {
            sessionId: session.id,
            playerId: player.id,
            redeemCode: `rc-${code()}-${i}`,
            signature: 'sig',
            rank: i + 1,
            label: 'Popcorn',
            type: 'other',
            shortCode: code(),
            redeemedAt: playedAt,
          },
        });
      }
    }
    return prisma.delivery.create({
      data: {
        campaignId: input.campaignId,
        sessionId: session.id,
        roundId: round.id,
        screenId: input.cinema.screenId,
        cinemaId: input.cinema.id,
        playedAt,
        proofDisplayedAt: playedAt,
        participants: input.participants,
        finishers: input.finishers,
        prizesIssued: input.prizesIssued,
        attendance: input.attendance,
        billable: input.billable,
        nonBillableReason: input.billable ? null : 'too_few_players',
        amountCents: input.amountCents,
        cinemaShareCents: Math.round(input.amountCents * 0.4),
      },
    });
  }

  beforeEach(async () => {
    await truncateSponsorsAndQuizzes();
    await prisma.invitation.deleteMany({ where: { email: { endsWith: '@sponsor-test.local' } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@sponsor-test.local' } } });
    app = getIntegrationApp();
    superToken = (await createSuperAdminUser()).token;
    sponsorA = await prisma.sponsor.create({
      data: { slug: `sp-a-${code().toLowerCase()}`, name: 'Popcorn & Co' },
      select: { id: true, slug: true },
    });
    sponsorB = await prisma.sponsor.create({
      data: { slug: `sp-b-${code().toLowerCase()}`, name: 'Soda Max' },
      select: { id: true, slug: true },
    });
    gameA = await sponsoredGame(sponsorA.id);
    gameB = await sponsoredGame(sponsorB.id);
    cinema1 = await cinema('Cinéma Lumière', 'Lyon');
    cinema2 = await cinema('Le Grand Rex', 'Paris');
  });

  afterAll(async () => {
    await truncateSponsorsAndQuizzes();
    await prisma.invitation.deleteMany({ where: { email: { endsWith: '@sponsor-test.local' } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@sponsor-test.local' } } });
  });

  describe('cloisonnement', () => {
    it('sponsor A cannot read the campaign of sponsor B, and only lists its own', async () => {
      const campA = await campaign(sponsorA.id, gameA.id);
      const campB = await campaign(sponsorB.id, gameB.id);
      await campaign(sponsorA.id, gameA.id, 'draft');
      const { token } = await sponsorUser(sponsorA.id);

      const list = await authed(request(app).get('/api/sponsor-portal/campaigns'), token).expect(
        200,
      );
      expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([campA.id.toString()]);

      await authed(request(app).get(`/api/sponsor-portal/campaigns/${campA.id}`), token).expect(
        200,
      );
      await authed(request(app).get(`/api/sponsor-portal/campaigns/${campB.id}`), token).expect(
        403,
      );
      await authed(
        request(app).get(`/api/sponsor-portal/campaigns/${campB.id}/export.csv`),
        token,
      ).expect(403);
      await authed(
        request(app).get(`/api/sponsor-portal/campaigns?sponsorSlug=${sponsorB.slug}`),
        token,
      ).expect(403);
    });

    it('super_admin reads any sponsor; cinema roles are refused on the portal', async () => {
      const campB = await campaign(sponsorB.id, gameB.id);
      await authed(
        request(app).get(`/api/sponsor-portal/campaigns/${campB.id}`),
        superToken,
      ).expect(200);
      const { token: adminToken } = await createCinemaUser('cinema_admin', cinema1.id);
      await authed(request(app).get('/api/sponsor-portal/campaigns'), adminToken).expect(403);
      await authed(
        request(app).get(`/api/sponsor-portal/campaigns/${campB.id}`),
        adminToken,
      ).expect(403);
    });

    it('a sponsor user without sponsor is refused', async () => {
      const user = await prisma.user.create({
        data: { email: `orphan@sponsor-test.local`, role: 'sponsor' },
      });
      const token = await signJwt({ userId: user.id.toString(), role: 'sponsor' });
      await authed(request(app).get('/api/sponsor-portal/campaigns'), token).expect(403);
    });

    it('assertCanAccessSponsor', async () => {
      await expect(
        assertCanAccessSponsor({ role: 'super_admin', sponsorId: null }, sponsorA.id),
      ).resolves.toBeUndefined();
      await expect(
        assertCanAccessSponsor({ role: 'sponsor', sponsorId: sponsorA.id }, sponsorA.id),
      ).resolves.toBeUndefined();
      await expect(
        assertCanAccessSponsor({ role: 'sponsor', sponsorId: sponsorB.id }, sponsorA.id),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        assertCanAccessSponsor({ role: 'cinema_admin', sponsorId: sponsorA.id }, sponsorA.id),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('sponsor role is refused on a sample of cinema and admin routes', async () => {
      const { token } = await sponsorUser(sponsorA.id);
      const camp = await campaign(sponsorA.id, gameA.id);
      const routes: [method: 'get' | 'post' | 'patch', path: string][] = [
        ['get', '/api/cinemas'],
        ['get', `/api/cinemas/${cinema1.slug}`],
        ['get', `/api/cinemas/${cinema1.slug}/screens`],
        ['get', '/api/catalog'],
        ['get', `/api/cinemas/${cinema1.slug}/programs`],
        ['get', '/api/sessions/reports'],
        ['get', '/api/dashboard/today'],
        ['get', `/api/cinemas/${cinema1.slug}/statement?month=2026-11`],
        ['get', '/api/campaigns'],
        ['get', `/api/campaigns/${camp.id}`],
        ['get', '/api/sponsors'],
        ['get', `/api/sponsors/${sponsorA.slug}`],
        ['get', '/api/games'],
        ['get', '/api/quizzes/'],
        ['post', '/api/sessions'],
        ['post', '/api/invitations'],
        ['patch', `/api/screens/${cinema1.screenId}`],
      ];
      for (const [method, path] of routes) {
        const res = await authed(request(app)[method](path), token).send({});
        expect({ path, status: res.status }).toEqual({ path, status: 403 });
      }
    });
  });

  describe('agrégats', () => {
    it('exact aggregates on a fixed dataset, with period and Paris days', async () => {
      const camp = await campaign(sponsorA.id, gameA.id);
      const other = await campaign(sponsorA.id, gameA.id);
      const base = { campaignId: camp.id, gameId: gameA.id };
      // 2026-11-10 23:30 Paris (22:30 UTC) : jour du 10 à Paris.
      await delivery({
        ...base,
        cinema: cinema1,
        playedAt: '2026-11-10T22:30:00Z',
        participants: 10,
        finishers: 8,
        prizesIssued: 3,
        attendance: 50,
        billable: true,
        amountCents: 1000,
        redeemedPrizes: 2,
      });
      // 2026-11-10 23:30 UTC = 11 nov. 00:30 Paris.
      await delivery({
        ...base,
        cinema: cinema2,
        playedAt: '2026-11-10T23:30:00Z',
        participants: 2,
        finishers: 2,
        prizesIssued: 0,
        attendance: null,
        billable: false,
        amountCents: 0,
      });
      await delivery({
        ...base,
        cinema: cinema1,
        playedAt: '2026-11-13T19:00:00Z',
        participants: 6,
        finishers: 3,
        prizesIssued: 1,
        attendance: 30,
        billable: true,
        amountCents: 1000,
      });
      // Autre campagne : jamais comptée.
      await delivery({
        campaignId: other.id,
        gameId: gameA.id,
        cinema: cinema1,
        playedAt: '2026-11-12T19:00:00Z',
        participants: 99,
        finishers: 99,
        prizesIssued: 9,
        attendance: 100,
        billable: true,
        amountCents: 1000,
      });
      const { token } = await sponsorUser(sponsorA.id);

      const res = await authed(
        request(app).get(`/api/sponsor-portal/campaigns/${camp.id}`),
        token,
      ).expect(200);
      expect(res.body).toMatchObject({
        sessionsPlayed: 3,
        billableSessions: 2,
        participants: 18,
        finishers: 13,
        prizesIssued: 4,
        prizesRedeemed: 2,
        attendanceKnownSessions: 2,
        attendanceTotal: 80,
        amountCents: 2000,
        byDay: [
          { day: '2026-11-10', sessions: 1, participants: 10 },
          { day: '2026-11-11', sessions: 1, participants: 2 },
          { day: '2026-11-12', sessions: 0, participants: 0 },
          { day: '2026-11-13', sessions: 1, participants: 6 },
        ],
        byCinema: [
          { cinemaName: 'Cinéma Lumière', city: 'Lyon', sessions: 2, participants: 16 },
          { cinemaName: 'Le Grand Rex', city: 'Paris', sessions: 1, participants: 2 },
        ],
      });
      expect(res.body.completionRate).toBeCloseTo(13 / 18);
      // (10 + 6) / (50 + 30), seulement sur les séances aux entrées connues.
      expect(res.body.participationRate).toBeCloseTo(16 / 80);
      expect(JSON.stringify(res.body)).not.toMatch(/SecretPseudo|player-test\.local/);

      const period = await authed(
        request(app).get(`/api/sponsor-portal/campaigns/${camp.id}?from=2026-11-11&to=2026-11-12`),
        token,
      ).expect(200);
      expect(period.body).toMatchObject({
        period: { from: '2026-11-11', to: '2026-11-12' },
        sessionsPlayed: 1,
        participants: 2,
        attendanceKnownSessions: 0,
        participationRate: null,
        prizesRedeemed: 0,
        byDay: [
          { day: '2026-11-11', sessions: 1, participants: 2 },
          { day: '2026-11-12', sessions: 0, participants: 0 },
        ],
      });

      const list = await authed(request(app).get('/api/sponsor-portal/campaigns'), token).expect(
        200,
      );
      const item = list.body.items.find((c: { id: string }) => c.id === camp.id.toString());
      expect(item.totals).toEqual({
        sessionsPlayed: 3,
        participants: 18,
        prizesIssued: 4,
        amountCents: 2000,
      });

      await authed(
        request(app).get(`/api/sponsor-portal/campaigns/${camp.id}?from=2026-11-12&to=2026-11-11`),
        token,
      ).expect(400);
    });

    it('export CSV: one line per session, no pseudo and no email', async () => {
      const camp = await campaign(sponsorA.id, gameA.id);
      for (const playedAt of ['2026-11-10T19:00:00Z', '2026-11-11T19:00:00Z']) {
        await delivery({
          campaignId: camp.id,
          gameId: gameA.id,
          cinema: cinema1,
          playedAt,
          participants: 5,
          finishers: 4,
          prizesIssued: 1,
          attendance: 40,
          billable: true,
          amountCents: 1000,
          redeemedPrizes: 1,
        });
      }
      const { token } = await sponsorUser(sponsorA.id);
      const res = await authed(
        request(app).get(`/api/sponsor-portal/campaigns/${camp.id}/export.csv`),
        token,
      ).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toBe('date,cinema,ville,salle,participants,finishers,lots,facturable');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe('2026-11-10 20:00,Cinéma Lumière,Lyon,S1,5,4,1,oui');
      expect(res.text).not.toMatch(/SecretPseudo|@|player-test/);
    });
  });

  describe('invitation sponsor', () => {
    it('end to end: invite, accept, read the portal, magic link, revoke', async () => {
      const camp = await campaign(sponsorA.id, gameA.id);
      const email = `contact-${code().toLowerCase()}@sponsor-test.local`;

      await authed(request(app).post(`/api/sponsors/${sponsorA.slug}/invitations`), superToken)
        .send({ email })
        .expect(201);
      await authed(request(app).post(`/api/sponsors/${sponsorA.slug}/invitations`), superToken)
        .send({ email })
        .expect(409);

      const access = await authed(
        request(app).get(`/api/sponsors/${sponsorA.slug}/access`),
        superToken,
      ).expect(200);
      expect(access.body.invitations).toHaveLength(1);

      const invitation = await prisma.invitation.findFirstOrThrow({ where: { email } });
      expect(invitation).toMatchObject({ role: 'sponsor', sponsorId: sponsorA.id, cinemaId: null });

      const info = await request(app)
        .get(`/api/invitations/by-token/${invitation.token}`)
        .expect(200);
      expect(info.body).toMatchObject({
        role: 'sponsor',
        sponsorName: 'Popcorn & Co',
        cinemaName: null,
      });

      const accepted = await request(app)
        .post('/api/invitations/accept')
        .send({ token: invitation.token, displayName: 'Marie Sponsor' })
        .expect(200);
      expect(accepted.body.user).toMatchObject({
        role: 'sponsor',
        cinemaId: null,
        sponsorId: sponsorA.id.toString(),
      });
      const cookie = accepted.headers['set-cookie'] as unknown as string[];

      const me = await request(app).get('/api/users/me').set('Cookie', cookie).expect(200);
      expect(me.body).toMatchObject({
        role: 'sponsor',
        sponsorSlug: sponsorA.slug,
        cinemaId: null,
      });
      const list = await request(app)
        .get('/api/sponsor-portal/campaigns')
        .set('Cookie', cookie)
        .expect(200);
      expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([camp.id.toString()]);
      await request(app).get('/api/cinemas').set('Cookie', cookie).expect(403);

      // Le contact se reconnecte par lien magique (console).
      await request(app).post('/api/auth/magic-link/request').send({ email }).expect(200);
      const withLink = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(withLink.magicLinkToken).toBeTruthy();

      const after = await authed(
        request(app).get(`/api/sponsors/${sponsorA.slug}/access`),
        superToken,
      ).expect(200);
      expect(after.body.invitations).toHaveLength(0);
      expect(after.body.users).toHaveLength(1);
      expect(after.body.users[0]).toMatchObject({ email, displayName: 'Marie Sponsor' });

      // Révocation : effet immédiat (rôle relu en base).
      await authed(
        request(app).post(`/api/sponsors/${sponsorB.slug}/users/${withLink.id}/revoke`),
        superToken,
      ).expect(404);
      await authed(
        request(app).post(`/api/sponsors/${sponsorA.slug}/users/${withLink.id}/revoke`),
        superToken,
      ).expect(200);
      await request(app).get('/api/sponsor-portal/campaigns').set('Cookie', cookie).expect(403);
      const revoked = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(revoked).toMatchObject({ role: 'player', sponsorId: null });
    });

    it('pending sponsor invitation can be revoked; invitation routes stay super_admin', async () => {
      const email = `pending-${code().toLowerCase()}@sponsor-test.local`;
      const created = await authed(
        request(app).post(`/api/sponsors/${sponsorA.slug}/invitations`),
        superToken,
      )
        .send({ email })
        .expect(201);
      const { token } = await sponsorUser(sponsorA.id);
      await authed(request(app).post(`/api/sponsors/${sponsorA.slug}/invitations`), token)
        .send({ email: `x-${email}` })
        .expect(403);
      await authed(
        request(app).post(`/api/invitations/${created.body.id}/revoke`),
        superToken,
      ).expect(200);
      const inv = await prisma.invitation.findUniqueOrThrow({
        where: { id: BigInt(created.body.id) },
      });
      expect(inv.status).toBe('revoked');
      await authed(request(app).post(`/api/sponsors/${sponsorA.slug}/invitations`), superToken)
        .send({ email: 'not-an-email' })
        .expect(400);
    });
    it('a super_admin account cannot accept an invitation (its role would be lost)', async () => {
      const email = `admin-${code().toLowerCase()}@sponsor-test.local`;
      await prisma.user.create({ data: { email, displayName: 'Admin', role: 'super_admin' } });
      await authed(request(app).post(`/api/sponsors/${sponsorA.slug}/invitations`), superToken)
        .send({ email })
        .expect(201);
      const invitation = await prisma.invitation.findFirstOrThrow({ where: { email } });
      const res = await request(app)
        .post('/api/invitations/accept')
        .send({ token: invitation.token, displayName: 'Admin' })
        .expect(409);
      expect(res.body.error?.code ?? res.body.code).toBe('INVITATION_SUPER_ADMIN');
      const still = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(still).toMatchObject({ role: 'super_admin', sponsorId: null });
    });
  });

  describe('sponsor de séance (affichage public)', () => {
    async function sessionWithRounds(kinds: ('sponsored' | 'internal')[]) {
      const session = await prisma.session.create({
        data: {
          slugShort: code(),
          screenId: cinema1.screenId,
          state: 'lobby',
          joinToken: `jt-${code()}`,
        },
      });
      for (const [i, kind] of kinds.entries()) {
        const game = await sponsoredGame(kind === 'sponsored' ? sponsorB.id : sponsorA.id, kind);
        await prisma.sessionRound.create({
          data: { sessionId: session.id, position: i + 1, gameId: game.id },
        });
      }
      return session;
    }

    it('first sponsored round gives sessionSponsor (by-code, by-token, mobile snapshot)', async () => {
      await prisma.sponsor.update({
        where: { id: sponsorB.id },
        data: { logoUrl: '/uploads/b.png', brandColorPrimary: '#112233' },
      });
      const session = await sessionWithRounds(['internal', 'sponsored']);
      const expected = {
        name: 'Soda Max',
        logoUrl: '/uploads/b.png',
        brandColorPrimary: '#112233',
      };

      const byCode = await request(app)
        .get(`/api/sessions/by-code/${session.slugShort}`)
        .expect(200);
      expect(byCode.body.sessionSponsor).toEqual(expected);
      const byToken = await request(app)
        .get(`/api/sessions/by-token/${session.joinToken}`)
        .expect(200);
      expect(byToken.body.sessionSponsor).toEqual(expected);

      const player = await prisma.player.create({
        data: { sessionId: session.id, pseudo: 'Alice', resumeToken: `rt-${code()}` },
      });
      const snap = await buildMobilePlayerStateSnapshot(player.id, session.id);
      expect(snap.sessionSponsor).toEqual(expected);
    });

    it('an internal game with a sponsor is never shown', async () => {
      const session = await sessionWithRounds(['internal', 'internal']);
      expect(await resolveSessionSponsor(session.id)).toBeNull();
      const byCode = await request(app)
        .get(`/api/sessions/by-code/${session.slugShort}`)
        .expect(200);
      expect(byCode.body.sessionSponsor).toBeNull();
    });
  });
});
