import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { createScreenSchema, updateScreenSchema } from './screens.schemas.js';
import { screensService } from './screens.service.js';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';

const router = Router();

router.get(
  '/cinemas/:cinemaSlug/screens',
  requireAuth(['super_admin', 'cinema_admin', 'projectionist']),
  async (req, res, next) => {
    try {
      const screens = await screensService.listByCinemaSlug(param(req, 'cinemaSlug'));
      res.json(
        screens.map((s) => ({
          id: s.id.toString(),
          name: s.name,
          capacity: s.capacity,
          status: s.status,
          nucs: s.nucs.map((n) => ({
            id: n.id.toString(),
            nucUid: n.nucUid,
            status: n.status,
            lastSeenAt: n.lastSeenAt?.toISOString() ?? null,
          })),
          createdAt: s.createdAt.toISOString(),
        })),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/cinemas/:cinemaSlug/screens',
  requireAuth(['super_admin']),
  async (req, res, next) => {
    try {
      const data = validate(createScreenSchema, req.body);
      const screen = await screensService.create(param(req, 'cinemaSlug'), data);
      res.status(201).json({
        id: screen.id.toString(),
        name: screen.name,
        capacity: screen.capacity,
        status: screen.status,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch('/screens/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(updateScreenSchema, req.body);
    const screen = await screensService.update(BigInt(param(req, 'id')), data);
    res.json({
      id: screen.id.toString(),
      name: screen.name,
      capacity: screen.capacity,
      status: screen.status,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/screens/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await screensService.remove(BigInt(param(req, 'id')));
    res.json({ message: 'Screen deleted' });
  } catch (error) {
    next(error);
  }
});

router.get('/screens/:id/cinema', async (req, res, next) => {
  try {
    const screen = await prisma.screen.findUnique({
      where: { id: BigInt(param(req, 'id')) },
      include: {
        cinema: {
          select: { name: true, slug: true, logoUrl: true, backgroundMusicUrl: true },
        },
      },
    });
    if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');

    res.json({
      cinema: {
        name: screen.cinema.name,
        slug: screen.cinema.slug,
        logoUrl: screen.cinema.logoUrl,
        backgroundMusicUrl: screen.cinema.backgroundMusicUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as screensRouter };
