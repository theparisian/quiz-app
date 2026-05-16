import { Router, type Router as RouterType } from 'express';
import { readFileSync } from 'fs';
import os from 'node:os';
import { resolve } from 'path';
import type { HealthCheckResponse } from '@quiz-app/types';
import { prisma } from '../shared/db/index.js';

const router: RouterType = Router();

let version = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
  version = pkg.version as string;
} catch {
  // fallback default
}

async function diskStatsMb(): Promise<{ freeMb: number; totalMb: number } | null> {
  try {
    const fsPm = await import('node:fs/promises');
    const sf = fsPm.statfs as ((path: string) => Promise<unknown>) | undefined;
    if (typeof sf !== 'function') return null;
    const s = (await sf(process.cwd())) as {
      blocks: bigint;
      bavail: bigint;
      bsize: bigint;
    };
    const bs = Number(s.bsize);
    const total = Number(s.blocks) * bs;
    const free = Number(s.bavail) * bs;
    if (!Number.isFinite(total) || total <= 0) return null;
    return { totalMb: total / (1024 * 1024), freeMb: free / (1024 * 1024) };
  } catch {
    return null;
  }
}

router.get('/', (_req, res) => {
  const response: HealthCheckResponse = {
    status: 'ok',
  };
  res.json(response);
});

router.get('/detailed', async (_req, res) => {
  const expected = process.env.HEALTH_CHECK_TOKEN;
  const given =
    typeof _req.header('x-health-token') === 'string' ? _req.header('x-health-token') : '';

  if (!expected || !given || given !== expected.trim()) {
    res.json({ status: 'ok' } satisfies Pick<HealthCheckResponse, 'status'>);
    return;
  }

  const timestamp = new Date().toISOString();

  const dbStarted = Date.now();
  let database: { status: 'ok' | 'down'; latencyMs: number } = { status: 'down', latencyMs: 0 };
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    database = { status: 'ok', latencyMs: Date.now() - dbStarted };
  } catch {
    database = { status: 'down', latencyMs: Date.now() - dbStarted };
  }

  let diskBlock: {
    status: 'ok' | 'warn';
    freeMb: number;
    totalMb: number;
  } = { status: 'ok', freeMb: 0, totalMb: 0 };
  const ds = await diskStatsMb();
  if (ds !== null && ds.totalMb > 0) {
    const ratioFree = ds.freeMb / ds.totalMb;
    diskBlock = {
      status: ratioFree < 0.1 ? 'warn' : 'ok',
      freeMb: Math.round(ds.freeMb),
      totalMb: Math.round(ds.totalMb),
    };
  }

  const totalMb = os.totalmem() / (1024 * 1024);
  const freeMb = os.freemem() / (1024 * 1024);
  const usedMb = Math.max(0, totalMb - freeMb);
  const memPressure = totalMb > 0 ? usedMb / totalMb : 0;

  const memory = {
    status: (memPressure > 0.9 ? 'warn' : 'ok') as 'ok' | 'warn',
    usedMb: Math.round(usedMb),
    totalMb: Math.round(totalMb),
    processRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  };

  const [sessionsActive, nucsOnline, nucsOffline] = await Promise.all([
    prisma.session.count({ where: { state: { in: ['lobby', 'running', 'paused'] } } }),
    prisma.nuc.count({ where: { status: 'online' } }),
    prisma.nuc.count({ where: { status: 'offline' } }),
  ]);

  let globalStatus: 'ok' | 'degraded' | 'down';
  if (database.status === 'down') globalStatus = 'down';
  else if (diskBlock.status === 'warn' || memory.status === 'warn') globalStatus = 'degraded';
  else globalStatus = 'ok';

  res.json({
    status: globalStatus,
    timestamp,
    version,
    uptime: Math.floor(process.uptime()),
    checks: {
      database,
      disk: diskBlock,
      memory,
      sessionsActive,
      nucsOnline,
      nucsOffline,
    },
  });
});

export { router as healthRouter };
