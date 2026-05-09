import { Router } from 'express';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { redeemBodySchema } from './prizes.schemas.js';
import { prizesService } from './prizes.service.js';

const router = Router();

router.post('/redeem/:redeemCode', async (req, res, next) => {
  try {
    const redeemCode = param(req, 'redeemCode');
    const body = validate(redeemBodySchema, req.body);
    const result = await prizesService.redeem(redeemCode, body.signature);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/unsubscribe/:redeemCode', async (req, res, next) => {
  try {
    const redeemCode = param(req, 'redeemCode');
    const body = validate(redeemBodySchema, req.body);
    const result = await prizesService.unsubscribe(redeemCode, body.signature);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as prizesPublicRouter };
