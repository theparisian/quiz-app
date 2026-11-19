import { Router } from 'express';
import {
  createGameBodySchema,
  listGamesQuerySchema,
  updateGameBodySchema,
} from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';
import { getStorage } from '../../shared/storage/index.js';
import { createUploadMiddleware, uploadFile } from '../../shared/upload/index.js';
import { param } from '../../shared/utils/index.js';
import { validate } from '../../shared/validation/index.js';
import { gamesService, type GameWithAdminInclude } from './games.service.js';

/**
 * /api/games, super_admin seulement. B6 : création, modification et publication des jeux hors
 * quiz (sondage) ; les jeux quiz restent pilotés par l'éditeur de quiz. C1 : gestion du
 * catalogue (filtres, champs catalogue, présence, audience, couverture) sur les mêmes routes
 * (convention 6 : une seule route de modification).
 */
const router = Router();

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const gameCoverUpload = createUploadMiddleware({
  kind: 'game-cover',
  maxSize: 2 * 1024 * 1024,
  allowedMimes: IMAGE_TYPES,
});

function readTags(json: unknown): string[] {
  return Array.isArray(json) ? json.filter((t): t is string => typeof t === 'string') : [];
}

function shapeGame(game: GameWithAdminInclude) {
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
    coverImageUrl: game.coverImageUrl,
    tagline: game.tagline,
    rulesText: game.rulesText,
    catalogEnabled: game.catalogEnabled,
    audience: game.audience,
    minPlayers: game.minPlayers,
    tags: readTags(game.tags),
    sponsorId: game.sponsorId?.toString() ?? null,
    sponsor: game.sponsor
      ? { id: game.sponsor.id.toString(), name: game.sponsor.name, logoUrl: game.sponsor.logoUrl }
      : null,
    cinemas: game.cinemaAccess.map(({ cinema }) => ({
      id: cinema.id.toString(),
      slug: cinema.slug,
      name: cinema.name,
    })),
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

async function respondWithGame(slug: string) {
  return shapeGame(await gamesService.getGameAdminDetail(slug));
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
    res.status(201).json(await respondWithGame(game.slug));
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    res.json(await respondWithGame(param(req, 'slug')));
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(updateGameBodySchema, req.body);
    const game = await gamesService.updateGame(param(req, 'slug'), body);
    res.json(await respondWithGame(game.slug));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/publish', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const game = await gamesService.publishGame(param(req, 'slug'));
    res.json(await respondWithGame(game.slug));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/enable', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const game = await gamesService.setCatalogEnabled(param(req, 'slug'), true);
    res.json(await respondWithGame(game.slug));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/disable', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const game = await gamesService.setCatalogEnabled(param(req, 'slug'), false);
    res.json(await respondWithGame(game.slug));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:slug/cover',
  requireAuth(['super_admin']),
  gameCoverUpload,
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      // Refus (jeu quiz, jeu absent) avant d'écrire le fichier.
      await gamesService.getCoverEditableGame(slug);
      if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');
      const result = await uploadFile({
        kind: 'game-cover',
        id: slug,
        file: {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        },
        storage: getStorage(),
      });
      logger.info(
        { kind: 'game-cover', id: slug, size: req.file.size, mime: req.file.mimetype },
        'File uploaded',
      );
      await gamesService.setCoverImage(slug, result.url);
      res.json(await respondWithGame(slug));
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/:slug/cover', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    await gamesService.removeCoverImage(slug, getStorage());
    res.json(await respondWithGame(slug));
  } catch (error) {
    next(error);
  }
});

export { router as gamesRouter };
