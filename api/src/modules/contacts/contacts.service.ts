import { Prisma, type ConsentScope } from '@prisma/client';
import {
  CONSENT_WORDING_VERSION,
  contactInactivityCutoff,
  type ConsentOptionsResponse,
  type ContactsExportQuery,
  type ContactsStatsResponse,
} from '@quiz-app/validation';
import type { AuthUser } from '../../shared/auth/middleware.js';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { csvCell } from '../sessions/session-report.service.js';

/**
 * Consentements email (C5). La plateforme collecte et conserve ; rien ne part vers un cinéma ou
 * un sponsor sans accord enregistré avec lui ET case cochée par le joueur. Les exports sont
 * réservés au super_admin ; aucune route d'un rôle cinéma ou sponsor ne renvoie d'email.
 *
 * Accords : cinéma = `cinemas.email_sharing_enabled` ; sponsor = au moins une campagne du
 * sponsor avec `emailSharingEnabled` (pour un consentement : la campagne active de la séance).
 */

interface SessionSharing {
  cinema: { id: bigint; name: string } | null;
  sponsor: { id: bigint; name: string } | null;
}

/**
 * Partenaires auxquels une séance permet de consentir : son cinéma s'il a donné son accord, et
 * le sponsor d'une campagne active avec accord couvrant une manche de la séance.
 */
async function sessionSharing(sessionId: bigint): Promise<SessionSharing> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      startedAt: true,
      createdAt: true,
      screen: {
        select: { cinema: { select: { id: true, name: true, emailSharingEnabled: true } } },
      },
      rounds: { select: { gameId: true, startedAt: true }, orderBy: { position: 'asc' } },
    },
  });
  if (!session) return { cinema: null, sponsor: null };

  const cinemaRow = session.screen.cinema;
  const cinema = cinemaRow.emailSharingEnabled ? { id: cinemaRow.id, name: cinemaRow.name } : null;

  let sponsor: SessionSharing['sponsor'] = null;
  for (const round of session.rounds) {
    const at = round.startedAt ?? session.startedAt ?? session.createdAt;
    const campaign = await prisma.campaign.findFirst({
      where: {
        gameId: round.gameId,
        status: 'active',
        emailSharingEnabled: true,
        startsAt: { lte: at },
        endsAt: { gte: at },
      },
      orderBy: { startsAt: 'desc' },
      select: { sponsor: { select: { id: true, name: true } } },
    });
    if (campaign) {
      sponsor = campaign.sponsor;
      break;
    }
  }
  return { cinema, sponsor };
}

async function consentOptions(sessionId: bigint): Promise<ConsentOptionsResponse> {
  const sharing = await sessionSharing(sessionId);
  return {
    cinema: sharing.cinema ? { name: sharing.cinema.name } : null,
    sponsor: sharing.sponsor ? { name: sharing.sponsor.name } : null,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Contact de l'adresse, créé au besoin (deux créations simultanées : on relit l'existant). */
async function findOrCreateContact(email: string) {
  try {
    return await prisma.contact.upsert({ where: { email }, create: { email }, update: {} });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.contact.findUniqueOrThrow({ where: { email } });
    }
    throw err;
  }
}

interface ConsentTarget {
  scope: ConsentScope;
  cinemaId: bigint | null;
  sponsorId: bigint | null;
}

/**
 * Enregistre les cases cochées du formulaire de lot. Une case n'est retenue que si l'accord
 * correspondant existe pour la séance (sinon ignorée). Pour chaque case : contact créé ou
 * réutilisé, consentement créé ou réactivé. Un nouvel accord explicite lève une désinscription
 * générale antérieure. Renvoie les périmètres enregistrés.
 */
async function recordPrizeFormConsents(input: {
  email: string;
  sessionId: bigint;
  optInPlatform: boolean;
  optInCinema: boolean;
  optInSponsor: boolean;
}): Promise<ConsentScope[]> {
  const targets: ConsentTarget[] = [];
  if (input.optInPlatform) targets.push({ scope: 'platform', cinemaId: null, sponsorId: null });
  if (input.optInCinema || input.optInSponsor) {
    const sharing = await sessionSharing(input.sessionId);
    if (input.optInCinema && sharing.cinema) {
      targets.push({ scope: 'cinema', cinemaId: sharing.cinema.id, sponsorId: null });
    }
    if (input.optInSponsor && sharing.sponsor) {
      targets.push({ scope: 'sponsor', cinemaId: null, sponsorId: sharing.sponsor.id });
    }
  }
  if (targets.length === 0) return [];

  const contact = await findOrCreateContact(normalizeEmail(input.email));
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Verrou du contact : l'unicité (contact, périmètre, cinéma, sponsor) n'est pas garantie par
    // MySQL quand cinema_id / sponsor_id sont NULL ; les écritures d'un contact sont donc en file.
    await tx.$queryRaw`SELECT id FROM contacts WHERE id = ${contact.id} FOR UPDATE`;
    for (const t of targets) {
      const existing = await tx.contactConsent.findFirst({
        where: {
          contactId: contact.id,
          scope: t.scope,
          cinemaId: t.cinemaId,
          sponsorId: t.sponsorId,
        },
      });
      if (!existing) {
        await tx.contactConsent.create({
          data: {
            contactId: contact.id,
            scope: t.scope,
            cinemaId: t.cinemaId,
            sponsorId: t.sponsorId,
            sessionId: input.sessionId,
            grantedAt: now,
            wordingVersion: CONSENT_WORDING_VERSION,
          },
        });
      } else if (existing.revokedAt !== null) {
        await tx.contactConsent.update({
          where: { id: existing.id },
          data: {
            revokedAt: null,
            grantedAt: now,
            sessionId: input.sessionId,
            wordingVersion: CONSENT_WORDING_VERSION,
          },
        });
      }
    }
    await tx.contact.updateMany({
      where: { id: contact.id, unsubscribedAllAt: { not: null } },
      data: { unsubscribedAllAt: null },
    });
    // Activité de l'adresse : relance le délai d'inactivité (CONTACT_INACTIVITY_YEARS).
    await tx.contact.update({ where: { id: contact.id }, data: { lastActivityAt: now } });
  });
  return targets.map((t) => t.scope);
}

/**
 * Activité de l'adresse sans nouveau consentement (ex. email saisi pour un lot, cases
 * facultatives décochées) : si un contact existe pour cette adresse, son délai d'inactivité
 * repart de zéro. Ne crée jamais de contact.
 */
async function recordActivity(email: string, at: Date = new Date()): Promise<void> {
  await prisma.contact.updateMany({
    where: { email: normalizeEmail(email), lastActivityAt: { lt: at } },
    data: { lastActivityAt: at },
  });
}

/** Désinscription générale : tous les consentements du contact sont révoqués. */
async function unsubscribeAll(email: string): Promise<void> {
  const contact = await prisma.contact.findUnique({ where: { email: normalizeEmail(email) } });
  if (!contact) return;
  const now = new Date();
  await prisma.$transaction([
    prisma.contactConsent.updateMany({
      where: { contactId: contact.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.contact.update({ where: { id: contact.id }, data: { unsubscribedAllAt: now } }),
  ]);
  logger.info({ contactId: contact.id.toString() }, 'Contact unsubscribed from all consents');
}

/** Contact retenu dans les listes : non désinscrit, actif depuis moins de 3 ans (à `now`). */
function activeContactWhere(now: Date = new Date()): Prisma.ContactWhereInput {
  return { unsubscribedAllAt: null, lastActivityAt: { gte: contactInactivityCutoff(now) } };
}

/**
 * Consentement actif d'un contact retenu (seuls ceux-là sortent dans un export ou un compte).
 * Calculé à chaque lecture : aucune tâche de suppression n'est nécessaire.
 */
function activeConsentWhere(now: Date = new Date()): Prisma.ContactConsentWhereInput {
  return { revokedAt: null, contact: activeContactWhere(now) };
}

function sharingNotAgreed(): AppError {
  return new AppError(
    "Aucun accord de partage des emails n'est enregistré pour ce périmètre.",
    409,
    'SHARING_NOT_AGREED',
  );
}

/** Une cellule qui commencerait par = + - @ serait lue comme une formule par un tableur. */
function safeCsvCell(value: string): string {
  return csvCell(/^[=+\-@]/.test(value) ? `'${value}` : value);
}

async function exportCsv(
  query: ContactsExportQuery,
  user: AuthUser,
): Promise<{ filename: string; csv: string }> {
  const where: Prisma.ContactConsentWhereInput = { ...activeConsentWhere(), scope: query.scope };
  let label = 'plateforme';
  let cinemaId: bigint | null = null;
  if (query.scope === 'cinema') {
    const cinema = await prisma.cinema.findFirst({
      where: { slug: query.cinemaSlug!, deletedAt: null },
      select: { id: true, slug: true, emailSharingEnabled: true },
    });
    if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
    if (!cinema.emailSharingEnabled) throw sharingNotAgreed();
    where.cinemaId = cinema.id;
    cinemaId = cinema.id;
    label = `cinema-${cinema.slug}`;
  } else if (query.scope === 'sponsor') {
    const sponsor = await prisma.sponsor.findUnique({
      where: { slug: query.sponsorSlug! },
      select: { id: true, slug: true },
    });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    const agreed = await prisma.campaign.count({
      where: { sponsorId: sponsor.id, emailSharingEnabled: true },
    });
    if (agreed === 0) throw sharingNotAgreed();
    where.sponsorId = sponsor.id;
    label = `sponsor-${sponsor.slug}`;
  }

  const rows = await prisma.contactConsent.findMany({
    where,
    select: { grantedAt: true, wordingVersion: true, contact: { select: { email: true } } },
    orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
  });
  const lines = ['email,date_consentement,version_libelle'];
  for (const r of rows) {
    lines.push(
      [
        safeCsvCell(r.contact.email),
        csvCell(r.grantedAt.toISOString()),
        safeCsvCell(r.wordingVersion),
      ].join(','),
    );
  }

  logEvent({
    level: 'info',
    eventType: 'contacts.exported',
    ...(cinemaId !== null ? { cinemaId } : {}),
    payload: {
      scope: query.scope,
      cinemaSlug: query.scope === 'cinema' ? query.cinemaSlug : null,
      sponsorSlug: query.scope === 'sponsor' ? query.sponsorSlug : null,
      rows: rows.length,
      userId: user.id.toString(),
    },
  });

  const day = new Date().toISOString().slice(0, 10);
  return { filename: `contacts-${label}-${day}.csv`, csv: `${lines.join('\n')}\n` };
}

async function stats(): Promise<ContactsStatsResponse> {
  const now = new Date();
  const active = activeConsentWhere(now);
  const [
    contacts,
    unsubscribed,
    inactive,
    platform,
    byCinema,
    bySponsor,
    cinemas,
    sponsors,
    agreements,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { unsubscribedAllAt: { not: null } } }),
    prisma.contact.count({ where: { lastActivityAt: { lt: contactInactivityCutoff(now) } } }),
    prisma.contactConsent.count({ where: { ...active, scope: 'platform' } }),
    prisma.contactConsent.groupBy({
      by: ['cinemaId'],
      where: { ...active, scope: 'cinema' },
      _count: { _all: true },
    }),
    prisma.contactConsent.groupBy({
      by: ['sponsorId'],
      where: { ...active, scope: 'sponsor' },
      _count: { _all: true },
    }),
    prisma.cinema.findMany({
      where: { OR: [{ deletedAt: null }, { consents: { some: {} } }] },
      select: { id: true, slug: true, name: true, emailSharingEnabled: true },
      orderBy: { name: 'asc' },
    }),
    prisma.sponsor.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.campaign.groupBy({
      by: ['sponsorId'],
      where: { emailSharingEnabled: true },
      _count: { _all: true },
    }),
  ]);
  const cinemaCounts = new Map(byCinema.map((r) => [r.cinemaId?.toString(), r._count._all]));
  const sponsorCounts = new Map(bySponsor.map((r) => [r.sponsorId?.toString(), r._count._all]));
  const agreedSponsors = new Set(agreements.map((r) => r.sponsorId.toString()));
  return {
    contacts,
    unsubscribed,
    inactive,
    platform,
    cinemas: cinemas.map((c) => ({
      slug: c.slug,
      name: c.name,
      emailSharingEnabled: c.emailSharingEnabled,
      count: cinemaCounts.get(c.id.toString()) ?? 0,
    })),
    sponsors: sponsors.map((s) => ({
      slug: s.slug,
      name: s.name,
      emailSharingEnabled: agreedSponsors.has(s.id.toString()),
      count: sponsorCounts.get(s.id.toString()) ?? 0,
    })),
  };
}

/** Accord de partage avec un cinéma (super_admin). */
async function setCinemaSharing(slug: string, enabled: boolean, user: AuthUser) {
  const cinema = await prisma.cinema.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true },
  });
  if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  await prisma.cinema.update({ where: { id: cinema.id }, data: { emailSharingEnabled: enabled } });
  logEvent({
    level: 'info',
    eventType: 'cinema.email_sharing_changed',
    cinemaId: cinema.id,
    payload: { enabled, userId: user.id.toString() },
  });
  return { emailSharingEnabled: enabled };
}

export const contactsService = {
  consentOptions,
  recordPrizeFormConsents,
  recordActivity,
  activeContactWhere,
  unsubscribeAll,
  exportCsv,
  stats,
  setCinemaSharing,
};
