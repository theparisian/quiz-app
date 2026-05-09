import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { updateMeSchema } from './users.schemas.js';
import { usersService } from './users.service.js';

const router = Router();

router.get('/me', requireAuth(), async (req, res, next) => {
  try {
    const user = await usersService.findById(req.user!.id);
    if (!user || user.deletedAt) {
      res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }
    res.json({
      id: user.id.toString(),
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      cinemaId: user.cinemaId?.toString() ?? null,
      cinemaSlug: user.cinema?.slug ?? null,
      cinemaName: user.cinema?.name ?? null,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/me', requireAuth(), async (req, res, next) => {
  try {
    const data = validate(updateMeSchema, req.body);
    const user = await usersService.updateDisplayName(req.user!.id, data.displayName);
    res.json({
      id: user.id.toString(),
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/me', requireAuth(), async (req, res, next) => {
  try {
    await usersService.softDeleteUser(req.user!.id);
    res.clearCookie('token');
    res.json({ message: 'Account deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as usersRouter };
