import * as Sentry from '@sentry/nextjs';
import { bootstrapSentry } from './lib/sentry-bootstrap';

export const onRequestError = Sentry.captureRequestError;

export async function register(): Promise<void> {
  bootstrapSentry(process.env.NEXT_PUBLIC_SENTRY_DSN_MOBILE);
}
