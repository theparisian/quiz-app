import { prisma } from '../db/index.js';
import { logger } from '../logger/index.js';
import type { LogEventInput } from './event-log.types.js';
import { sendCriticalAlert } from './critical-alert.service.js';

async function persistAndMaybeAlert(input: LogEventInput): Promise<void> {
  await prisma.eventLog.create({
    data: {
      level: input.level,
      eventType: input.eventType,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.nucId !== undefined ? { nucId: input.nucId } : {}),
      ...(input.cinemaId !== undefined ? { cinemaId: input.cinemaId } : {}),
      ...(input.payload !== undefined ? { payloadJson: input.payload } : {}),
    },
  });

  if (input.level === 'critical') {
    await sendCriticalAlert(input).catch((err) =>
      logger.error({ err, eventType: input.eventType }, 'Failed to send critical alert email'),
    );
  }
}

/**
 * Fire-and-forget. Ne JAMAIS await dans le code business.
 * Si l'insert échoue → log Pino + continue. events_log défaillant
 * ne doit jamais casser une feature.
 * Si level === 'critical' → déclenche aussi une alerte email (throttlée).
 */
export function logEvent(input: LogEventInput): void {
  void persistAndMaybeAlert(input).catch((err) => {
    logger.error({ err, eventType: input.eventType }, 'Failed to persist event log');
    if (input.level === 'critical') {
      void sendCriticalAlert(input).catch((alertErr) => {
        logger.error(
          { err: alertErr, eventType: input.eventType },
          'Critical alert fallback after DB failure also failed',
        );
      });
    }
  });
}

export type { LogEventInput };
