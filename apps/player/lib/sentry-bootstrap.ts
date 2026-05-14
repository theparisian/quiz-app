import * as Sentry from '@sentry/nextjs';
import { scrubPii } from '@quiz-app/observability';

export function bootstrapSentry(dsnEnvValue: string | undefined): void {
  if (!dsnEnvValue) return;

  Sentry.init({
    dsn: dsnEnvValue,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubPii(event);
    },
  });
}
