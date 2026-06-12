import { Router } from 'express';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  checkPrizeRedeemRateLimit,
  clientKeyFromIp,
} from '../../shared/rate-limit/prize-redeem.rate-limit.js';
import {
  prizeRedeemBodySchema,
  prizeLookupBodySchema,
  prizeRedeemQuerySchema,
  redeemBodySchema,
} from './prizes.schemas.js';
import { prizeRedeemService } from './prize-redeem.service.js';
import { prizesService } from './prizes.service.js';

const router = Router();

function enforceRateLimit(req: { ip?: string | undefined }, next: (err?: unknown) => void) {
  const key = clientKeyFromIp(typeof req.ip === 'string' ? req.ip : undefined);
  const rate = checkPrizeRedeemRateLimit(key);
  if (!rate.allowed) {
    next(
      new AppError('Trop de tentatives. Réessayez dans une minute.', 429, 'RATE_LIMIT_EXCEEDED'),
    );
    return;
  }
  next();
}

router.get('/redeem/:redeemCode', async (req, res, next) => {
  try {
    const redeemCode = param(req, 'redeemCode');
    const query = validate(prizeRedeemQuerySchema, req.query);
    const result = await prizeRedeemService.getStatus(
      redeemCode,
      query.sig,
      typeof req.ip === 'string' ? req.ip : undefined,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/lookup', (req, res, next) => {
  enforceRateLimit(req, async (err) => {
    if (err) return next(err);
    try {
      const body = validate(prizeLookupBodySchema, req.body);
      const result = await prizeRedeemService.lookup(
        body.shortCode,
        body.staffPin,
        typeof req.ip === 'string' ? req.ip : undefined,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
});

router.post('/redeem/:redeemCode', (req, res, next) => {
  enforceRateLimit(req, async (err) => {
    if (err) return next(err);
    try {
      const redeemCode = param(req, 'redeemCode');
      const body = validate(prizeRedeemBodySchema, req.body);
      const result = await prizeRedeemService.redeem(
        redeemCode,
        body.sig,
        body.staffPin,
        body.redeemedVia,
        typeof req.ip === 'string' ? req.ip : undefined,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
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
