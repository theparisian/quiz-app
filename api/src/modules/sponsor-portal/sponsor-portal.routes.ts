import { Router } from 'express';
import { sponsorPortalListQuerySchema, sponsorPortalPeriodQuerySchema } from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { param } from '../../shared/utils/index.js';
import { validate } from '../../shared/validation/index.js';
import { sponsorPortalService } from './sponsor-portal.service.js';

/**
 * /api/sponsor-portal (C4) : portail en lecture seule des contacts sponsor. Rôles sponsor (son
 * sponsor, contrôlé par `assertCanAccessSponsor`) et super_admin.
 */
const router = Router();
const PORTAL_ROLES = ['sponsor', 'super_admin'] as const;

function campaignId(raw: string): bigint {
  if (!/^\d{1,20}$/.test(raw)) throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
  return BigInt(raw);
}

router.get('/campaigns', requireAuth([...PORTAL_ROLES]), async (req, res, next) => {
  try {
    const query = validate(sponsorPortalListQuerySchema, req.query);
    res.json(await sponsorPortalService.listCampaigns(req.user!, query));
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id', requireAuth([...PORTAL_ROLES]), async (req, res, next) => {
  try {
    const period = validate(sponsorPortalPeriodQuerySchema, req.query);
    res.json(
      await sponsorPortalService.getCampaignStats(req.user!, campaignId(param(req, 'id')), period),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id/export.csv', requireAuth([...PORTAL_ROLES]), async (req, res, next) => {
  try {
    const period = validate(sponsorPortalPeriodQuerySchema, req.query);
    const { filename, csv } = await sponsorPortalService.exportCampaignCsv(
      req.user!,
      campaignId(param(req, 'id')),
      period,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export { router as sponsorPortalRouter };
