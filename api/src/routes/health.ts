import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { HealthCheckResponse } from '@quiz-app/types';

const router = Router();

let version = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf-8'));
  version = pkg.version as string;
} catch {
  // fallback to default version
}

const startTime = Date.now();

router.get('/', (_req, res) => {
  const response: HealthCheckResponse = {
    status: 'ok',
    version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
  res.json(response);
});

export { router as healthRouter };
