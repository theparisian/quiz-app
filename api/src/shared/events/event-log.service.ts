import type { Prisma } from '@prisma/client';
import { prisma } from '../db/index.js';
import { logger } from '../logger/index.js';
import type { LogEventInput } from './event-log.types.js';
import { sendCriticalAlert } from './critical-alert.service.js';

async function persistAndMaybeAlert(input: LogEventInput): Promise<void> {
  const data: Prisma.EventLogUncheckedCreateInput = {
    level: input.level,
    eventType: input.eventType,
    sessionId: input.sessionId ?? null,
    nucId: input.nucId ?? null,
    cinemaId: input.cinemaId ?? null,
  };
  if (input.payload !== undefined) {
    data.payloadJson = input.payload as Prisma.InputJsonValue;
  }

  await prisma.eventLog.create({
    data,
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
