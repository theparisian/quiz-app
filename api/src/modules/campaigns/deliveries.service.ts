import { Prisma, type CampaignPricing, type Delivery } from '@prisma/client';
import {
  MIN_BILLABLE_PARTICIPANTS,
  cinemaShareOf,
  type NonBillableReason,
} from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { assertCanAccessSession, type TenantScopeUser } from '../../shared/auth/tenant-scope.js';
import { parisDayRange } from '../../shared/time/paris-calendar.js';

/**
 * Journal des diffusions (C3) : une Delivery par manche sponsorisée terminée (`ended`), créée à
 * la clôture de la manche par la plateforme. Preuve d'affichage, lots et entrées de la séance.
 */

/** Délai pendant lequel le cinéma peut saisir les entrées d'une séance terminée. */
export const ATTENDANCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface DeliveryDecisionInput {
  hasProof: boolean;
  participants: number;
  /** Diffusions facturables déjà comptées pour la campagne, la salle et le jour (Paris). */
  billableTodayOnScreen: number;
  /** Diffusions facturables déjà comptées pour la campagne. */
  billableForCampaign: number;
  campaign: {
    pricing: CampaignPricing;
    unitPriceCents: number;
    cinemaSharePercent: number;
    maxSessions: number | null;
    maxSessionsPerScreenPerDay: number | null;
  };
}

export interface DeliveryDecision {
  billable: boolean;
  nonBillableReason: NonBillableReason | null;
  amountCents: number;
  cinemaShareCents: number;
}

/**
 * Facturation d'une diffusion. Raisons de non-facturation, la première qui s'applique :
 * pas de preuve d'affichage, moins de 3 participants, plafond par salle et par jour, plafond
 * total de la campagne. Les plafonds ne comptent que les diffusions facturables.
 */
export function decideDelivery(input: DeliveryDecisionInput): DeliveryDecision {
  const { campaign } = input;
  let reason: NonBillableReason | null = null;
  if (!input.hasProof) reason = 'no_proof';
  else if (input.participants < MIN_BILLABLE_PARTICIPANTS) reason = 'too_few_players';
  else if (
    campaign.maxSessionsPerScreenPerDay !== null &&
    input.billableTodayOnScreen >= campaign.maxSessionsPerScreenPerDay
  ) {
    reason = 'daily_cap';
  } else if (campaign.maxSessions !== null && input.billableForCampaign >= campaign.maxSessions) {
    reason = 'campaign_cap';
  }
  if (reason) {
    return { billable: false, nonBillableReason: reason, amountCents: 0, cinemaShareCents: 0 };
  }
  const amountCents =
    campaign.pricing === 'per_participant'
      ? campaign.unitPriceCents * input.participants
      : campaign.unitPriceCents;
  return {
    billable: true,
    nonBillableReason: null,
    amountCents,
    cinemaShareCents: cinemaShareOf(amountCents, campaign.cinemaSharePercent),
  };
}

/** Participants de la manche (convention 7 : `state_json.platform.participants`). */
function readParticipants(stateJson: unknown): bigint[] {
  if (stateJson && typeof stateJson === 'object' && 'platform' in stateJson) {
    const platform = (stateJson as { platform?: { participants?: unknown } }).platform;
    if (Array.isArray(platform?.participants)) {
      return platform.participants
        .filter((p): p is string => typeof p === 'string' && /^\d{1,20}$/.test(p))
        .map((p) => BigInt(p));
    }
  }
  return [];
}

/** Campagne active du jeu couvrant `at` (au plus une, contrôlé à l'activation). */
export function findCoveringActiveCampaign(gameId: bigint, at: Date) {
  return prisma.campaign.findFirst({
    where: { gameId, status: 'active', startsAt: { lte: at }, endsAt: { gte: at } },
    orderBy: { startsAt: 'desc' },
  });
}

/**
 * Crée la Delivery d'une manche terminée si son jeu a une campagne active couvrant la date de
 * la manche. Idempotent (une seule Delivery par manche). Renvoie null sans campagne ou si la
 * manche n'est pas `ended` (une manche passée n'est pas une diffusion).
 */
async function recordRoundDelivery(roundId: bigint): Promise<Delivery | null> {
  const round = await prisma.sessionRound.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      state: true,
      gameId: true,
      startedAt: true,
      endedAt: true,
      stateJson: true,
      proofDisplayedAt: true,
      session: {
        select: {
          id: true,
          screenId: true,
          attendance: true,
          screen: { select: { cinemaId: true } },
        },
      },
    },
  });
  if (!round || round.state !== 'ended') return null;

  const playedAt = round.startedAt ?? round.endedAt ?? new Date();
  const campaign = await findCoveringActiveCampaign(round.gameId, playedAt);
  if (!campaign) return null;

  const participantIds = readParticipants(round.stateJson);
  const session = round.session;
  const [finishers, prizesIssued] = await Promise.all([
    participantIds.length > 0
      ? prisma.player.count({
          where: { sessionId: session.id, id: { in: participantIds }, status: 'active' },
        })
      : Promise.resolve(0),
    prisma.prize.count({ where: { sessionId: session.id } }),
  ]);

  const day = parisDayRange(playedAt);
  try {
    return await prisma.$transaction(async (tx) => {
      // Verrou sur la campagne : deux manches closes en même temps ne dépassent pas un plafond.
      await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${campaign.id} FOR UPDATE`;
      const existing = await tx.delivery.findUnique({ where: { roundId: round.id } });
      if (existing) return existing;
      const [billableTodayOnScreen, billableForCampaign] = await Promise.all([
        tx.delivery.count({
          where: {
            campaignId: campaign.id,
            screenId: session.screenId,
            billable: true,
            playedAt: { gte: day.start, lt: day.end },
          },
        }),
        tx.delivery.count({ where: { campaignId: campaign.id, billable: true } }),
      ]);
      const decision = decideDelivery({
        hasProof: round.proofDisplayedAt !== null,
        participants: participantIds.length,
        billableTodayOnScreen,
        billableForCampaign,
        campaign,
      });
      return tx.delivery.create({
        data: {
          campaignId: campaign.id,
          sessionId: session.id,
          roundId: round.id,
          screenId: session.screenId,
          cinemaId: session.screen.cinemaId,
          playedAt,
          proofDisplayedAt: round.proofDisplayedAt,
          participants: participantIds.length,
          finishers,
          prizesIssued,
          attendance: session.attendance,
          billable: decision.billable,
          nonBillableReason: decision.nonBillableReason,
          amountCents: decision.amountCents,
          cinemaShareCents: decision.cinemaShareCents,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.delivery.findUnique({ where: { roundId: round.id } });
    }
    throw err;
  }
}

/**
 * Preuve de diffusion envoyée par l'écran d'une salle : la manche doit appartenir à une séance
 * de cette salle et être en cours. Écrit `proofDisplayedAt` s'il est vide.
 */
async function recordProofDisplayed(input: {
  screenId: bigint;
  roundId: bigint;
  at?: Date;
}): Promise<{ recorded: boolean }> {
  const round = await prisma.sessionRound.findUnique({
    where: { id: input.roundId },
    select: { id: true, state: true, session: { select: { screenId: true } } },
  });
  if (!round) throw new AppError('Round not found', 404, 'ROUND_NOT_FOUND');
  if (round.session.screenId !== input.screenId) {
    throw new AppError('Round is not played on this screen', 403, 'ROUND_NOT_ON_SCREEN');
  }
  if (round.state !== 'running') {
    throw new AppError('Round is not running', 409, 'ROUND_NOT_RUNNING');
  }
  const res = await prisma.sessionRound.updateMany({
    where: { id: round.id, proofDisplayedAt: null },
    data: { proofDisplayedAt: input.at ?? new Date() },
  });
  return { recorded: res.count > 0 };
}

/** Un lot vient d'être créé pour la séance : compté sur ses diffusions sponsorisées. */
async function recordPrizeIssued(sessionId: bigint): Promise<void> {
  await prisma.delivery.updateMany({
    where: { sessionId },
    data: { prizesIssued: { increment: 1 } },
  });
}

/**
 * Entrées de la séance saisies par le cinéma (séance terminée depuis moins de 7 jours),
 * recopiées sur ses diffusions.
 */
async function setSessionAttendance(
  user: TenantScopeUser,
  sessionId: bigint,
  attendance: number,
  now: Date = new Date(),
): Promise<{ sessionId: string; attendance: number }> {
  await assertCanAccessSession(user, sessionId);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { state: true, endedAt: true },
  });
  if (session.state !== 'ended' && session.state !== 'aborted') {
    throw new AppError('Session is not ended', 409, 'SESSION_NOT_ENDED');
  }
  if (!session.endedAt || now.getTime() - session.endedAt.getTime() > ATTENDANCE_WINDOW_MS) {
    throw new AppError(
      'Attendance can only be set within 7 days after the session',
      409,
      'ATTENDANCE_WINDOW_CLOSED',
    );
  }
  await prisma.$transaction([
    prisma.session.update({ where: { id: sessionId }, data: { attendance } }),
    prisma.delivery.updateMany({ where: { sessionId }, data: { attendance } }),
  ]);
  return { sessionId: sessionId.toString(), attendance };
}

export const deliveriesService = {
  recordRoundDelivery,
  recordProofDisplayed,
  recordPrizeIssued,
  setSessionAttendance,
};
