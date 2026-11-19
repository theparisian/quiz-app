import { Router } from 'express';
import {
  createCampaignBodySchema,
  listCampaignsQuerySchema,
  listDeliveriesQuerySchema,
  statementQuerySchema,
  updateCampaignBodySchema,
} from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { param } from '../../shared/utils/index.js';
import { validate } from '../../shared/validation/index.js';
import { campaignsService } from './campaigns.service.js';
import { statementsService } from './statements.service.js';

/** /api/campaigns (C3, super_admin) : campagnes des sponsors et journal des diffusions. */
const router = Router();

function campaignId(raw: string): bigint {
  if (!/^\d{1,20}$/.test(raw)) throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
  return BigInt(raw);
}

router.get('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listCampaignsQuerySchema, req.query);
    res.json(await campaignsService.list(query));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(createCampaignBodySchema, req.body);
    res.status(201).json(await campaignsService.create(body));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    res.json(await campaignsService.get(campaignId(param(req, 'id'))));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(updateCampaignBodySchema, req.body);
    res.json(await campaignsService.update(campaignId(param(req, 'id')), body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await campaignsService.remove(campaignId(param(req, 'id')));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

for (const action of ['activate', 'pause', 'end'] as const) {
  router.post(`/:id/${action}`, requireAuth(['super_admin']), async (req, res, next) => {
    try {
      res.json(await campaignsService.transition(campaignId(param(req, 'id')), action));
    } catch (error) {
      next(error);
    }
  });
}

router.get('/:id/deliveries', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listDeliveriesQuerySchema, req.query);
    res.json(await campaignsService.listDeliveries(campaignId(param(req, 'id')), query));
  } catch (error) {
    next(error);
  }
});

/**
 * Relevés mensuels, montés sous /api : super_admin et administrateur du cinéma
 * (contrôle de cinéma via tenant-scope).
 */
const statementsRouter = Router();
const STATEMENT_ROLES = ['super_admin', 'cinema_admin'] as const;

statementsRouter.get(
  '/cinemas/:slug/statement',
  requireAuth([...STATEMENT_ROLES]),
  async (req, res, next) => {
    try {
      const { month } = validate(statementQuerySchema, req.query);
      res.json(await statementsService.buildStatement(req.user!, param(req, 'slug'), month));
    } catch (error) {
      next(error);
    }
  },
);

statementsRouter.get(
  '/cinemas/:slug/statement.csv',
  requireAuth([...STATEMENT_ROLES]),
  async (req, res, next) => {
    try {
      const { month } = validate(statementQuerySchema, req.query);
      const statement = await statementsService.buildStatement(
        req.user!,
        param(req, 'slug'),
        month,
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="releve-${statement.cinema.slug}-${month}.csv"`,
      );
      res.send(statementsService.statementToCsv(statement));
    } catch (error) {
      next(error);
    }
  },
);

export { router as campaignsRouter, statementsRouter };
