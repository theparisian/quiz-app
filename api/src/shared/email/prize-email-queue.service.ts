import QRCode from 'qrcode';
import { prisma } from '../db/index.js';
import { sendEmail } from './index.js';
import { logEvent } from '../events/event-log.service.js';
import { logger } from '../logger/index.js';
import { buildPrizeEmail } from './templates/prize-email.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getEmailSendRateMs(): number {
  const raw = parseInt(process.env.EMAIL_SEND_RATE_MS ?? '1000', 10);
  return Number.isFinite(raw) && raw >= 100 ? raw : 1000;
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

async function sendWithRetry(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<'ok' | 'retry_ok'> {
  try {
    await sendEmail(opts);
    return 'ok';
  } catch (firstErr) {
    logger.warn({ err: firstErr }, 'Email send failed, retrying once');
    await sleep(2000);
    await sendEmail(opts);
    return 'retry_ok';
  }
}

async function loadPrizeEmailContext(prizeId: bigint) {
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
  if (!prize) return null;
  if (!prize.player.emailForPrize) return null;
  return prize;
}

async function sendPrizeEmailJob(prizeId: bigint): Promise<void> {
  const prize = await loadPrizeEmailContext(prizeId);
  if (!prize) return;
  if (prize.emailSentAt) return;

  const requestEmail = prize.player.emailForPrize!;
  const sigEnc = encodeURIComponent(prize.signature);
  const redeemUrl = `${redeemBaseUrl()}/${encodeURIComponent(prize.redeemCode)}?sig=${sigEnc}`;
  const unsubscribeUrl = `${unsubscribeBaseUrl()}?code=${encodeURIComponent(prize.redeemCode)}&sig=${sigEnc}`;
  const qrCodeDataUrl = await QRCode.toDataURL(redeemUrl, { width: 400, margin: 2 });
  const { subject, html, text } = buildPrizeEmail({
    pseudo: prize.player.pseudo,
    rank: prize.player.rankFinal ?? prize.rank,
    quizTitle: prize.session.quiz.title,
    cinemaName: prize.session.screen.cinema.name,
    cinemaLogoUrl: prize.session.screen.cinema.logoUrl,
    prizeLabel: prize.label,
    redeemUrl,
    redeemCode: prize.redeemCode,
    shortCode: prize.shortCode,
    unsubscribeUrl,
    qrCodeDataUrl,
  });

  try {
    const outcome = await sendWithRetry({ to: requestEmail, subject, html, text });
    await prisma.prize.update({
      where: { id: prizeId },
      data: { emailSentAt: new Date() },
    });

    const cinemaId = prize.session.screen.cinema.id;
    logEvent({
      level: 'info',
      eventType: 'prize.email_sent',
      sessionId: prize.sessionId,
      cinemaId,
      payload: {
        prizeId: prizeId.toString(),
        rank: prize.rank,
        isConsolation: prize.isConsolation,
      },
    });
    if (outcome === 'retry_ok') {
      logEvent({
        level: 'warn',
        eventType: 'prize.email_send_retry',
        sessionId: prize.sessionId,
        cinemaId,
        payload: { prizeId: prizeId.toString() },
      });
    }
  } catch (err) {
    logger.error({ err, prizeId: prizeId.toString() }, 'Prize email failed after retry');
    logEvent({
      level: 'error',
      eventType: 'prize.email_send_failed',
      sessionId: prize.sessionId,
      cinemaId: prize.session.screen.cinema.id,
      payload: {
        prizeId: prizeId.toString(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

const queuedIds = new Set<string>();
let chain: Promise<void> = Promise.resolve();

export function enqueuePrizeEmail(prizeId: bigint): void {
  const id = prizeId.toString();
  if (queuedIds.has(id)) return;
  queuedIds.add(id);

  chain = chain
    .then(async () => {
      await sendPrizeEmailJob(prizeId);
    })
    .catch((err) => {
      logger.error({ err, prizeId: id }, 'Prize email queue job failed');
    })
    .finally(() => {
      queuedIds.delete(id);
      return sleep(getEmailSendRateMs());
    });
}

export async function flushPrizeEmailQueueForTests(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') return;
  await chain;
}

export function resetPrizeEmailQueueForTests(): void {
  if (process.env.NODE_ENV !== 'test') return;
  chain = Promise.resolve();
  queuedIds.clear();
}

export async function requeuePendingPrizeEmailsOnBoot(): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pending = await prisma.prize.findMany({
    where: {
      emailSentAt: null,
      player: { emailForPrize: { not: null } },
      session: { createdAt: { gte: since } },
    },
    select: {
      id: true,
      sessionId: true,
      session: { select: { screen: { select: { cinemaId: true } } } },
    },
  });

  for (const row of pending) {
    enqueuePrizeEmail(row.id);
    logEvent({
      level: 'info',
      eventType: 'prize_email_requeued',
      sessionId: row.sessionId,
      cinemaId: row.session.screen.cinemaId,
      payload: { prizeId: row.id.toString() },
    });
  }

  if (pending.length > 0) {
    logger.info({ count: pending.length }, 'Requeued pending prize emails on boot');
  }
}

export async function sendPrizeEmailNow(prizeId: bigint): Promise<'ok' | 'retry_ok'> {
  const prize = await loadPrizeEmailContext(prizeId);
  if (!prize || !prize.player.emailForPrize) {
    throw new Error('PRIZE_EMAIL_CONTEXT_MISSING');
  }

  const requestEmail = prize.player.emailForPrize;
  const sigEnc = encodeURIComponent(prize.signature);
  const redeemUrl = `${redeemBaseUrl()}/${encodeURIComponent(prize.redeemCode)}?sig=${sigEnc}`;
  const unsubscribeUrl = `${unsubscribeBaseUrl()}?code=${encodeURIComponent(prize.redeemCode)}&sig=${sigEnc}`;
  const qrCodeDataUrl = await QRCode.toDataURL(redeemUrl, { width: 400, margin: 2 });
  const { subject, html, text } = buildPrizeEmail({
    pseudo: prize.player.pseudo,
    rank: prize.player.rankFinal ?? prize.rank,
    quizTitle: prize.session.quiz.title,
    cinemaName: prize.session.screen.cinema.name,
    cinemaLogoUrl: prize.session.screen.cinema.logoUrl,
    prizeLabel: prize.label,
    redeemUrl,
    redeemCode: prize.redeemCode,
    shortCode: prize.shortCode,
    unsubscribeUrl,
    qrCodeDataUrl,
  });

  return sendWithRetry({ to: requestEmail, subject, html, text });
}
