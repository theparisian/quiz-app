import express, { type Express } from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './shared/errors/index.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { invitationsRouter } from './modules/invitations/invitations.routes.js';
import { cinemasRouter } from './modules/cinemas/cinemas.routes.js';
import { screensRouter } from './modules/screens/screens.routes.js';
import { nucsRouter } from './modules/nucs/nucs.routes.js';
import { sponsorsRouter } from './modules/sponsors/sponsors.routes.js';
import { quizzesRouter } from './modules/quizzes/quizzes.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { sessionsRouter, sessionsNestedRouter } from './modules/sessions/sessions.routes.js';
import { playersRouter, playersPublicRouter } from './modules/players/players.routes.js';

import { prizesPublicRouter } from './modules/prizes/prizes.routes.js';
import { unsubscribeRouter } from './routes/unsubscribe.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';

export function buildApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  const uploadsDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH ?? './uploads');
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );

  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/invitations', invitationsRouter);
  app.use('/api/cinemas', cinemasRouter);
  app.use('/api', screensRouter);
  app.use('/api', nucsRouter);
  app.use('/api/sponsors', sponsorsRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api', sessionsNestedRouter);
  app.use('/api/players', playersRouter);
  app.use('/api', playersPublicRouter);
  app.use('/api/prizes', prizesPublicRouter);
  app.use('/', unsubscribeRouter);

  app.use(errorHandler);
  return app;
}
