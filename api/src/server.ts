import 'dotenv/config';
import { createServer } from 'http';
import { logger } from './shared/logger/index.js';
import { setupSocketGateway } from './shared/sockets/gateway.js';
import { validateAiEnvironment } from './shared/ai/index.js';
import { buildApp } from './create-app.js';
import {
  rehydrateRunningSessions,
  setIoInstance,
} from './modules/sessions/session-orchestrator.service.js';
import { startNucOfflineMonitor } from './shared/nuc-monitor/index.js';

validateAiEnvironment();

const app = buildApp();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const io = setupSocketGateway(httpServer);
app.set('io', io);

setIoInstance(io);
startNucOfflineMonitor(io);

void (async () => {
  await rehydrateRunningSessions();
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
  });
})();

export { app, httpServer };
