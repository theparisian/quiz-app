import QRCode from 'qrcode';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import type { PrizeRedeemStatus } from '@quiz-app/validation';
import { verifyPrizeSignature } from './prize-signature.service.js';
import { verifyStaffPinForCinema } from './staff-pin.service.js';
import { normalizeShortCodeInput } from './short-code.service.js';
import { readPrizeRedeemInfo } from './prize-redeem-mode.js';

type PrizeWithCinema = {
  id: bigint;
  redeemCode: string;
  signature: string;
  label: string;
  type: string;
  shortCode: string;
  redeemedAt: Date | null;
  expiresAt: Date | null;
  sessionId: bigint;
  payloadJson: unknown;
  session: { screen: { cinema: { id: bigint; name: string } } };
};

async function loadPrizeByRedeemCode(redeemCode: string): Promise<PrizeWithCinema | null> {
  return prisma.prize.findUnique({
    where: { redeemCode },
    include: {
      session: { include: { screen: { include: { cinema: true } } } },
    },
  });
}

async function loadPrizeByShortCode(shortCode: string): Promise<PrizeWithCinema | null> {
  return prisma.prize.findUnique({
    where: { shortCode },
    include: {
      session: { include: { screen: { include: { cinema: true } } } },
    },
  });
}

export function computePrizeStatus(prize: {
  redeemedAt: Date | null;
  expiresAt: Date | null;
}): PrizeRedeemStatus {
  if (prize.redeemedAt) return 'redeemed';
  if (prize.expiresAt && prize.expiresAt.getTime() < Date.now()) return 'expired';
  return 'valid';
}

/** Lot à code (C5) : à présenter chez le partenaire, jamais validé au comptoir par PIN. */
function assertStaffRedeemable(prize: PrizeWithCinema) {
  if (readPrizeRedeemInfo(prize.payloadJson).redeemMode !== 'staff_pin') {
    throw new AppError(
      'Ce lot se présente directement chez le partenaire, sans validation au comptoir.',
      409,
      'NOT_STAFF_REDEEMABLE',
    );
  }
}

async function shapeStatusResponse(prize: PrizeWithCinema, includeTokens = false) {
  const status = computePrizeStatus(prize);
  const info = readPrizeRedeemInfo(prize.payloadJson);
  const partnerQrDataUrl = info.partnerCode
    ? await QRCode.toDataURL(info.partnerCode, { width: 400, margin: 2 })
    : null;
  return {
    label: prize.label,
    type: prize.type,
    cinemaName: prize.session.screen.cinema.name,
    status,
    redeemedAt: prize.redeemedAt?.toISOString() ?? null,
    expiresAt: prize.expiresAt?.toISOString() ?? null,
    shortCode: prize.shortCode,
    ...(includeTokens ? { redeemCode: prize.redeemCode, sig: prize.signature } : {}),
    redeemMode: info.redeemMode,
    partnerCode: info.partnerCode,
    partnerQrDataUrl,
    redeemInstructions: info.redeemInstructions,
    redeemUrl: info.redeemUrl,
  };
}

function assertValidSignature(redeemCode: string, sig: string, clientIp?: string | null) {
  if (!verifyPrizeSignature(redeemCode, sig.toLowerCase())) {
    const truncated = redeemCode.length > 6 ? `${redeemCode.slice(0, 6)}…` : redeemCode;
    logEvent({
      level: 'critical',
      eventType: 'prize.redemption_signature_invalid',
      payload: { redeemCode: truncated, ip: clientIp ?? null },
    });
    throw new AppError('Invalid signature', 401, 'INVALID_SIGNATURE');
  }
}

export const prizeRedeemService = {
  async getStatus(redeemCode: string, sig: string, clientIp?: string | null) {
    assertValidSignature(redeemCode, sig, clientIp);
    const prize = await loadPrizeByRedeemCode(redeemCode);
    if (!prize) throw new AppError('Prize not found', 404, 'PRIZE_NOT_FOUND');
    return shapeStatusResponse(prize);
  },

  async lookup(shortCodeRaw: string, staffPin: string, clientIp?: string | null) {
    const shortCode = normalizeShortCodeInput(shortCodeRaw);
    const prize = await loadPrizeByShortCode(shortCode);

    if (!prize) {
      throw new AppError('Code PIN incorrect.', 401, 'INVALID_PIN');
    }

    try {
      await verifyStaffPinForCinema(prize.session.screen.cinema.id, staffPin);
    } catch (err) {
      if (err instanceof AppError && err.code === 'INVALID_PIN') {
        throw err;
      }
      if (err instanceof AppError && err.code === 'PIN_NOT_CONFIGURED') {
        throw new AppError('Code PIN incorrect.', 401, 'INVALID_PIN');
      }
      throw err;
    }

    assertStaffRedeemable(prize);

    logger.info(
      { prizeId: prize.id.toString(), ip: clientIp ?? null },
      'Prize lookup by short code',
    );

    return shapeStatusResponse(prize, true);
  },

  async redeem(
    redeemCode: string,
    sig: string,
    staffPin: string,
    redeemedVia: 'qr' | 'code',
    clientIp?: string | null,
  ) {
    assertValidSignature(redeemCode, sig, clientIp);

    const prize = await loadPrizeByRedeemCode(redeemCode);
    if (!prize) throw new AppError('Prize not found', 404, 'PRIZE_NOT_FOUND');

    const cinemaId = prize.session.screen.cinema.id;
    await verifyStaffPinForCinema(cinemaId, staffPin);
    assertStaffRedeemable(prize);

    if (prize.redeemedAt) {
      throw new AppError('Ce lot a déjà été utilisé.', 409, 'ALREADY_REDEEMED', true, {
        redeemedAt: prize.redeemedAt.toISOString(),
      });
    }

    const status = computePrizeStatus(prize);
    if (status === 'expired') {
      throw new AppError('Ce lot a expiré.', 410, 'PRIZE_EXPIRED', true, {
        expiresAt: prize.expiresAt?.toISOString() ?? null,
      });
    }

    const updated = await prisma.prize.update({
      where: { id: prize.id },
      data: { redeemedAt: new Date(), redeemedVia },
    });

    logger.info(
      { redeemCode, redeemedAt: updated.redeemedAt?.toISOString(), redeemedVia },
      'Prize redeemed',
    );

    logEvent({
      level: 'info',
      eventType: 'prize.redeemed',
      sessionId: prize.sessionId,
      cinemaId,
      payload: { prizeId: prize.id.toString(), redeemedVia },
    });

    return {
      prizeId: prize.id.toString(),
      label: prize.label,
      redeemedAt: updated.redeemedAt!.toISOString(),
    };
  },
};
