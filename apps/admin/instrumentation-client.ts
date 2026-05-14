import * as Sentry from '@sentry/nextjs';
import { bootstrapSentry } from './lib/sentry-bootstrap';

bootstrapSentry(process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
