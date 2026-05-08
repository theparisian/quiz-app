import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { logger } from './shared/logger/index.js';
import { setupSocketGateway } from './shared/sockets/gateway.js';
import { healthRouter } from './routes/health.js';

const app = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') ?? '*' }));
app.use(express.json());

app.use('/health', healthRouter);

const io = setupSocketGateway(httpServer);

app.set('io', io);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});

export { app, httpServer };
