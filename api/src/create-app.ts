import express, { type Express } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler } from './shared/errors/index.js';
import { resolveCorsOrigins } from './shared/cors-origins.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { invitationsRouter } from './modules/invitations/invitations.routes.js';
import { cinemasRouter } from './modules/cinemas/cinemas.routes.js';
import { screensRouter } from './modules/screens/screens.routes.js';
import { nucsRouter } from './modules/nucs/nucs.routes.js';
import { sponsorsRouter } from './modules/sponsors/sponsors.routes.js';
import { avatarsRouter } from './modules/avatars/avatars.routes.js';
import { audioRouter } from './modules/audio/audio.routes.js';
import { quizzesRouter } from './modules/quizzes/quizzes.routes.js';
import { gamesRouter } from './modules/games/games.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { programsRouter } from './modules/programs/programs.routes.js';
import { campaignsRouter, statementsRouter } from './modules/campaigns/campaigns.routes.js';
import { sponsorPortalRouter } from './modules/sponsor-portal/sponsor-portal.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { sessionsRouter, sessionsNestedRouter } from './modules/sessions/sessions.routes.js';
import { playersRouter, playersPublicRouter } from './modules/players/players.routes.js';

import { prizesPublicRouter } from './modules/prizes/prizes.routes.js';
import { prizesAdminRouter } from './modules/prizes/prizes-admin.routes.js';
import { prizeTemplatesRouter } from './modules/prizes/prize-templates.routes.js';
import { unsubscribeRouter } from './routes/unsubscribe.js';
import { contactsRouter } from './modules/contacts/contacts.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';

export function buildApp(): Express {
  const app = express();
  const corsOrigins = resolveCorsOrigins();

  // Derrière le reverse proxy : req.ip = IP client (x-forwarded-for, un saut).
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  // Import de codes de lots (C5) : jusqu'à 10 000 codes par envoi, au-delà des 100 ko par défaut.
  // Le parseur global ignore ensuite un corps déjà lu.
  app.use(/^\/api\/prize-templates\/[^/]+\/codes\/import$/, express.json({ limit: '2mb' }));
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
  app.use('/api/avatar-libraries', avatarsRouter);
  app.use('/api/sound-libraries', audioRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api', programsRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/sponsor-portal', sponsorPortalRouter);
  app.use('/api', statementsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api', sessionsNestedRouter);
  app.use('/api/players', playersRouter);
  app.use('/api', playersPublicRouter);
  app.use('/api/prizes', prizesPublicRouter);
  app.use('/api/prizes', prizesAdminRouter);
  app.use('/api/prize-templates', prizeTemplatesRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/', unsubscribeRouter);

  app.use(errorHandler);
  return app;
}
