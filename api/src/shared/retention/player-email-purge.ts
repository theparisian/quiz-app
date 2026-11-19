import { PRIZE_EMAIL_RETENTION_DAYS } from '@quiz-app/validation';
import { prisma } from '../db/index.js';
import { logEvent } from '../events/event-log.service.js';
import { logger } from '../logger/index.js';
import { contactsService } from '../../modules/contacts/contacts.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const PLAYER_EMAIL_PURGE_INTERVAL_MS = DAY_MS;
/** Premier passage peu après le démarrage (laisse finir la réhydratation des séances). */
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;

/**
 * Email de lot (`players.email_for_prize`) : effacé PRIZE_EMAIL_RETENTION_DAYS jours après la fin
 * de la séance (ou sa création si elle n'a jamais été terminée), sauf si l'adresse a un
 * consentement actif (non révoqué, contact non désinscrit et actif depuis moins de 3 ans).
 * Renvoie le nombre de joueurs dont l'email a été effacé.
 */
export async function purgeExpiredPlayerEmails(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PRIZE_EMAIL_RETENTION_DAYS * DAY_MS);
  let purged = 0;
  let afterId = 0n;

  for (;;) {
    const batch = await prisma.player.findMany({
      where: {
        id: { gt: afterId },
        emailForPrize: { not: null },
        session: {
          OR: [{ endedAt: { lt: cutoff } }, { endedAt: null, createdAt: { lt: cutoff } }],
        },
      },
      select: { id: true, emailForPrize: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1]!.id;

    const emails = [...new Set(batch.map((p) => p.emailForPrize!.trim().toLowerCase()))];
    const kept = await prisma.contact.findMany({
      where: {
        email: { in: emails },
        ...contactsService.activeContactWhere(now),
        consents: { some: { revokedAt: null } },
      },
      select: { email: true },
    });
    const keptEmails = new Set(kept.map((c) => c.email));
    const ids = batch
      .filter((p) => !keptEmails.has(p.emailForPrize!.trim().toLowerCase()))
      .map((p) => p.id);
    if (ids.length > 0) {
      const res = await prisma.player.updateMany({
        where: { id: { in: ids } },
        data: { emailForPrize: null, emailConsentAt: null },
      });
      purged += res.count;
    }
    if (batch.length < BATCH_SIZE) break;
  }

  if (purged > 0) {
    logEvent({
      level: 'info',
      eventType: 'players.prize_emails_purged',
      payload: { count: purged, retentionDays: PRIZE_EMAIL_RETENTION_DAYS },
    });
  }
  logger.info({ purged }, 'Expired player prize emails purged');
  return purged;
}

/** Tâche quotidienne en processus (timers `unref` : n'empêche pas l'arrêt du serveur). */
export function startPlayerEmailPurgeJob(): () => void {
  const run = () => {
    void purgeExpiredPlayerEmails().catch((err) => {
      logger.error({ err }, 'Player email purge failed');
    });
  };
  const first = setTimeout(run, FIRST_RUN_DELAY_MS);
  first.unref();
  const handle = setInterval(run, PLAYER_EMAIL_PURGE_INTERVAL_MS);
  handle.unref();
  return () => {
    clearTimeout(first);
    clearInterval(handle);
  };
}
