import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import {
  createCinemaSchema,
  updateCinemaSchema,
  listCinemasQuerySchema,
} from './cinemas.schemas.js';
import { cinemasService } from './cinemas.service.js';
import { prizesService } from '../prizes/prizes.service.js';
import {
  listPrizesQuerySchema,
  updatePrizesConfigBodySchema,
  createPrizeTemplateBodySchema,
  updateSuperPrizeConfigBodySchema,
} from '../prizes/prizes.schemas.js';
import { prizeTemplateService } from '../prizes/prize-template.service.js';
import { superPrizeConfigService } from '../prizes/prize-catalog.service.js';
import { hashStaffPin, isStaffPinConfigured } from '../prizes/staff-pin.service.js';
import { staffPinBodySchema } from '../prizes/prizes.schemas.js';
import { AppError } from '../../shared/errors/app-error.js';
import { prisma } from '../../shared/db/index.js';
import type { AuthUser } from '../../shared/auth/middleware.js';

const router = Router();

async function assertCinemaStaff(slug: string, user: AuthUser) {
  const cinema = await cinemasService.getBySlug(slug);
  if (user.role === 'super_admin') return cinema;
  if (user.role === 'cinema_admin' && user.cinemaId === cinema.id) return cinema;
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
}

router.get('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listCinemasQuerySchema, req.query);
    const result = await cinemasService.list(query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:slug',
  requireAuth(['super_admin', 'cinema_admin', 'projectionist']),
  async (req, res, next) => {
    try {
      const cinema = await cinemasService.getBySlug(param(req, 'slug'));
      res.json({
        id: cinema.id.toString(),
        slug: cinema.slug,
        name: cinema.name,
        address: cinema.address,
        city: cinema.city,
        postalCode: cinema.postalCode,
        country: cinema.country,
        contactName: cinema.contactName,
        contactEmail: cinema.contactEmail,
        contactPhone: cinema.contactPhone,
        status: cinema.status,
        notes: cinema.notes,
        screens: cinema.screens.map((s) => ({
          id: s.id.toString(),
          name: s.name,
          capacity: s.capacity,
          status: s.status,
          nucs: s.nucs.map((n) => ({
            id: n.id.toString(),
            nucUid: n.nucUid,
            status: n.status,
            lastSeenAt: n.lastSeenAt?.toISOString() ?? null,
            lastIp: n.lastIp,
            appVersion: n.appVersion,
          })),
        })),
        usersCount: cinema._count.users,
        invitationsCount: cinema._count.invitations,
        createdAt: cinema.createdAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(createCinemaSchema, req.body);
    const cinema = await cinemasService.create(data);
    res.status(201).json({
      id: cinema.id.toString(),
      slug: cinema.slug,
      name: cinema.name,
      status: cinema.status,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(updateCinemaSchema, req.body);
    const cinema = await cinemasService.update(param(req, 'slug'), data);
    res.json({
      id: cinema.id.toString(),
      slug: cinema.slug,
      name: cinema.name,
      status: cinema.status,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await cinemasService.archive(param(req, 'slug'));
    res.json({ message: 'Cinema archived' });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:slug/prizes-config',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      const result = await prizesService.getCinemaConfig(slug, req.user!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:slug/prizes-config',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      const body = validate(updatePrizesConfigBodySchema, req.body);
      const result = await prizesService.updateCinemaConfig(slug, req.user!, body.config);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:slug/prizes',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const slug = param(req, 'slug');
      const query = validate(listPrizesQuerySchema, req.query);
      const result = await prizesService.listByCinema(slug, req.user!, query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:slug/prize-templates',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const result = await prizeTemplateService.listByCinemaSlug(param(req, 'slug'), req.user!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:slug/prize-templates',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const body = validate(createPrizeTemplateBodySchema, req.body);
      const result = await prizeTemplateService.createForCinema(
        param(req, 'slug'),
        req.user!,
        body,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:slug/super-prize-config',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const result = await superPrizeConfigService.get(param(req, 'slug'), req.user!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:slug/super-prize-config',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const body = validate(updateSuperPrizeConfigBodySchema, req.body);
      const result = await superPrizeConfigService.update(
        param(req, 'slug'),
        req.user!,
        body.config,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:slug/staff-pin',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const cinema = await assertCinemaStaff(param(req, 'slug'), req.user!);
      const configured = await isStaffPinConfigured(cinema.id);
      res.json({ configured });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:slug/staff-pin',
  requireAuth(['super_admin', 'cinema_admin']),
  async (req, res, next) => {
    try {
      const cinema = await assertCinemaStaff(param(req, 'slug'), req.user!);
      const body = validate(staffPinBodySchema, req.body);
      const staffPinHash = await hashStaffPin(body.pin);
      await prisma.cinema.update({
        where: { id: cinema.id },
        data: { staffPinHash },
      });
      res.json({ configured: true });
    } catch (error) {
      next(error);
    }
  },
);

export { router as cinemasRouter };
