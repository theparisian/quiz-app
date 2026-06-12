import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { param } from '../../shared/utils/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { prizesService } from './prizes.service.js';

const router = Router();

router.post(
  '/:id/resend-email',
  requireAuth(['super_admin', 'cinema_admin', 'projectionist']),
  async (req, res, next) => {
    try {
      let prizeId: bigint;
      try {
        prizeId = BigInt(param(req, 'id'));
      } catch {
        throw new AppError('Invalid prize id', 400, 'INVALID_ID');
      }
      const result = await prizesService.resendEmail(prizeId, req.user!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export { router as prizesAdminRouter };
