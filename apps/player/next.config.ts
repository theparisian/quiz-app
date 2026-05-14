import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@quiz-app/ui',
    '@quiz-app/socket-client',
    '@quiz-app/validation',
    '@quiz-app/observability',
  ],
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
