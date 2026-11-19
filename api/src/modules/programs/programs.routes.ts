import { Router } from 'express';
import type { Server } from 'socket.io';
import { screenProgramBodySchema } from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { param } from '../../shared/utils/index.js';
import { validate } from '../../shared/validation/index.js';
import { notifyScreenSessionStarted } from '../sessions/screen-session-started.js';
import { shapeSessionDetail } from '../sessions/sessions.routes.js';
import { programsService } from './programs.service.js';

/** Programmation des salles (C2), montée sous /api. Contrôle de cinéma : tenant-scope. */
const router = Router();

const READ_ROLES = ['super_admin', 'cinema_admin', 'projectionist'] as const;
const WRITE_ROLES = ['super_admin', 'cinema_admin'] as const;

router.get('/cinemas/:slug/programs', requireAuth([...READ_ROLES]), async (req, res, next) => {
  try {
    res.json({ items: await programsService.listForCinema(req.user!, param(req, 'slug')) });
  } catch (error) {
    next(error);
  }
});

router.put('/screens/:id/program', requireAuth([...WRITE_ROLES]), async (req, res, next) => {
  try {
    const body = validate(screenProgramBodySchema, req.body);
    res.json(await programsService.replace(req.user!, BigInt(param(req, 'id')), body));
  } catch (error) {
    next(error);
  }
});

/** Lancer le programme : mêmes rôles que POST /api/sessions (le projectionniste lance). */
router.post('/screens/:id/program/launch', requireAuth([...READ_ROLES]), async (req, res, next) => {
  try {
    const session = await programsService.launch(req.user!, BigInt(param(req, 'id')));
    await notifyScreenSessionStarted(req.app.get('io') as Server | undefined, {
      id: session.id,
      slugShort: session.slugShort,
      joinToken: session.joinToken,
      screenId: session.screen.id,
    });
    res.status(201).json(shapeSessionDetail(session));
  } catch (error) {
    next(error);
  }
});

export { router as programsRouter };
