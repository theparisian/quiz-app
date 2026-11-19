import { Router } from 'express';
import { catalogDetailQuerySchema, catalogQuerySchema } from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { param } from '../../shared/utils/index.js';
import { validate } from '../../shared/validation/index.js';
import { catalogService } from './catalog.service.js';

/** /api/catalog (C1) : catalogue des jeux disponibles pour un cinéma, en lecture. */
const router = Router();

const CATALOG_ROLES = ['super_admin', 'cinema_admin', 'projectionist'] as const;

router.get('/', requireAuth([...CATALOG_ROLES]), async (req, res, next) => {
  try {
    const query = validate(catalogQuerySchema, req.query);
    res.json({ items: await catalogService.list(req.user!, query) });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', requireAuth([...CATALOG_ROLES]), async (req, res, next) => {
  try {
    const { cinemaSlug } = validate(catalogDetailQuerySchema, req.query);
    res.json(await catalogService.detail(req.user!, param(req, 'slug'), cinemaSlug));
  } catch (error) {
    next(error);
  }
});

export { router as catalogRouter };
