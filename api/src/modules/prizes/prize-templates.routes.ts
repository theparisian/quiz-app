import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { updatePrizeTemplateBodySchema } from './prizes.schemas.js';
import { prizeTemplateService } from './prize-template.service.js';

const router = Router();

function parseTemplateId(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    throw new AppError('Invalid prize template id', 400, 'INVALID_ID');
  }
}

router.patch('/:id', requireAuth(['super_admin', 'cinema_admin']), async (req, res, next) => {
  try {
    const id = parseTemplateId(param(req, 'id'));
    const body = validate(updatePrizeTemplateBodySchema, req.body);
    const result = await prizeTemplateService.update(id, req.user!, body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth(['super_admin', 'cinema_admin']), async (req, res, next) => {
  try {
    const id = parseTemplateId(param(req, 'id'));
    const result = await prizeTemplateService.archive(id, req.user!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as prizeTemplatesRouter };
