import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { getStorage } from '../../shared/storage/index.js';
import { createUploadMiddleware, uploadFile } from '../../shared/upload/index.js';
import { logger } from '../../shared/logger/index.js';
import {
  createSponsorSchema,
  updateSponsorSchema,
  listSponsorsQuerySchema,
} from './sponsors.schemas.js';
import { sponsorsService } from './sponsors.service.js';
import { prizesService } from '../prizes/prizes.service.js';
import {
  updatePrizesConfigBodySchema,
  createPrizeTemplateBodySchema,
} from '../prizes/prizes.schemas.js';
import { prizeTemplateService } from '../prizes/prize-template.service.js';

const router = Router();

const UPLOAD_MAX = 2 * 1024 * 1024;
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;

function shapeSponsor(s: {
  id: bigint;
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColorPrimary: string | null;
  brandColorSecondary: string | null;
  contactEmail: string | null;
  contractTerms: string | null;
  active: boolean;
  metadata?: unknown | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { quizzes: number };
}) {
  return {
    id: s.id.toString(),
    slug: s.slug,
    name: s.name,
    logoUrl: s.logoUrl,
    brandColorPrimary: s.brandColorPrimary,
    brandColorSecondary: s.brandColorSecondary,
    contactEmail: s.contactEmail,
    contractTerms: s.contractTerms,
    active: s.active,
    metadata: s.metadata,
    quizzesCount: s._count?.quizzes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listSponsorsQuerySchema, req.query);
    const result = await sponsorsService.list(query);
    res.json({
      items: result.items.map((s) => shapeSponsor(s)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const sponsor = await sponsorsService.getBySlug(param(req, 'slug'));
    res.json(shapeSponsor(sponsor));
  } catch (error) {
    next(error);
  }
});

router.get('/:slug/prizes-config', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const result = await prizesService.getSponsorConfig(param(req, 'slug'));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug/prizes-config', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(updatePrizesConfigBodySchema, req.body);
    const result = await prizesService.updateSponsorConfig(param(req, 'slug'), body.config);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:slug/prize-templates', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const result = await prizeTemplateService.listBySponsorSlug(param(req, 'slug'));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/prize-templates', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const body = validate(createPrizeTemplateBodySchema, req.body);
    const result = await prizeTemplateService.createForSponsor(param(req, 'slug'), body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(createSponsorSchema, req.body);
    const sponsor = await sponsorsService.create(data);
    logger.info({ sponsorSlug: sponsor.slug }, 'Sponsor created');
    res.status(201).json(shapeSponsor(sponsor));
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(updateSponsorSchema, req.body);
    const sponsor = await sponsorsService.update(param(req, 'slug'), data);
    res.json(shapeSponsor(sponsor));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/deactivate', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const sponsor = await sponsorsService.deactivate(param(req, 'slug'));
    res.json(shapeSponsor(sponsor));
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/activate', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const sponsor = await sponsorsService.activate(param(req, 'slug'));
    res.json(shapeSponsor(sponsor));
  } catch (error) {
    next(error);
  }
});

const logoUpload = createUploadMiddleware({
  kind: 'sponsor-logo',
  maxSize: UPLOAD_MAX,
  allowedMimes: [...IMAGE_MIMES],
});

router.post('/:slug/logo', requireAuth(['super_admin']), logoUpload, async (req, res, next) => {
  try {
    const slug = param(req, 'slug');
    if (!req.file) throw new AppError('No file uploaded', 400, 'UPLOAD_MISSING');
    const storage = getStorage();
    const result = await uploadFile({
      kind: 'sponsor-logo',
      id: slug,
      file: {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
      },
      storage,
    });
    logger.info(
      { kind: 'sponsor-logo', id: slug, size: req.file.size, mime: req.file.mimetype },
      'File uploaded',
    );
    const sponsor = await sponsorsService.setLogo(slug, result.key, result.url);
    res.json(shapeSponsor(sponsor));
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug/logo', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const storage = getStorage();
    const sponsor = await sponsorsService.removeLogo(param(req, 'slug'), storage);
    logger.info({ sponsorSlug: sponsor.slug }, 'Sponsor logo removed');
    res.json(shapeSponsor(sponsor));
  } catch (error) {
    next(error);
  }
});

export { router as sponsorsRouter };
