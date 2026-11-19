import type { Prisma } from '@prisma/client';
import type {
  SponsorCampaignStats,
  SponsorPortalCampaign,
  SponsorPortalCampaignList,
  SponsorPortalCampaignTotals,
  SponsorPortalListQuery,
  SponsorPortalPeriodQuery,
} from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { assertCanAccessSponsor, type SponsorScopeUser } from '../../shared/auth/tenant-scope.js';
import { nextCalendarDay, parisDayBounds, parisDayOf } from '../../shared/time/paris-calendar.js';
import { csvCell } from '../sessions/session-report.service.js';
import { countRedeemedOrNull } from '../prizes/prize-redeem-mode.js';

/**
 * Portail sponsor (C4) : lecture seule, chiffres agrégés tirés du journal des diffusions (C3,
 * une diffusion = une manche sponsorisée terminée = une séance diffusée). Jamais de pseudo ni
 * d'email : aucune requête de ce module ne lit les joueurs.
 *
 * Accès : rôle sponsor (son sponsor seulement) et super_admin. Les campagnes en brouillon ne
 * sont pas montrées.
 */

/** Plus long intervalle complété jour par jour dans la courbe (au-delà : jours non nuls). */
const MAX_FILLED_DAYS = 400;

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  status: true,
  startsAt: true,
  endsAt: true,
  sponsorId: true,
  sponsor: { select: { slug: true, name: true } },
  game: { select: { title: true } },
} satisfies Prisma.CampaignSelect;

type CampaignRow = Prisma.CampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

function notFound(): AppError {
  return new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
}

function shapeCampaign(c: CampaignRow): Omit<SponsorPortalCampaign, 'totals'> {
  return {
    id: c.id.toString(),
    name: c.name,
    status: c.status,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    sponsor: { slug: c.sponsor.slug, name: c.sponsor.name },
    game: { title: c.game.title },
  };
}

/** Sponsor lu par la requête : le sien pour un rôle sponsor, au choix pour le super_admin. */
async function resolveSponsorFilter(
  user: SponsorScopeUser,
  sponsorSlug: string | undefined,
): Promise<bigint | null> {
  if (sponsorSlug !== undefined) {
    const sponsor = await prisma.sponsor.findUnique({
      where: { slug: sponsorSlug },
      select: { id: true },
    });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    await assertCanAccessSponsor(user, sponsor.id);
    return sponsor.id;
  }
  if (user.role === 'super_admin') return null;
  if (user.role !== 'sponsor' || user.sponsorId === null) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
  return user.sponsorId;
}

async function listCampaigns(
  user: SponsorScopeUser,
  query: SponsorPortalListQuery,
): Promise<SponsorPortalCampaignList> {
  const sponsorId = await resolveSponsorFilter(user, query.sponsorSlug);
  const rows = await prisma.campaign.findMany({
    where: { status: { not: 'draft' }, ...(sponsorId !== null ? { sponsorId } : {}) },
    select: CAMPAIGN_SELECT,
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
  });
  const ids = rows.map((r) => r.id);
  const sums =
    ids.length === 0
      ? []
      : await prisma.delivery.groupBy({
          by: ['campaignId'],
          where: { campaignId: { in: ids } },
          _count: { _all: true },
          _sum: { participants: true, prizesIssued: true, amountCents: true },
        });
  const totals = new Map<string, SponsorPortalCampaignTotals>();
  for (const s of sums) {
    totals.set(s.campaignId.toString(), {
      sessionsPlayed: s._count._all,
      participants: s._sum.participants ?? 0,
      prizesIssued: s._sum.prizesIssued ?? 0,
      amountCents: s._sum.amountCents ?? 0,
    });
  }
  return {
    items: rows.map((r) => ({
      ...shapeCampaign(r),
      totals: totals.get(r.id.toString()) ?? {
        sessionsPlayed: 0,
        participants: 0,
        prizesIssued: 0,
        amountCents: 0,
      },
    })),
  };
}

/** Campagne lisible par l'utilisateur (404 si absente ou brouillon, 403 si autre sponsor). */
async function loadCampaignFor(user: SponsorScopeUser, id: bigint): Promise<CampaignRow> {
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT });
  if (!campaign || campaign.status === 'draft') throw notFound();
  await assertCanAccessSponsor(user, campaign.sponsorId);
  return campaign;
}

function periodWhere(period: SponsorPortalPeriodQuery): Prisma.DateTimeFilter | undefined {
  if (period.from === undefined && period.to === undefined) return undefined;
  return {
    ...(period.from !== undefined ? { gte: parisDayBounds(period.from).start } : {}),
    ...(period.to !== undefined ? { lt: parisDayBounds(period.to).end } : {}),
  };
}

const DELIVERY_SELECT = {
  sessionId: true,
  playedAt: true,
  participants: true,
  finishers: true,
  prizesIssued: true,
  attendance: true,
  billable: true,
  amountCents: true,
  cinemaId: true,
  cinema: { select: { name: true, city: true } },
  screen: { select: { name: true } },
} satisfies Prisma.DeliverySelect;

type DeliveryRow = Prisma.DeliveryGetPayload<{ select: typeof DELIVERY_SELECT }>;

function loadDeliveries(campaignId: bigint, period: SponsorPortalPeriodQuery) {
  const playedAt = periodWhere(period);
  return prisma.delivery.findMany({
    where: { campaignId, ...(playedAt ? { playedAt } : {}) },
    select: DELIVERY_SELECT,
    orderBy: [{ playedAt: 'asc' }, { id: 'asc' }],
  });
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Courbe jour par jour (Paris) ; les jours sans diffusion de l'intervalle valent 0. */
function buildByDay(
  rows: DeliveryRow[],
  period: SponsorPortalPeriodQuery,
): SponsorCampaignStats['byDay'] {
  const map = new Map<string, { sessions: number; participants: number }>();
  for (const d of rows) {
    const day = parisDayOf(d.playedAt);
    const entry = map.get(day) ?? { sessions: 0, participants: 0 };
    entry.sessions += 1;
    entry.participants += d.participants;
    map.set(day, entry);
  }
  const days = [...map.keys()].sort();
  const first = period.from ?? days[0];
  const last = period.to ?? days[days.length - 1];
  const out: SponsorCampaignStats['byDay'] = [];
  if (first !== undefined && last !== undefined) {
    let day = first;
    for (let i = 0; day <= last && i < MAX_FILLED_DAYS; i++) {
      out.push({ day, ...(map.get(day) ?? { sessions: 0, participants: 0 }) });
      day = nextCalendarDay(day);
    }
    if (day <= last) {
      // Intervalle trop long pour être complété : on ajoute seulement les jours non nuls restants.
      for (const d of days) if (d >= day) out.push({ day: d, ...map.get(d)! });
    }
  }
  return out;
}

function buildByCinema(rows: DeliveryRow[]): SponsorCampaignStats['byCinema'] {
  const map = new Map<string, SponsorCampaignStats['byCinema'][number]>();
  for (const d of rows) {
    const key = d.cinemaId.toString();
    const entry = map.get(key) ?? {
      cinemaName: d.cinema.name,
      city: d.cinema.city,
      sessions: 0,
      participants: 0,
    };
    entry.sessions += 1;
    entry.participants += d.participants;
    map.set(key, entry);
  }
  return [...map.values()].sort(
    (a, b) => b.sessions - a.sessions || a.cinemaName.localeCompare(b.cinemaName, 'fr'),
  );
}

async function getCampaignStats(
  user: SponsorScopeUser,
  id: bigint,
  period: SponsorPortalPeriodQuery,
): Promise<SponsorCampaignStats> {
  const campaign = await loadCampaignFor(user, id);
  const rows = await loadDeliveries(campaign.id, period);

  let participants = 0;
  let finishers = 0;
  let prizesIssued = 0;
  let amountCents = 0;
  let billableSessions = 0;
  let attendanceKnownSessions = 0;
  let attendanceTotal = 0;
  let participantsWithAttendance = 0;
  for (const d of rows) {
    participants += d.participants;
    finishers += d.finishers;
    prizesIssued += d.prizesIssued;
    amountCents += d.amountCents;
    if (d.billable) billableSessions += 1;
    if (d.attendance !== null) {
      attendanceKnownSessions += 1;
      attendanceTotal += d.attendance;
      participantsWithAttendance += d.participants;
    }
  }

  // Lots utilisés des séances diffusées (même périmètre que `prizesIssued`, C3). C5 : null dès
  // qu'un de ces lots est un lot à code, dont l'utilisation chez le partenaire n'est pas connue.
  const sessionIds = [...new Set(rows.map((d) => d.sessionId))];
  const prizesRedeemed =
    sessionIds.length === 0
      ? 0
      : countRedeemedOrNull(
          await prisma.prize.findMany({
            where: { sessionId: { in: sessionIds } },
            select: { redeemedAt: true, payloadJson: true },
          }),
        );

  return {
    campaign: shapeCampaign(campaign),
    period: { from: period.from ?? null, to: period.to ?? null },
    sessionsPlayed: rows.length,
    billableSessions,
    participants,
    finishers,
    completionRate: ratio(finishers, participants),
    prizesIssued,
    prizesRedeemed,
    attendanceKnownSessions,
    attendanceTotal,
    participationRate: ratio(participantsWithAttendance, attendanceTotal),
    amountCents,
    byDay: buildByDay(rows, period),
    byCinema: buildByCinema(rows),
  };
}

const CSV_DATE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Export CSV : une ligne par séance diffusée, sans aucune donnée individuelle. */
async function exportCampaignCsv(
  user: SponsorScopeUser,
  id: bigint,
  period: SponsorPortalPeriodQuery,
): Promise<{ filename: string; csv: string }> {
  const campaign = await loadCampaignFor(user, id);
  const rows = await loadDeliveries(campaign.id, period);
  const header = [
    'date',
    'cinema',
    'ville',
    'salle',
    'participants',
    'finishers',
    'lots',
    'facturable',
  ];
  const lines = [header.join(',')];
  for (const d of rows) {
    lines.push(
      [
        csvCell(CSV_DATE.format(d.playedAt)),
        csvCell(d.cinema.name),
        csvCell(d.cinema.city),
        csvCell(d.screen.name),
        csvCell(d.participants),
        csvCell(d.finishers),
        csvCell(d.prizesIssued),
        csvCell(d.billable ? 'oui' : 'non'),
      ].join(','),
    );
  }
  const suffix = [period.from, period.to].filter(Boolean).join('_');
  return {
    filename: `campagne-${campaign.id}${suffix ? `-${suffix}` : ''}.csv`,
    csv: `${lines.join('\n')}\n`,
  };
}

export const sponsorPortalService = { listCampaigns, getCampaignStats, exportCampaignCsv };
