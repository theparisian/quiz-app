import { Router } from 'express';
import type { Game } from '@prisma/client';
import {
  createGameBodySchema,
  listGamesQuerySchema,
  updateGameBodySchema,
} from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { param } from '../../shared/utils/index.js';
import { gamesService } from './games.service.js';

/**
 * /api/games, super_admin seulement. B6 : création, modification et publication des jeux hors
 * quiz (sondage) ; les jeux quiz restent pilotés par l'éditeur de quiz. C1 étend ces routes
 * (catalogue) sans en créer de seconde pour la modification (convention 6).
 */
const router = Router();

/**
 * Comme `validate`, pour les schémas de `@quiz-app/validation` : leur `ZodError` vient d'une autre
 * copie du module zod (build CJS du paquet), que `instanceof` dans `validate` ne reconnaît pas.
 */
function parse<T>(
  schema: {
    safeParse(
      data: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { errors: { path: (string | number)[]; message: string }[] } };
  },
  data: unknown,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
  throw new AppError(`Validation failed: ${message}`, 400, 'VALIDATION_ERROR');
}

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
    const query = parse(listGamesQuerySchema, req.query);
    const { items, total } = await gamesService.listGames(query);
    res.json({ items: items.map(shapeGame), total, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = parse(createGameBodySchema, req.body);
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
    const body = parse(updateGameBodySchema, req.body);
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
