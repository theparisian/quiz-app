import { Router } from 'express';
import { contactsExportQuerySchema } from '@quiz-app/validation';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { contactsService } from './contacts.service.js';

/** /api/contacts (C5) : contacts consentis, super_admin uniquement. */
const router = Router();

router.get('/stats', requireAuth(['super_admin']), async (_req, res, next) => {
  try {
    res.json(await contactsService.stats());
  } catch (error) {
    next(error);
  }
});

router.get('/export.csv', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(contactsExportQuerySchema, req.query);
    const { filename, csv } = await contactsService.exportCsv(query, req.user!);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export { router as contactsRouter };
