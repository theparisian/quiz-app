import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import type { AuthUser } from '../../shared/auth/middleware.js';
import { resolveEligiblePrizeForPlayer } from './prize-config.service.js';
import { signPrize, verifyPrizeSignature } from './prize-signature.service.js';
import { generateUniqueShortCode } from './short-code.service.js';
import { prizesConfigSchema, type PrizesConfig, type ListPrizesQuery } from './prizes.schemas.js';
import {
  enqueuePrizeEmail,
  sendPrizeEmailNow,
} from '../../shared/email/prize-email-queue.service.js';

function prizeNotConfiguredMessage(isConsolationAttempt: boolean): string {
  if (isConsolationAttempt) {
    return "Le lot n'est plus disponible.";
  }
  return "Le cinéma n'a pas encore configuré de lot pour cette position. Contacte l'équipe.";
}

async function assertCinemaStaffCanAccessSlug(user: AuthUser, cinemaSlug: string) {
  const cinema = await prisma.cinema.findFirst({
    where: { slug: cinemaSlug, deletedAt: null },
  });
  if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  if (user.role === 'super_admin') return cinema;
  if (user.role === 'cinema_admin') {
    if (!user.cinemaId || user.cinemaId !== cinema.id) {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }
    return cinema;
  }
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
}

function parseStoredConfig(raw: unknown): PrizesConfig {
  const parsed = prizesConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

function redeemBaseUrl(): string {
  return (process.env.PRIZE_REDEEM_BASE_URL ?? 'http://localhost:3000/redeem').replace(/\/$/, '');
}

async function computeExpiresAt(templateId: bigint | null): Promise<Date | null> {
  if (!templateId) return null;
  const template = await prisma.prizeTemplate.findUnique({
    where: { id: templateId },
    select: { validityDays: true },
  });
  if (!template?.validityDays) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + template.validityDays);
  return expiresAt;
}

export const prizesService = {
  async createForPlayer(playerId: bigint, requestEmail: string) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        session: {
          include: {
            screen: { include: { cinema: true } },
            quiz: { include: { sponsor: true } },
          },
        },
      },
    });
    if (!player) throw new AppError('Player not found', 404, 'PLAYER_NOT_FOUND');

    if (player.session.state !== 'ended') {
      throw new AppError('Session is not ended', 409, 'SESSION_NOT_ENDED');
    }

    if (!player.rankFinal) {
      throw new AppError('Player has no final rank', 403, 'PLAYER_NOT_ELIGIBLE');
    }
    const rankFinal = player.rankFinal;

    const existing = await prisma.prize.findUnique({
      where: {
        playerId_sessionId: { playerId, sessionId: player.sessionId },
      },
    });
    if (existing) {
      throw new AppError(
        'Un lot a déjà été attribué pour cette session.',
        409,
        'PRIZE_ALREADY_EXISTS',
      );
    }

    let eligible = await resolveEligiblePrizeForPlayer(player.sessionId, rankFinal);
    if (!eligible) {
      throw new AppError(prizeNotConfiguredMessage(true), 404, 'PRIZE_NOT_CONFIGURED');
    }

    await prisma.player.update({
      where: { id: playerId },
      data: { emailForPrize: requestEmail, emailConsentAt: new Date() },
    });

    const excludedTemplateIds: bigint[] = [];
    let prize: Awaited<ReturnType<typeof prisma.prize.create>> | null = null;
    let isConsolation = eligible.isConsolation;

    for (let attempt = 0; attempt < 5; attempt++) {
      eligible = await resolveEligiblePrizeForPlayer(player.sessionId, rankFinal, {
        excludeTemplateIds: excludedTemplateIds,
      });
      if (!eligible) {
        throw new AppError(prizeNotConfiguredMessage(isConsolation), 404, 'PRIZE_NOT_CONFIGURED');
      }

      const config = eligible.config;
      isConsolation = eligible.isConsolation;
      const templateId = config.templateId ? BigInt(config.templateId) : null;
      const redeemCode = nanoid(16);
      const signature = signPrize(redeemCode);
      const shortCode = await generateUniqueShortCode();
      const expiresAt = await computeExpiresAt(templateId);

      try {
        prize = await prisma.$transaction(async (tx) => {
          if (templateId) {
            const template = await tx.prizeTemplate.findUnique({ where: { id: templateId } });
            if (template && template.stock !== null) {
              const dec = await tx.prizeTemplate.updateMany({
                where: { id: templateId, stock: { gt: 0 } },
                data: { stock: { decrement: 1 } },
              });
              if (dec.count === 0) {
                throw new Error('STOCK_EXHAUSTED');
              }
            }
          }

          return tx.prize.create({
            data: {
              sessionId: player.sessionId,
              playerId,
              redeemCode,
              signature,
              shortCode,
              expiresAt,
              rank: rankFinal,
              isConsolation,
              label: config.label,
              type: config.type,
              prizeTemplateId: templateId,
              payloadJson: { value: config.value, configEntry: config },
            },
          });
        });
        break;
      } catch (err) {
        if (err instanceof Error && err.message === 'STOCK_EXHAUSTED' && templateId) {
          excludedTemplateIds.push(templateId);
          continue;
        }
        throw err;
      }
    }

    if (!prize) {
      throw new AppError(prizeNotConfiguredMessage(isConsolation), 404, 'PRIZE_NOT_CONFIGURED');
    }

    logger.info(
      {
        sessionId: player.sessionId.toString(),
        playerId: playerId.toString(),
        rank: rankFinal,
        isConsolation,
        redeemCode: prize.redeemCode,
        shortCode: prize.shortCode,
      },
      'Prize created',
    );

    enqueuePrizeEmail(prize.id);

    return { prizeId: prize.id.toString(), emailQueued: true };
  },

  async resendEmail(prizeId: bigint, user: AuthUser) {
    const prize = await prisma.prize.findUnique({
      where: { id: prizeId },
      include: {
        player: true,
        session: {
          include: {
            screen: { include: { cinema: true } },
            quiz: true,
          },
        },
      },
    });
    if (!prize) throw new AppError('Prize not found', 404, 'PRIZE_NOT_FOUND');
    if (!prize.player.emailForPrize) {
      throw new AppError('No email on file for this player', 400, 'NO_PLAYER_EMAIL');
    }

    const cinema = prize.session.screen.cinema;
    await assertCinemaStaffCanAccessSlug(user, cinema.slug);

    const resentEvents = await prisma.eventLog.findMany({
      where: { eventType: 'prize.email_resent' },
      select: { payloadJson: true },
    });
    const resentCount = resentEvents.filter(
      (e) => (e.payloadJson as { prizeId?: string } | null)?.prizeId === prize.id.toString(),
    ).length;
    if (resentCount >= 3) {
      throw new AppError('Limite de renvois atteinte pour ce lot.', 429, 'RESEND_LIMIT_REACHED');
    }

    const outcome = await sendPrizeEmailNow(prize.id);

    await prisma.prize.update({
      where: { id: prize.id },
      data: { emailSentAt: new Date() },
    });

    logEvent({
      level: 'info',
      eventType: 'prize.email_resent',
      sessionId: prize.sessionId,
      cinemaId: cinema.id,
      payload: { prizeId: prize.id.toString() },
    });

    return { prizeId: prize.id.toString(), emailSent: true, retried: outcome === 'retry_ok' };
  },

  async unsubscribe(redeemCode: string, signature: string) {
    if (!verifyPrizeSignature(redeemCode, signature.toLowerCase())) {
      throw new AppError('Invalid signature', 401, 'INVALID_SIGNATURE');
    }

    const prize = await prisma.prize.findUnique({
      where: { redeemCode },
      include: { player: true },
    });
    if (!prize) throw new AppError('Prize not found', 404, 'PRIZE_NOT_FOUND');

    await prisma.player.update({
      where: { id: prize.playerId },
      data: { emailForPrize: null, emailConsentAt: null },
    });

    logger.info({ redeemCode }, 'Player unsubscribed from prize emails');

    return { ok: true as const };
  },

  async listByCinema(cinemaSlug: string, user: AuthUser, query: ListPrizesQuery) {
    await assertCinemaStaffCanAccessSlug(user, cinemaSlug);

    const sessionWhere: Prisma.SessionWhereInput = {
      screen: { cinema: { slug: cinemaSlug } },
    };
    if (query.from || query.to) {
      if (query.from && Number.isNaN(new Date(query.from).getTime())) {
        throw new AppError('Invalid date filter', 400, 'INVALID_QUERY');
      }
      if (query.to && Number.isNaN(new Date(query.to).getTime())) {
        throw new AppError('Invalid date filter', 400, 'INVALID_QUERY');
      }
      sessionWhere.endedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const where: Prisma.PrizeWhereInput = {
      session: sessionWhere,
    };

    if (query.kind === 'podium') {
      where.isConsolation = false;
    } else if (query.kind === 'consolation') {
      where.isConsolation = true;
    }

    if (query.status === 'sent') {
      where.emailSentAt = { not: null };
    } else if (query.status === 'failed') {
      where.emailSentAt = null;
    } else if (query.status === 'redeemed') {
      where.redeemedAt = { not: null };
    }

    if (query.search?.trim()) {
      where.player = { pseudo: { contains: query.search.trim() } };
    }

    const [items, total] = await Promise.all([
      prisma.prize.findMany({
        where,
        include: {
          player: { select: { pseudo: true, emailForPrize: true } },
          session: {
            select: {
              endedAt: true,
              slugShort: true,
              quiz: { select: { title: true } },
            },
          },
        },
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.prize.count({ where }),
    ]);

    const base = redeemBaseUrl();
    return {
      items: items.map((p) => {
        const sigEnc = encodeURIComponent(p.signature);
        const redeemFullUrl = `${base}/${encodeURIComponent(p.redeemCode)}?sig=${sigEnc}`;
        return {
          id: p.id.toString(),
          redeemCode: p.redeemCode,
          shortCode: p.shortCode,
          rank: p.rank,
          isConsolation: p.isConsolation,
          label: p.label,
          emailSentAt: p.emailSentAt?.toISOString() ?? null,
          redeemedAt: p.redeemedAt?.toISOString() ?? null,
          playerPseudo: p.player.pseudo,
          playerEmail: p.player.emailForPrize,
          sessionSlugShort: p.session.slugShort,
          quizTitle: p.session.quiz.title,
          sessionEndedAt: p.session.endedAt?.toISOString() ?? null,
          redeemFullUrl,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  },

  async getCinemaConfig(cinemaSlug: string, user: AuthUser) {
    const cinema = await assertCinemaStaffCanAccessSlug(user, cinemaSlug);
    return { config: parseStoredConfig(cinema.prizesConfig) };
  },

  async updateCinemaConfig(cinemaSlug: string, user: AuthUser, data: PrizesConfig) {
    const cinema = await assertCinemaStaffCanAccessSlug(user, cinemaSlug);
    await prisma.cinema.update({
      where: { id: cinema.id },
      data: { prizesConfig: data as object },
    });
    return { config: data };
  },

  async getSponsorConfig(sponsorSlug: string) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug: sponsorSlug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    return { config: parseStoredConfig(sponsor.prizesConfig) };
  },

  async updateSponsorConfig(sponsorSlug: string, data: PrizesConfig) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug: sponsorSlug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    await prisma.sponsor.update({
      where: { id: sponsor.id },
      data: { prizesConfig: data as object },
    });
    return { config: data };
  },
};
