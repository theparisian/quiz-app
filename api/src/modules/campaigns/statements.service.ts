import type { Statement, StatementLine } from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { assertCanAccessCinema, type TenantScopeUser } from '../../shared/auth/tenant-scope.js';
import { parisMonthRange } from '../../shared/time/paris-calendar.js';
import { csvCell } from '../sessions/session-report.service.js';

/**
 * Relevé mensuel d'un cinéma (C3) : une ligne par manche sponsorisée diffusée dans une de ses
 * séances pendant le mois (heure de Paris), facturable ou non, et le total de la part cinéma.
 */
async function buildStatement(
  user: TenantScopeUser,
  cinemaSlug: string,
  month: string,
): Promise<Statement> {
  const cinema = await prisma.cinema.findUnique({
    where: { slug: cinemaSlug },
    select: { id: true, slug: true, name: true, deletedAt: true },
  });
  if (!cinema || cinema.deletedAt) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  await assertCanAccessCinema(user, cinema.id);

  const { start, end } = parisMonthRange(month);
  const rows = await prisma.delivery.findMany({
    where: { cinemaId: cinema.id, playedAt: { gte: start, lt: end } },
    include: {
      session: { select: { slugShort: true } },
      screen: { select: { name: true } },
      campaign: {
        select: {
          name: true,
          pricing: true,
          sponsor: { select: { name: true } },
          game: { select: { title: true } },
        },
      },
    },
    orderBy: [{ playedAt: 'asc' }, { id: 'asc' }],
  });

  const lines: StatementLine[] = rows.map((d) => ({
    deliveryId: d.id.toString(),
    sessionId: d.sessionId.toString(),
    sessionCode: d.session.slugShort,
    playedAt: d.playedAt.toISOString(),
    screenName: d.screen.name,
    gameTitle: d.campaign.game.title,
    sponsorName: d.campaign.sponsor.name,
    campaignName: d.campaign.name,
    pricing: d.campaign.pricing,
    participants: d.participants,
    finishers: d.finishers,
    attendance: d.attendance,
    billable: d.billable,
    nonBillableReason: d.nonBillableReason,
    amountCents: d.amountCents,
    cinemaShareCents: d.cinemaShareCents,
  }));

  const billable = lines.filter((l) => l.billable);
  return {
    cinema: { slug: cinema.slug, name: cinema.name },
    month,
    lines,
    totals: {
      deliveries: lines.length,
      billableDeliveries: billable.length,
      participants: billable.reduce((acc, l) => acc + l.participants, 0),
      amountCents: lines.reduce((acc, l) => acc + l.amountCents, 0),
      cinemaShareCents: lines.reduce((acc, l) => acc + l.cinemaShareCents, 0),
    },
  };
}

/** Même relevé en CSV (format de `buildCinemaSessionsCsv`), dernière ligne = total. */
function statementToCsv(statement: Statement): string {
  const header = [
    'date',
    'salle',
    'seance',
    'jeu',
    'sponsor',
    'campagne',
    'tarif',
    'participants',
    'finishers',
    'entrees',
    'facturable',
    'motif_non_facturable',
    'montant_cents',
    'part_cinema_cents',
  ];
  const lines = [header.join(',')];
  for (const l of statement.lines) {
    lines.push(
      [
        csvCell(l.playedAt),
        csvCell(l.screenName),
        csvCell(l.sessionCode),
        csvCell(l.gameTitle),
        csvCell(l.sponsorName),
        csvCell(l.campaignName),
        csvCell(l.pricing),
        csvCell(l.participants),
        csvCell(l.finishers),
        csvCell(l.attendance),
        csvCell(l.billable ? 'oui' : 'non'),
        csvCell(l.nonBillableReason),
        csvCell(l.amountCents),
        csvCell(l.cinemaShareCents),
      ].join(','),
    );
  }
  const total = header.map(() => '');
  total[0] = 'total';
  total[header.length - 2] = csvCell(statement.totals.amountCents);
  total[header.length - 1] = csvCell(statement.totals.cinemaShareCents);
  lines.push(total.join(','));
  return `${lines.join('\n')}\n`;
}

export const statementsService = { buildStatement, statementToCsv };
