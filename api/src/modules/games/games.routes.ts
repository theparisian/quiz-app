import { Router } from 'express';
import type { Game } from '@prisma/client';
import {
  createGameBodySchema,
  listGamesQuerySchema,
  updateGameBodySchema,
} from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { param } from '../../shared/utils/index.js';
import { validate } from '../../shared/validation/index.js';
import { gamesService } from './games.service.js';

/**
 * /api/games, super_admin seulement. B6 : création, modification et publication des jeux hors
 * quiz (sondage) ; les jeux quiz restent pilotés par l'éditeur de quiz. C1 étend ces routes
 * (catalogue) sans en créer de seconde pour la modification (convention 6).
 */
const router = Router();

function shapeGame(game: Game) {
  return {
    id: game.id.toString(),
    slug: game.slug,
    title: game.title,
    description: game.description,
    engineKey: game.engineKey,
    kind: game.kind,
    status: game.status,
    configJson: game.configJson ?? null,
    quizId: game.quizId?.toString() ?? null,
    durationEstimateSeconds: game.durationEstimateSeconds,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

router.get('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listGamesQuerySchema, req.query);
    const { items, total } = await gamesService.listGames(query);
    res.json({ items: items.map(shapeGame), total, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(createGameBodySchema, req.body);
    const game = await gamesService.createGame(body);
    res.status(201).json(shapeGame(game));
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    res.json(shapeGame(await gamesService.getGameBySlug(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(updateGameBodySchema, req.body);
    res.json(shapeGame(await gamesService.updateGame(param(req, 'slug'), body)));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/publish', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    res.json(shapeGame(await gamesService.publishGame(param(req, 'slug'))));
  } catch (error) {
    next(error);
  }
});

export { router as gamesRouter };
