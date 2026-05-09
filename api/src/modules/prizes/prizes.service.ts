import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';
import { sendEmail } from '../../shared/email/index.js';
import type { AuthUser } from '../../shared/auth/middleware.js';
import { resolvePrizeConfig } from './prize-config.service.js';
import { signPrize, verifyPrizeSignature } from './prize-signature.service.js';
import { prizesConfigSchema, type PrizesConfig, type ListPrizesQuery } from './prizes.schemas.js';
import { buildPrizeEmail } from '../../shared/email/templates/prize-email.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  try {
    await sendEmail(opts);
  } catch (err) {
    logger.warn({ err }, 'Email send failed, retrying once');
    await sleep(2000);
    await sendEmail(opts);
  }
}

function redeemBaseUrl(): string {
  return (process.env.PRIZE_REDEEM_BASE_URL ?? 'http://localhost:3000/redeem').replace(/\/$/, '');
}

function unsubscribeBaseUrl(): string {
  return (process.env.PRIZE_UNSUBSCRIBE_BASE_URL ?? 'http://localhost:3000/unsubscribe').replace(
    /\/$/,
    '',
  );
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

    if (!player.rankFinal || player.rankFinal > 3) {
      throw new AppError('Player not in top 3', 403, 'PLAYER_NOT_ELIGIBLE');
    }

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

    const config = await resolvePrizeConfig(player.sessionId, player.rankFinal);
    if (!config) {
      throw new AppError(
        "Le cinéma n'a pas encore configuré de lot pour cette position. Contacte l'équipe.",
        404,
        'PRIZE_NOT_CONFIGURED',
      );
    }

    await prisma.player.update({
      where: { id: playerId },
      data: { emailForPrize: requestEmail },
    });

    const redeemCode = nanoid(16);
    const signature = signPrize(redeemCode);

    const prize = await prisma.prize.create({
      data: {
        sessionId: player.sessionId,
        playerId,
        redeemCode,
        signature,
        rank: player.rankFinal,
        label: config.label,
        type: config.type,
        payloadJson: { value: config.value, configEntry: config },
      },
    });

    logger.info(
      {
        sessionId: player.sessionId.toString(),
        playerId: playerId.toString(),
        rank: player.rankFinal,
        redeemCode,
      },
      'Prize created',
    );

    const sigEnc = encodeURIComponent(signature);
    const redeemUrl = `${redeemBaseUrl()}/${encodeURIComponent(redeemCode)}?sig=${sigEnc}`;
    const unsubscribeUrl = `${unsubscribeBaseUrl()}?code=${encodeURIComponent(redeemCode)}&sig=${sigEnc}`;

    const qrCodeDataUrl = await QRCode.toDataURL(redeemUrl, { width: 400, margin: 2 });

    const cinema = player.session.screen.cinema;
    const { subject, html, text } = buildPrizeEmail({
      pseudo: player.pseudo,
      rank: player.rankFinal,
      quizTitle: player.session.quiz.title,
      cinemaName: cinema.name,
      cinemaLogoUrl: cinema.logoUrl,
      prizeLabel: config.label,
      redeemUrl,
      redeemCode,
      unsubscribeUrl,
      qrCodeDataUrl,
    });

    try {
      await sendWithRetry({ to: requestEmail, subject, html, text });
      await prisma.prize.update({
        where: { id: prize.id },
        data: { emailSentAt: new Date() },
      });
      logger.info({ redeemCode, prizeId: prize.id.toString() }, 'Prize email sent');
      return { prizeId: prize.id.toString(), emailSent: true };
    } catch (err) {
      logger.error(
        { err, redeemCode, prizeId: prize.id.toString() },
        'Prize email failed after retry',
      );
      throw new AppError(
        "L'email n'a pas pu être envoyé. Le cinéma sera prévenu et te recontactera.",
        500,
        'PRIZE_EMAIL_SEND_FAILED',
      );
    }
  },

  async redeem(redeemCode: string, signature: string) {
    if (!verifyPrizeSignature(redeemCode, signature.toLowerCase())) {
      throw new AppError('Invalid signature', 401, 'INVALID_SIGNATURE');
    }

    const prize = await prisma.prize.findUnique({
      where: { redeemCode },
    });
    if (!prize) throw new AppError('Prize not found', 404, 'PRIZE_NOT_FOUND');

    if (prize.redeemedAt) {
      throw new AppError('Ce lot a déjà été utilisé.', 409, 'ALREADY_REDEEMED', true, {
        redeemedAt: prize.redeemedAt.toISOString(),
      });
    }

    const updated = await prisma.prize.update({
      where: { id: prize.id },
      data: { redeemedAt: new Date() },
    });

    logger.info({ redeemCode, redeemedAt: updated.redeemedAt?.toISOString() }, 'Prize redeemed');

    return {
      prizeId: prize.id.toString(),
      label: prize.label,
      redeemedAt: updated.redeemedAt!.toISOString(),
    };
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
      data: { emailForPrize: null },
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
          rank: p.rank,
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
