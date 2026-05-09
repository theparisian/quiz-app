import type { Server } from 'socket.io';
import { prisma } from '../db/index.js';
import { logger } from '../logger/index.js';
import { broadcastNucStatusChanged } from './broadcast-nuc-status.js';

export const NUC_OFFLINE_CHECK_INTERVAL_MS = 30_000;
export const NUC_OFFLINE_THRESHOLD_MS = 90_000;

/** Exposé pour les tests d’intégration (même logique que le setInterval). */
export async function scanStaleOnlineNucsAndMarkOffline(io: Server): Promise<number> {
  const threshold = new Date(Date.now() - NUC_OFFLINE_THRESHOLD_MS);
  const stale = await prisma.nuc.findMany({
    where: {
      status: 'online',
      OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: threshold } }],
    },
    select: { id: true, screenId: true },
  });

  for (const n of stale) {
    await prisma.nuc.update({
      where: { id: n.id },
      data: { status: 'offline' },
    });
    broadcastNucStatusChanged(io, {
      nucId: n.id.toString(),
      screenId: n.screenId.toString(),
      status: 'offline',
      reason: 'heartbeat_timeout',
    });
    logger.warn({ nucId: n.id.toString() }, 'NUC marked offline (heartbeat stale)');
  }

  return stale.length;
}

export function startNucOfflineMonitor(io: Server): () => void {
  const handle = setInterval(() => {
    void scanStaleOnlineNucsAndMarkOffline(io).catch((err) => {
      logger.error({ err }, 'NUC offline monitor tick failed');
    });
  }, NUC_OFFLINE_CHECK_INTERVAL_MS);
  return () => clearInterval(handle);
}
