import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { formatEuroCents } from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { decideDelivery, deliveriesService } from '../src/modules/campaigns/deliveries.service.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateSponsorsAndQuizzes,
} from './helpers/integration.js';

/** C3 : campagnes, journal des diffusions, relevés, entrées de séance, revenu au catalogue. */

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

function randomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

describe('campaigns, deliveries and statements (C3)', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let superToken: string;
  let a: CinemaFixture;
  let b: CinemaFixture;
  let sponsor: { id: bigint; slug: string };
  let game: { id: bigint; slug: string };

  beforeEach(async () => {
    await truncateSponsorsAndQuizzes();
    app = getIntegrationApp();
    superToken = (await createSuperAdminUser()).token;
    a = await cinemaFixture();
    b = await cinemaFixture();
    sponsor = await prisma.sponsor.create({
      data: { slug: `sp-${randomCode().toLowerCase()}`, name: 'Popcorn & Co' },
      select: { id: true, slug: true },
    });
    game = await prisma.game.create({
      data: {
        slug: `jeu-${randomCode().toLowerCase()}`,
        title: 'Quiz du sponsor',
        engineKey: 'poll',
        kind: 'sponsored',
        sponsorId: sponsor.id,
        status: 'published',
        catalogEnabled: true,
      },
      select: { id: true, slug: true },
    });
  });

  afterAll(async () => {
    await truncateSponsorsAndQuizzes();
  });

  async function createCampaign(
    overrides: Record<string, unknown> = {},
    activate = true,
  ): Promise<{ id: string }> {
    const res = await authed(request(app).post('/api/campaigns'), superToken)
      .send({
        sponsorSlug: sponsor.slug,
        gameSlug: game.slug,
        name: 'Campagne automne',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2027-12-31T23:59:59.000Z',
        pricing: 'per_session',
        unitPriceCents: 1000,
        cinemaSharePercent: 40,
        ...overrides,
      })
      .expect(201);
    const created = res.body as { id: string; status: string };
    expect(created.status).toBe('draft');
    if (activate) {
      await authed(request(app).post(`/api/campaigns/${created.id}/activate`), superToken).expect(
        200,
      );
    }
    return created;
  }

  /** Séance terminée avec une manche `state` du jeu, `participants` joueurs dont `left` partis. */
  async function playedRound(input: {
    screenId: bigint;
    participants: number;
    left?: number;
    proof?: boolean;
    startedAt?: Date;
    state?: 'ended' | 'skipped';
    sessionState?: 'ended' | 'running';
    endedAt?: Date;
  }) {
    const startedAt = input.startedAt ?? new Date();
    const session = await prisma.session.create({
      data: {
        slugShort: randomCode(),
        screenId: input.screenId,
        state: input.sessionState ?? 'ended',
        startedAt,
        endedAt: input.sessionState === 'running' ? null : (input.endedAt ?? startedAt),
      },
    });
    const ids: string[] = [];
    for (let i = 0; i < input.participants; i++) {
      const p = await prisma.player.create({
        data: {
          sessionId: session.id,
          pseudo: `P${i}`,
          resumeToken: `rt-${randomCode()}-${i}-${Date.now()}`,
          status: i < (input.left ?? 0) ? 'disconnected' : 'active',
        },
      });
      ids.push(p.id.toString());
    }
    // Un joueur présent qui n'a rien fait : ni participant ni « finisher ».
    await prisma.player.create({
      data: { sessionId: session.id, pseudo: 'Idle', resumeToken: `rt-idle-${randomCode()}` },
    });
    const round = await prisma.sessionRound.create({
      data: {
        sessionId: session.id,
        position: 1,
        gameId: game.id,
        state: input.state ?? 'ended',
        startedAt,
        endedAt: startedAt,
        stateJson: { platform: { participants: ids }, engine: null },
        proofDisplayedAt: input.proof === false ? null : startedAt,
      },
    });
    return { session, round };
  }

  describe('delivery creation', () => {
    it('per_session: billable delivery with the unit price and the rounded cinema share', async () => {
      await createCampaign({ unitPriceCents: 1999, cinemaSharePercent: 33 });
      const { round, session } = await playedRound({
        screenId: a.screenId,
        participants: 4,
        left: 1,
      });
      const d = await deliveriesService.recordRoundDelivery(round.id);
      expect(d).toMatchObject({
        sessionId: session.id,
        screenId: a.screenId,
        cinemaId: a.id,
        participants: 4,
        finishers: 3,
        billable: true,
        nonBillableReason: null,
        amountCents: 1999,
        // 1999 × 33 / 100 = 659,67 → 660
        cinemaShareCents: 660,
      });
      expect(d!.proofDisplayedAt).not.toBeNull();
    });

    it('per_participant: unit price × participants', async () => {
      await createCampaign({
        pricing: 'per_participant',
        unitPriceCents: 25,
        cinemaSharePercent: 50,
      });
      const { round } = await playedRound({ screenId: a.screenId, participants: 7 });
      const d = await deliveriesService.recordRoundDelivery(round.id);
      // 25 × 7 = 175 ; 175 × 50 / 100 = 87,5 → 88
      expect(d).toMatchObject({ billable: true, amountCents: 175, cinemaShareCents: 88 });
    });

    it.each(['per_session', 'per_participant'] as const)(
      '%s: no_proof, then too_few_players, with amount 0',
      async (pricing) => {
        await createCampaign({ pricing });
        const noProof = await playedRound({ screenId: a.screenId, participants: 1, proof: false });
        expect(await deliveriesService.recordRoundDelivery(noProof.round.id)).toMatchObject({
          billable: false,
          nonBillableReason: 'no_proof', // prioritaire sur too_few_players
          amountCents: 0,
          cinemaShareCents: 0,
        });
        const few = await playedRound({ screenId: a.screenId, participants: 2 });
        expect(await deliveriesService.recordRoundDelivery(few.round.id)).toMatchObject({
          billable: false,
          nonBillableReason: 'too_few_players',
          amountCents: 0,
        });
      },
    );

    it.each(['per_session', 'per_participant'] as const)(
      '%s: daily cap per screen (Paris day), then campaign cap',
      async (pricing) => {
        await createCampaign({ pricing, maxSessionsPerScreenPerDay: 2, maxSessions: 3 });
        const day = new Date('2026-11-10T15:00:00.000Z');
        const results = [];
        for (let i = 0; i < 3; i++) {
          const { round } = await playedRound({
            screenId: a.screenId,
            participants: 3,
            startedAt: new Date(day.getTime() + i * 60_000),
          });
          results.push(await deliveriesService.recordRoundDelivery(round.id));
        }
        expect(results.map((d) => d!.nonBillableReason)).toEqual([null, null, 'daily_cap']);
        expect(results[2]).toMatchObject({ billable: false, amountCents: 0 });

        // Autre salle, même jour : 3e diffusion facturable de la campagne.
        const other = await prisma.screen.create({ data: { cinemaId: a.id, name: 'S2' } });
        const third = await playedRound({ screenId: other.id, participants: 3, startedAt: day });
        const d3 = await deliveriesService.recordRoundDelivery(third.round.id);
        expect(d3).toMatchObject({ billable: true });
        expect(d3!.amountCents).toBe(pricing === 'per_session' ? 1000 : 3000);

        // Lendemain (Paris), première salle : plafond du jour libre, mais plafond total atteint.
        const nextDay = await playedRound({
          screenId: a.screenId,
          participants: 3,
          startedAt: new Date('2026-11-11T08:00:00.000Z'),
        });
        expect(await deliveriesService.recordRoundDelivery(nextDay.round.id)).toMatchObject({
          billable: false,
          nonBillableReason: 'campaign_cap',
        });
      },
    );

    it('no delivery for a skipped round, a game without active campaign, or outside the period', async () => {
      const skipped = await playedRound({
        screenId: a.screenId,
        participants: 5,
        state: 'skipped',
      });
      await createCampaign();
      expect(await deliveriesService.recordRoundDelivery(skipped.round.id)).toBeNull();

      const outside = await playedRound({
        screenId: a.screenId,
        participants: 5,
        startedAt: new Date('2025-06-01T12:00:00.000Z'),
      });
      expect(await deliveriesService.recordRoundDelivery(outside.round.id)).toBeNull();
      expect(await prisma.delivery.count()).toBe(0);
    });

    it('a paused campaign records nothing', async () => {
      const c = await createCampaign();
      await authed(request(app).post(`/api/campaigns/${c.id}/pause`), superToken).expect(200);
      const { round } = await playedRound({ screenId: a.screenId, participants: 5 });
      expect(await deliveriesService.recordRoundDelivery(round.id)).toBeNull();
    });

    it('one delivery per round, even when recorded twice at the same time', async () => {
      await createCampaign();
      const { round } = await playedRound({ screenId: a.screenId, participants: 3 });
      const [d1, d2] = await Promise.all([
        deliveriesService.recordRoundDelivery(round.id),
        deliveriesService.recordRoundDelivery(round.id),
      ]);
      expect(d1!.id).toBe(d2!.id);
      expect(await deliveriesService.recordRoundDelivery(round.id)).toMatchObject({ id: d1!.id });
      expect(await prisma.delivery.count({ where: { roundId: round.id } })).toBe(1);
    });

    it('prizes issued in the session are counted on its deliveries', async () => {
      await createCampaign();
      const { round, session } = await playedRound({ screenId: a.screenId, participants: 3 });
      await deliveriesService.recordRoundDelivery(round.id);
      await deliveriesService.recordPrizeIssued(session.id);
      await deliveriesService.recordPrizeIssued(session.id);
      const d = await prisma.delivery.findUniqueOrThrow({ where: { roundId: round.id } });
      expect(d.prizesIssued).toBe(2);
    });

    it('decideDelivery rounds the cinema share to the nearest cent', () => {
      const base = {
        hasProof: true,
        participants: 3,
        billableTodayOnScreen: 0,
        billableForCampaign: 0,
      };
      const campaign = {
        pricing: 'per_participant' as const,
        unitPriceCents: 333,
        cinemaSharePercent: 15,
        maxSessions: null,
        maxSessionsPerScreenPerDay: null,
      };
      // 999 × 15 / 100 = 149,85 → 150
      expect(decideDelivery({ ...base, campaign })).toEqual({
        billable: true,
        nonBillableReason: null,
        amountCents: 999,
        cinemaShareCents: 150,
      });
    });
  });

  describe('campaign API', () => {
    it('CRUD, transitions and totals', async () => {
      const c = await createCampaign({}, false);
      await authed(request(app).patch(`/api/campaigns/${c.id}`), superToken)
        .send({ name: 'Campagne hiver', maxSessions: 10 })
        .expect(200);
      await authed(request(app).post(`/api/campaigns/${c.id}/pause`), superToken).expect(409);
      await authed(request(app).post(`/api/campaigns/${c.id}/activate`), superToken).expect(200);
      const { round } = await playedRound({ screenId: a.screenId, participants: 3 });
      await deliveriesService.recordRoundDelivery(round.id);

      const list = await authed(
        request(app).get(`/api/campaigns?sponsorSlug=${sponsor.slug}`),
        superToken,
      ).expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({
        name: 'Campagne hiver',
        status: 'active',
        maxSessions: 10,
        maxSessionsPerScreenPerDay: 3,
        game: { slug: game.slug },
        totals: { deliveries: 1, billableDeliveries: 1, amountCents: 1000, cinemaShareCents: 400 },
      });

      const deliveries = await authed(
        request(app).get(`/api/campaigns/${c.id}/deliveries`),
        superToken,
      ).expect(200);
      expect(deliveries.body.items[0]).toMatchObject({
        cinema: { slug: a.slug },
        participants: 3,
        billable: true,
      });

      await authed(request(app).delete(`/api/campaigns/${c.id}`), superToken).expect(409);
      await authed(request(app).post(`/api/campaigns/${c.id}/end`), superToken).expect(200);
      await authed(request(app).patch(`/api/campaigns/${c.id}`), superToken)
        .send({ name: 'Trop tard' })
        .expect(409);
      await authed(request(app).post(`/api/campaigns/${c.id}/activate`), superToken).expect(409);

      const draft = await createCampaign({}, false);
      await authed(request(app).delete(`/api/campaigns/${draft.id}`), superToken).expect(204);
    });

    it('one active campaign per game over a period (409), any other game is free', async () => {
      await createCampaign();
      const second = await createCampaign({ name: 'Doublon' }, false);
      const res = await authed(
        request(app).post(`/api/campaigns/${second.id}/activate`),
        superToken,
      ).expect(409);
      expect(res.body.error.code).toBe('CAMPAIGN_OVERLAP');

      const later = await createCampaign(
        { startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-06-30T00:00:00.000Z' },
        true,
      );
      // Allonger la campagne suivante sur la première : refusé.
      await authed(request(app).patch(`/api/campaigns/${later.id}`), superToken)
        .send({ startsAt: '2027-06-01T00:00:00.000Z' })
        .expect(409);
    });

    it('validates input and the game sponsor', async () => {
      await authed(request(app).post('/api/campaigns'), superToken)
        .send({
          sponsorSlug: sponsor.slug,
          gameSlug: game.slug,
          name: 'Dates inversées',
          startsAt: '2027-01-01T00:00:00.000Z',
          endsAt: '2026-01-01T00:00:00.000Z',
          pricing: 'per_session',
          unitPriceCents: 100,
          cinemaSharePercent: 40,
        })
        .expect(400);
      await authed(request(app).post('/api/campaigns'), superToken)
        .send({
          sponsorSlug: sponsor.slug,
          gameSlug: game.slug,
          name: 'Part invalide',
          startsAt: '2026-01-01T00:00:00.000Z',
          endsAt: '2027-01-01T00:00:00.000Z',
          pricing: 'per_session',
          unitPriceCents: 100,
          cinemaSharePercent: 120,
        })
        .expect(400);
      const other = await prisma.sponsor.create({ data: { slug: 'autre-sponsor', name: 'Autre' } });
      const res = await authed(request(app).post('/api/campaigns'), superToken)
        .send({
          sponsorSlug: other.slug,
          gameSlug: game.slug,
          name: 'Mauvais sponsor',
          startsAt: '2026-01-01T00:00:00.000Z',
          endsAt: '2027-01-01T00:00:00.000Z',
          pricing: 'per_session',
          unitPriceCents: 100,
          cinemaSharePercent: 40,
        })
        .expect(400);
      expect(res.body.error.code).toBe('CAMPAIGN_GAME_SPONSOR_MISMATCH');
    });

    it('is reserved to super_admin', async () => {
      const adminA = (await createCinemaUser('cinema_admin', a.id)).token;
      await authed(request(app).get('/api/campaigns'), adminA).expect(403);
      await request(app).get('/api/campaigns').expect(401);
    });
  });

  describe('monthly statement', () => {
    /** Diffusion écrite directement (jeu de données fixe). */
    async function delivery(
      campaignId: bigint,
      cinema: CinemaFixture,
      playedAt: string,
      values: { participants: number; billable: boolean; amountCents: number; share: number },
    ) {
      const { round, session } = await playedRound({
        screenId: cinema.screenId,
        participants: 0,
        startedAt: new Date(playedAt),
      });
      await prisma.delivery.create({
        data: {
          campaignId,
          sessionId: session.id,
          roundId: round.id,
          screenId: cinema.screenId,
          cinemaId: cinema.id,
          playedAt: new Date(playedAt),
          participants: values.participants,
          finishers: values.participants,
          billable: values.billable,
          nonBillableReason: values.billable ? null : 'too_few_players',
          amountCents: values.amountCents,
          cinemaShareCents: values.share,
        },
      });
      return session;
    }

    async function dataset() {
      const c = await createCampaign({ name: 'Campagne, "spéciale"' });
      const campaignId = BigInt(c.id);
      // 1er novembre 00:30 à Paris (UTC+1) : dans le mois de novembre.
      const s1 = await delivery(campaignId, a, '2026-10-31T23:30:00.000Z', {
        participants: 12,
        billable: true,
        amountCents: 1000,
        share: 400,
      });
      await prisma.session.update({ where: { id: s1.id }, data: { attendance: 80 } });
      await prisma.delivery.updateMany({ where: { sessionId: s1.id }, data: { attendance: 80 } });
      await delivery(campaignId, a, '2026-11-15T19:00:00.000Z', {
        participants: 2,
        billable: false,
        amountCents: 0,
        share: 0,
      });
      await delivery(campaignId, a, '2026-11-30T20:00:00.000Z', {
        participants: 5,
        billable: true,
        amountCents: 1001,
        share: 400,
      });
      // 1er décembre 00:30 à Paris : hors novembre.
      await delivery(campaignId, a, '2026-11-30T23:30:00.000Z', {
        participants: 9,
        billable: true,
        amountCents: 1000,
        share: 400,
      });
      // Autre cinéma, même mois : jamais dans le relevé de A.
      await delivery(campaignId, b, '2026-11-10T19:00:00.000Z', {
        participants: 30,
        billable: true,
        amountCents: 1000,
        share: 400,
      });
      return s1;
    }

    it('lists the deliveries of the Paris month with the exact totals', async () => {
      const s1 = await dataset();
      const res = await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement?month=2026-11`),
        superToken,
      ).expect(200);
      expect(res.body.month).toBe('2026-11');
      expect(res.body.lines).toHaveLength(3);
      expect(res.body.lines[0]).toMatchObject({
        sessionId: s1.id.toString(),
        sessionCode: s1.slugShort,
        playedAt: '2026-10-31T23:30:00.000Z',
        screenName: 'S1',
        gameTitle: 'Quiz du sponsor',
        sponsorName: 'Popcorn & Co',
        pricing: 'per_session',
        attendance: 80,
        billable: true,
        cinemaShareCents: 400,
      });
      expect(res.body.lines[1]).toMatchObject({
        billable: false,
        nonBillableReason: 'too_few_players',
      });
      expect(res.body.totals).toEqual({
        deliveries: 3,
        billableDeliveries: 2,
        participants: 17,
        amountCents: 2001,
        cinemaShareCents: 800,
      });
      expect(formatEuroCents(res.body.totals.cinemaShareCents)).toBe('8,00\u00a0€');

      const dec = await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement?month=2026-12`),
        superToken,
      ).expect(200);
      expect(dec.body.totals.deliveries).toBe(1);

      await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement?month=2026-13`),
        superToken,
      ).expect(400);
    });

    it('CSV: one line per delivery, escaped cells, total of the cinema share', async () => {
      await dataset();
      const res = await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement.csv?month=2026-11`),
        superToken,
      ).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lines = (res.text as string).trimEnd().split('\n');
      expect(lines[0]).toBe(
        'date,salle,seance,jeu,sponsor,campagne,tarif,participants,finishers,entrees,facturable,motif_non_facturable,montant_cents,part_cinema_cents',
      );
      expect(lines).toHaveLength(5);
      expect(lines[1]).toContain('"Campagne, ""spéciale"""');
      expect(lines[1].endsWith(',12,12,80,oui,,1000,400')).toBe(true);
      expect(lines[4]).toBe('total,,,,,,,,,,,,2001,800');
    });

    it('cinema isolation: own statement only, cinema_admin role required', async () => {
      await dataset();
      const adminA = (await createCinemaUser('cinema_admin', a.id)).token;
      const adminB = (await createCinemaUser('cinema_admin', b.id)).token;
      const projA = (await createCinemaUser('projectionist', a.id)).token;
      const own = await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement?month=2026-11`),
        adminA,
      ).expect(200);
      expect(own.body.totals.cinemaShareCents).toBe(800);
      await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement?month=2026-11`),
        adminB,
      ).expect(403);
      await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement.csv?month=2026-11`),
        adminB,
      ).expect(403);
      await authed(
        request(app).get(`/api/cinemas/${a.slug}/statement?month=2026-11`),
        projA,
      ).expect(403);
      const ownB = await authed(
        request(app).get(`/api/cinemas/${b.slug}/statement?month=2026-11`),
        adminB,
      ).expect(200);
      expect(ownB.body.lines).toHaveLength(1);
      expect(ownB.body.totals.participants).toBe(30);
    });
  });

  describe('session attendance', () => {
    it('set by the cinema within 7 days, copied to the deliveries', async () => {
      await createCampaign();
      const { round, session } = await playedRound({ screenId: a.screenId, participants: 3 });
      await deliveriesService.recordRoundDelivery(round.id);
      const projA = (await createCinemaUser('projectionist', a.id)).token;
      const adminB = (await createCinemaUser('cinema_admin', b.id)).token;

      const res = await authed(request(app).patch(`/api/sessions/${session.id}/attendance`), projA)
        .send({ attendance: 120 })
        .expect(200);
      expect(res.body).toEqual({ sessionId: session.id.toString(), attendance: 120 });
      expect(
        (await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).attendance,
      ).toBe(120);
      expect(
        (await prisma.delivery.findUniqueOrThrow({ where: { roundId: round.id } })).attendance,
      ).toBe(120);

      const detail = await authed(request(app).get(`/api/sessions/${session.id}`), projA).expect(
        200,
      );
      expect(detail.body.attendance).toBe(120);

      await authed(request(app).patch(`/api/sessions/${session.id}/attendance`), adminB)
        .send({ attendance: 10 })
        .expect(403);
      await authed(request(app).patch(`/api/sessions/${session.id}/attendance`), projA)
        .send({ attendance: 2001 })
        .expect(400);
    });

    it('refused before the end of the session and after 7 days', async () => {
      const running = await playedRound({
        screenId: a.screenId,
        participants: 0,
        sessionState: 'running',
      });
      const old = await playedRound({
        screenId: a.screenId,
        participants: 0,
        endedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      });
      const adminA = (await createCinemaUser('cinema_admin', a.id)).token;
      const r1 = await authed(
        request(app).patch(`/api/sessions/${running.session.id}/attendance`),
        adminA,
      )
        .send({ attendance: 50 })
        .expect(409);
      expect(r1.body.error.code).toBe('SESSION_NOT_ENDED');
      const r2 = await authed(
        request(app).patch(`/api/sessions/${old.session.id}/attendance`),
        adminA,
      )
        .send({ attendance: 50 })
        .expect(409);
      expect(r2.body.error.code).toBe('ATTENDANCE_WINDOW_CLOSED');
    });
  });

  describe('catalogue revenue', () => {
    it('shows the cinema share of an active campaign covering today', async () => {
      const projA = (await createCinemaUser('projectionist', a.id)).token;
      const before = await authed(
        request(app).get(`/api/catalog?cinemaSlug=${a.slug}`),
        projA,
      ).expect(200);
      expect(before.body.items[0].revenue).toBeNull();

      const c = await createCampaign({
        pricing: 'per_participant',
        unitPriceCents: 25,
        cinemaSharePercent: 50,
      });
      const list = await authed(
        request(app).get(`/api/catalog?cinemaSlug=${a.slug}`),
        projA,
      ).expect(200);
      // 25 × 50 / 100 = 12,5 → 13 centimes par participant.
      expect(list.body.items[0].revenue).toEqual({
        pricing: 'per_participant',
        cinemaAmountCents: 13,
      });
      const detail = await authed(
        request(app).get(`/api/catalog/${game.slug}?cinemaSlug=${a.slug}`),
        projA,
      ).expect(200);
      expect(detail.body.revenue).toEqual({ pricing: 'per_participant', cinemaAmountCents: 13 });

      await authed(request(app).post(`/api/campaigns/${c.id}/pause`), superToken).expect(200);
      const paused = await authed(
        request(app).get(`/api/catalog?cinemaSlug=${a.slug}`),
        projA,
      ).expect(200);
      expect(paused.body.items[0].revenue).toBeNull();
    });
  });
});
