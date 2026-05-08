import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import {
  createInvitationSchema,
  acceptInvitationSchema,
  listInvitationsQuerySchema,
} from './invitations.schemas.js';
import { invitationsService } from './invitations.service.js';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

router.post('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(createInvitationSchema, req.body);
    const invitation = await invitationsService.create({
      email: data.email,
      role: data.role,
      cinemaId: BigInt(data.cinemaId),
      invitedBy: { id: req.user!.id, displayName: req.user!.displayName },
    });
    res.status(201).json({
      id: invitation.id.toString(),
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      cinemaName: invitation.cinema.name,
      expiresAt: invitation.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const query = validate(listInvitationsQuerySchema, req.query);
    const result = await invitationsService.list({
      status: query.status,
      cinemaId: query.cinemaId ? BigInt(query.cinemaId) : undefined,
      page: query.page,
      limit: query.limit,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/revoke', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await invitationsService.revoke(BigInt(param(req, 'id')));
    res.json({ message: 'Invitation revoked' });
  } catch (error) {
    next(error);
  }
});

router.get('/by-token/:token', async (req, res, next) => {
  try {
    const info = await invitationsService.getByToken(param(req, 'token'));
    res.json(info);
  } catch (error) {
    next(error);
  }
});

router.post('/accept', async (req, res, next) => {
  try {
    const data = validate(acceptInvitationSchema, req.body);
    const result = await invitationsService.accept(data.token, data.displayName);
    res.cookie('token', result.accessToken, COOKIE_OPTIONS);
    res.json({ user: result.user });
  } catch (error) {
    next(error);
  }
});

export { router as invitationsRouter };
