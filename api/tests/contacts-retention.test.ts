import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONTACT_INACTIVITY_YEARS, PRIZE_EMAIL_RETENTION_DAYS } from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { purgeExpiredPlayerEmails } from '../src/shared/retention/player-email-purge.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

/**
 * Rétention : contacts inactifs depuis 3 ans exclus des exports et comptes (sans suppression) ;
 * emails de lot effacés 90 jours après la séance sans consentement actif.
 */

process.env.EMAIL_SEND_RATE_MS = '100';

const DAY_MS = 24 * 60 * 60 * 1000;

function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

function yearsAgo(years: number, extraDays = 0): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return new Date(d.getTime() - extraDays * DAY_MS);
}

describe('contacts retention', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let superToken: string;
  let screenId: bigint;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();
    superToken = (await createSuperAdminUser()).token;
    const infra = await minimalCinemaAndScreen();
    screenId = infra.screenId;
    await prisma.cinema.update({
      where: { slug: infra.cinemaSlug },
      data: { prizesConfig: { all: { type: 'discount_qr', label: 'Popcorn offert' } } },
    });
  });

  async function endedSession(endedAt = new Date()) {
    return prisma.session.create({
      data: { slugShort: uid(), screenId, state: 'ended', startedAt: endedAt, endedAt },
    });
  }

  async function rankedPlayer(sessionId: bigint, email: string | null = null) {
    return prisma.player.create({
      data: {
        sessionId,
        pseudo: `J-${uid()}`,
        resumeToken: `rt-ret-${uid()}`,
        rankFinal: 5,
        emailForPrize: email,
        emailConsentAt: email ? new Date() : null,
      },
    });
  }

  /** Contact avec un consentement plateforme, dernière activité à `lastActivityAt`. */
  async function platformContact(email: string, lastActivityAt: Date, revoked = false) {
    const session = await endedSession();
    return prisma.contact.create({
      data: {
        email,
        createdAt: lastActivityAt,
        lastActivityAt,
        consents: {
          create: {
            scope: 'platform',
            sessionId: session.id,
            grantedAt: lastActivityAt,
            revokedAt: revoked ? new Date() : null,
            wordingVersion: '2026-11',
          },
        },
      },
    });
  }

  async function exportedEmails(): Promise<string[]> {
    const res = await authed(
      request(app).get('/api/contacts/export.csv?scope=platform'),
      superToken,
    ).expect(200);
    return res.text
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => l.split(',')[0]!);
  }

  async function stats() {
    return (await authed(request(app).get('/api/contacts/stats'), superToken).expect(200)).body as {
      contacts: number;
      inactive: number;
      platform: number;
    };
  }

  function claim(player: { id: bigint; resumeToken: string }, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/players/${player.id}/email`)
      .set('X-Player-Token', player.resumeToken)
      .send({ consent: true, ...body });
  }

  it(`excludes contacts inactive for more than ${CONTACT_INACTIVITY_YEARS} years from exports and counts, without deleting them`, async () => {
    await platformContact('old@test.com', yearsAgo(CONTACT_INACTIVITY_YEARS, 1));
    await platformContact('recent@test.com', yearsAgo(CONTACT_INACTIVITY_YEARS, -1));

    expect(await exportedEmails()).toEqual(['recent@test.com']);
    const s = await stats();
    expect(s).toMatchObject({ contacts: 2, inactive: 1, platform: 1 });
    expect(await prisma.contact.count({ where: { email: 'old@test.com' } })).toBe(1);
  });

  it('a prize email submission without any box resets the inactivity counter', async () => {
    await platformContact('old@test.com', yearsAgo(CONTACT_INACTIVITY_YEARS, 10));
    const player = await rankedPlayer((await endedSession()).id);

    await claim(player, { email: 'Old@Test.com' }).expect(200);

    const contact = await prisma.contact.findUniqueOrThrow({ where: { email: 'old@test.com' } });
    expect(Date.now() - contact.lastActivityAt.getTime()).toBeLessThan(60_000);
    expect(await exportedEmails()).toEqual(['old@test.com']);
    expect((await stats()).inactive).toBe(0);
    // Pas de contact créé pour une adresse sans case cochée.
    const other = await rankedPlayer((await endedSession()).id);
    await claim(other, { email: 'nobody@test.com' }).expect(200);
    expect(await prisma.contact.count({ where: { email: 'nobody@test.com' } })).toBe(0);
  });

  it('a new opt-in reactivates a revoked consent and resets the counter', async () => {
    await platformContact('back@test.com', yearsAgo(CONTACT_INACTIVITY_YEARS, 10), true);
    expect(await exportedEmails()).toEqual([]);
    const player = await rankedPlayer((await endedSession()).id);

    await claim(player, { email: 'back@test.com', optInPlatform: true }).expect(200);

    const contact = await prisma.contact.findUniqueOrThrow({ where: { email: 'back@test.com' } });
    expect(Date.now() - contact.lastActivityAt.getTime()).toBeLessThan(60_000);
    expect(await exportedEmails()).toEqual(['back@test.com']);
  });

  it(`purges prize emails ${PRIZE_EMAIL_RETENTION_DAYS} days after the session unless the address has an active consent`, async () => {
    const old = await endedSession(
      new Date(Date.now() - (PRIZE_EMAIL_RETENTION_DAYS + 1) * DAY_MS),
    );
    const recent = await endedSession(new Date(Date.now() - 10 * DAY_MS));

    await platformContact('kept@test.com', new Date());
    await platformContact('revoked@test.com', new Date(), true);
    await platformContact('dormant@test.com', yearsAgo(CONTACT_INACTIVITY_YEARS, 1));

    const noConsent = await rankedPlayer(old.id, 'gone@test.com');
    const consenting = await rankedPlayer(old.id, 'Kept@test.com');
    const revoked = await rankedPlayer(old.id, 'revoked@test.com');
    const dormant = await rankedPlayer(old.id, 'dormant@test.com');
    const fresh = await rankedPlayer(recent.id, 'fresh@test.com');

    const purged = await purgeExpiredPlayerEmails();
    expect(purged).toBe(3);

    const email = async (id: bigint) =>
      (await prisma.player.findUniqueOrThrow({ where: { id } })).emailForPrize;
    expect(await email(noConsent.id)).toBeNull();
    expect(await email(revoked.id)).toBeNull();
    expect(await email(dormant.id)).toBeNull();
    expect(await email(consenting.id)).toBe('Kept@test.com');
    expect(await email(fresh.id)).toBe('fresh@test.com');
    // Les contacts eux-mêmes ne sont jamais supprimés.
    expect(await prisma.contact.count()).toBe(3);

    let event = null;
    for (let i = 0; i < 20 && !event; i++) {
      event = await prisma.eventLog.findFirst({
        where: { eventType: 'players.prize_emails_purged' },
        orderBy: { id: 'desc' },
      });
      if (!event) await new Promise((r) => setTimeout(r, 50));
    }
    expect(event?.payloadJson).toMatchObject({ count: 3 });

    expect(await purgeExpiredPlayerEmails()).toBe(0);
  });
});
