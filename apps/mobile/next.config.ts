import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@quiz-app/ui', '@quiz-app/socket-client', '@quiz-app/validation'],
};

export default nextConfig;
