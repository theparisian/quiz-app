import * as Sentry from '@sentry/node';
import { scrubPii } from '@quiz-app/observability';
import { logger } from '../logger/index.js';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_API;
  if (!dsn) {
    logger.info('Sentry DSN not configured, skipping Sentry init');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      return scrubPii(event);
    },
  });
}

/** Pour tests / shutdown explicites. */
export async function flushSentry(timeoutMs: number): Promise<void> {
  const dsn = process.env.SENTRY_DSN_API;
  if (!dsn) return;
  await Sentry.close(timeoutMs);
}
