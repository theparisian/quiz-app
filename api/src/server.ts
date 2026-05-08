import 'dotenv/config';
import express, { type Express } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { logger } from './shared/logger/index.js';
import { errorHandler } from './shared/errors/index.js';
import { setupSocketGateway } from './shared/sockets/gateway.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { invitationsRouter } from './modules/invitations/invitations.routes.js';
import { cinemasRouter } from './modules/cinemas/cinemas.routes.js';
import { screensRouter } from './modules/screens/screens.routes.js';
import { nucsRouter } from './modules/nucs/nucs.routes.js';

const app: Express = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(
  cors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/cinemas', cinemasRouter);
app.use('/api', screensRouter);
app.use('/api', nucsRouter);

// Error handler (must be last)
app.use(errorHandler);

const io = setupSocketGateway(httpServer);
app.set('io', io);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});

export { app, httpServer };
