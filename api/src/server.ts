import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as dotenvLoad } from 'dotenv';

// Root .env first (deploy VPS), then api/.env for overrides locaux sans écraser la prod.
const repoRootDotenv = resolve(process.cwd(), '..', '.env');
if (existsSync(repoRootDotenv)) {
  dotenvLoad({ path: repoRootDotenv });
}
dotenvLoad();

import { createServer } from 'http';
import { logger } from './shared/logger/index.js';
import { initSentry, flushSentry } from './shared/sentry/sentry.js';
import { setupSocketGateway } from './shared/sockets/gateway.js';
import { validateAiEnvironment } from './shared/ai/index.js';
import { validatePrizeEnvironment } from './modules/prizes/prize-env.js';
import { buildApp } from './create-app.js';
import {
  rehydrateRunningSessions,
  setIoInstance,
} from './modules/sessions/session-orchestrator.service.js';
import { rehydrateLobbyTimers, setLobbyTimerIo } from './modules/sessions/lobby-timer.service.js';
import { requeuePendingPrizeEmailsOnBoot } from './shared/email/prize-email-queue.service.js';
import { startNucOfflineMonitor } from './shared/nuc-monitor/index.js';

initSentry();

validateAiEnvironment();
validatePrizeEnvironment();

logger.info(
  {
    aiProvider: process.env.AI_PROVIDER ?? 'anthropic',
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY?.trim(),
  },
  'AI environment loaded',
);

const app = buildApp();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const io = setupSocketGateway(httpServer);
app.set('io', io);

setIoInstance(io);
setLobbyTimerIo(io);

let nucMonitorStop: (() => void) | undefined;

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown');
  nucMonitorStop?.();
  nucMonitorStop = undefined;
  await flushSentry(2000);
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
}

process.once('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.once('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

void (async () => {
  await rehydrateRunningSessions();
  await rehydrateLobbyTimers();
  await requeuePendingPrizeEmailsOnBoot();
  nucMonitorStop = startNucOfflineMonitor(io);

  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
  });
})();

export { app, httpServer };
