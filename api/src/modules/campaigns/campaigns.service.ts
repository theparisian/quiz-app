import type { Prisma } from '@prisma/client';
import {
  DEFAULT_MAX_SESSIONS_PER_SCREEN_PER_DAY,
  cinemaShareOf,
  type Campaign as CampaignDto,
  type CampaignStatusValue,
  type CampaignTotals,
  type CatalogRevenue,
  type CreateCampaignBody,
  type Delivery as DeliveryDto,
  type ListCampaignsQuery,
  type ListDeliveriesQuery,
  type UpdateCampaignBody,
} from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';

/**
 * Campagnes des sponsors (C3, super_admin). Une campagne est créée en brouillon, puis activée,
 * mise en pause ou terminée. Une seule campagne active par jeu sur une même période : contrôlé
 * à l'activation et à la modification des dates d'une campagne active (409 CAMPAIGN_OVERLAP).
 */

const CAMPAIGN_INCLUDE = {
  sponsor: { select: { slug: true, name: true } },
  game: { select: { slug: true, title: true } },
} satisfies Prisma.CampaignInclude;

type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

const EMPTY_TOTALS: CampaignTotals = {
  deliveries: 0,
  billableDeliveries: 0,
  participants: 0,
  amountCents: 0,
  cinemaShareCents: 0,
};

async function totalsFor(campaignIds: bigint[]): Promise<Map<string, CampaignTotals>> {
  const map = new Map<string, CampaignTotals>();
  if (campaignIds.length === 0) return map;
  const [all, billable] = await Promise.all([
    prisma.delivery.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: campaignIds } },
      _count: { _all: true },
      _sum: { amountCents: true, cinemaShareCents: true },
    }),
    prisma.delivery.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: campaignIds }, billable: true },
      _count: { _all: true },
      _sum: { participants: true },
    }),
  ]);
  for (const row of all) {
    map.set(row.campaignId.toString(), {
      ...EMPTY_TOTALS,
      deliveries: row._count._all,
      amountCents: row._sum.amountCents ?? 0,
      cinemaShareCents: row._sum.cinemaShareCents ?? 0,
    });
  }
  for (const row of billable) {
    const t = map.get(row.campaignId.toString());
    if (!t) continue;
    t.billableDeliveries = row._count._all;
    t.participants = row._sum.participants ?? 0;
  }
  return map;
}

function shapeCampaign(c: CampaignRow, totals: CampaignTotals | undefined): CampaignDto {
  return {
    id: c.id.toString(),
    sponsor: { slug: c.sponsor.slug, name: c.sponsor.name },
    game: { slug: c.game.slug, title: c.game.title },
    name: c.name,
    status: c.status,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    pricing: c.pricing,
    unitPriceCents: c.unitPriceCents,
    cinemaSharePercent: c.cinemaSharePercent,
    maxSessions: c.maxSessions,
    maxSessionsPerScreenPerDay: c.maxSessionsPerScreenPerDay,
    emailSharingEnabled: c.emailSharingEnabled,
    notes: c.notes,
    totals: totals ?? { ...EMPTY_TOTALS },
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function loadRow(id: bigint): Promise<CampaignRow> {
  const row = await prisma.campaign.findUnique({ where: { id }, include: CAMPAIGN_INCLUDE });
  if (!row) throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
  return row;
}

async function getDto(id: bigint): Promise<CampaignDto> {
  const row = await loadRow(id);
  const totals = await totalsFor([row.id]);
  return shapeCampaign(row, totals.get(row.id.toString()));
}

/**
 * Refuse une seconde campagne active du même jeu dont la période chevauche [startsAt, endsAt].
 * Appelé dans une transaction qui verrouille la ligne du jeu.
 */
async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  campaign: { id: bigint; gameId: bigint; startsAt: Date; endsAt: Date },
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM games WHERE id = ${campaign.gameId} FOR UPDATE`;
  const other = await tx.campaign.findFirst({
    where: {
      gameId: campaign.gameId,
      status: 'active',
      id: { not: campaign.id },
      startsAt: { lte: campaign.endsAt },
      endsAt: { gte: campaign.startsAt },
    },
    select: { id: true, name: true },
  });
  if (other) {
    throw new AppError(
      'Another active campaign already covers this game over this period',
      409,
      'CAMPAIGN_OVERLAP',
      true,
      { campaignId: other.id.toString(), name: other.name },
    );
  }
}

async function list(query: ListCampaignsQuery) {
  const where: Prisma.CampaignWhereInput = {};
  if (query.sponsorSlug) where.sponsor = { slug: query.sponsorSlug };
  if (query.gameSlug) where.game = { slug: query.gameSlug };
  if (query.status) where.status = query.status;
  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: CAMPAIGN_INCLUDE,
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.campaign.count({ where }),
  ]);
  const totals = await totalsFor(rows.map((r) => r.id));
  return {
    items: rows.map((r) => shapeCampaign(r, totals.get(r.id.toString()))),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function create(body: CreateCampaignBody): Promise<CampaignDto> {
  const [sponsor, game] = await Promise.all([
    prisma.sponsor.findUnique({ where: { slug: body.sponsorSlug }, select: { id: true } }),
    prisma.game.findUnique({
      where: { slug: body.gameSlug },
      select: { id: true, sponsorId: true },
    }),
  ]);
  if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
  if (!game) throw new AppError('Game not found', 404, 'GAME_NOT_FOUND');
  if (game.sponsorId !== sponsor.id) {
    throw new AppError(
      'The game is not sponsored by this sponsor',
      400,
      'CAMPAIGN_GAME_SPONSOR_MISMATCH',
    );
  }
  const row = await prisma.campaign.create({
    data: {
      sponsorId: sponsor.id,
      gameId: game.id,
      name: body.name,
      status: 'draft',
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      pricing: body.pricing,
      unitPriceCents: body.unitPriceCents,
      cinemaSharePercent: body.cinemaSharePercent,
      maxSessions: body.maxSessions ?? null,
      maxSessionsPerScreenPerDay:
        body.maxSessionsPerScreenPerDay === undefined
          ? DEFAULT_MAX_SESSIONS_PER_SCREEN_PER_DAY
          : body.maxSessionsPerScreenPerDay,
      emailSharingEnabled: body.emailSharingEnabled ?? false,
      notes: body.notes ?? null,
    },
  });
  logger.info({ campaignId: row.id.toString() }, 'Campaign created');
  return getDto(row.id);
}

async function update(id: bigint, body: UpdateCampaignBody): Promise<CampaignDto> {
  const current = await loadRow(id);
  if (current.status === 'ended') {
    throw new AppError('An ended campaign cannot be modified', 409, 'CAMPAIGN_ENDED');
  }
  const startsAt = body.startsAt !== undefined ? new Date(body.startsAt) : current.startsAt;
  const endsAt = body.endsAt !== undefined ? new Date(body.endsAt) : current.endsAt;
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new AppError('endsAt must be after startsAt', 400, 'VALIDATION_ERROR');
  }
  const data: Prisma.CampaignUpdateInput = { startsAt, endsAt };
  if (body.name !== undefined) data.name = body.name;
  if (body.pricing !== undefined) data.pricing = body.pricing;
  if (body.unitPriceCents !== undefined) data.unitPriceCents = body.unitPriceCents;
  if (body.cinemaSharePercent !== undefined) data.cinemaSharePercent = body.cinemaSharePercent;
  if (body.maxSessions !== undefined) data.maxSessions = body.maxSessions;
  if (body.maxSessionsPerScreenPerDay !== undefined) {
    data.maxSessionsPerScreenPerDay = body.maxSessionsPerScreenPerDay;
  }
  if (body.emailSharingEnabled !== undefined) data.emailSharingEnabled = body.emailSharingEnabled;
  if (body.notes !== undefined) data.notes = body.notes;

  await prisma.$transaction(async (tx) => {
    if (current.status === 'active') {
      await assertNoOverlap(tx, { id, gameId: current.gameId, startsAt, endsAt });
    }
    await tx.campaign.update({ where: { id }, data });
  });
  return getDto(id);
}

async function remove(id: bigint): Promise<void> {
  await loadRow(id);
  const deliveries = await prisma.delivery.count({ where: { campaignId: id } });
  if (deliveries > 0) {
    throw new AppError(
      'A campaign with deliveries cannot be deleted; end it instead',
      409,
      'CAMPAIGN_HAS_DELIVERIES',
    );
  }
  await prisma.campaign.delete({ where: { id } });
  logger.info({ campaignId: id.toString() }, 'Campaign deleted');
}

const TRANSITIONS: Record<'activate' | 'pause' | 'end', CampaignStatusValue[]> = {
  activate: ['draft', 'paused'],
  pause: ['active'],
  end: ['draft', 'active', 'paused'],
};

const TARGET: Record<'activate' | 'pause' | 'end', CampaignStatusValue> = {
  activate: 'active',
  pause: 'paused',
  end: 'ended',
};

async function transition(
  id: bigint,
  action: 'activate' | 'pause' | 'end',
  now: Date = new Date(),
): Promise<CampaignDto> {
  const current = await loadRow(id);
  if (!TRANSITIONS[action].includes(current.status)) {
    throw new AppError(
      `Cannot ${action} a campaign in status ${current.status}`,
      409,
      'CAMPAIGN_INVALID_TRANSITION',
    );
  }
  await prisma.$transaction(async (tx) => {
    if (action === 'activate') {
      if (current.endsAt.getTime() <= now.getTime()) {
        throw new AppError('The campaign period is over', 409, 'CAMPAIGN_EXPIRED');
      }
      await assertNoOverlap(tx, current);
    }
    await tx.campaign.update({ where: { id }, data: { status: TARGET[action] } });
  });
  logger.info({ campaignId: id.toString(), action }, 'Campaign status changed');
  return getDto(id);
}

async function listDeliveries(id: bigint, query: ListDeliveriesQuery) {
  await loadRow(id);
  const where: Prisma.DeliveryWhereInput = { campaignId: id };
  const [rows, total] = await Promise.all([
    prisma.delivery.findMany({
      where,
      include: {
        session: { select: { slugShort: true } },
        screen: { select: { id: true, name: true } },
        cinema: { select: { slug: true, name: true } },
      },
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.delivery.count({ where }),
  ]);
  const items: DeliveryDto[] = rows.map((d) => ({
    id: d.id.toString(),
    campaignId: d.campaignId.toString(),
    sessionId: d.sessionId.toString(),
    sessionCode: d.session.slugShort,
    roundId: d.roundId.toString(),
    screen: { id: d.screen.id.toString(), name: d.screen.name },
    cinema: { slug: d.cinema.slug, name: d.cinema.name },
    playedAt: d.playedAt.toISOString(),
    proofDisplayedAt: d.proofDisplayedAt?.toISOString() ?? null,
    participants: d.participants,
    finishers: d.finishers,
    prizesIssued: d.prizesIssued,
    attendance: d.attendance,
    billable: d.billable,
    nonBillableReason: d.nonBillableReason,
    amountCents: d.amountCents,
    cinemaShareCents: d.cinemaShareCents,
  }));
  return { items, total, page: query.page, limit: query.limit };
}

/**
 * Ce que rapporte au cinéma chaque jeu sous campagne active couvrant `at` (catalogue) :
 * part du cinéma du prix unitaire, par séance ou par participant.
 */
async function revenueByGame(
  gameIds: bigint[],
  at: Date = new Date(),
): Promise<Map<string, CatalogRevenue>> {
  const map = new Map<string, CatalogRevenue>();
  if (gameIds.length === 0) return map;
  const rows = await prisma.campaign.findMany({
    where: {
      gameId: { in: gameIds },
      status: 'active',
      startsAt: { lte: at },
      endsAt: { gte: at },
    },
    orderBy: { startsAt: 'desc' },
    select: { gameId: true, pricing: true, unitPriceCents: true, cinemaSharePercent: true },
  });
  for (const c of rows) {
    const key = c.gameId.toString();
    if (map.has(key)) continue;
    map.set(key, {
      pricing: c.pricing,
      cinemaAmountCents: cinemaShareOf(c.unitPriceCents, c.cinemaSharePercent),
    });
  }
  return map;
}

export const campaignsService = {
  list,
  get: getDto,
  create,
  update,
  remove,
  transition,
  listDeliveries,
  revenueByGame,
};
