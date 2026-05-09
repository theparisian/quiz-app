import { Router } from 'express';
import type { Server as SocketIoServer } from 'socket.io';
import { requireAuth, requireNucAuth, signNucJwt } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { broadcastNucStatusChanged } from '../../shared/nuc-monitor/index.js';
import {
  updateNucSchema,
  heartbeatSchema,
  nucAuthSchema,
  nucHeartbeatCookieSchema,
} from './nucs.schemas.js';
import { nucsService } from './nucs.service.js';
import type { Request } from 'express';

const router = Router();

function getIo(req: Request): SocketIoServer | undefined {
  return req.app.get('io');
}

router.get('/screens/:screenId/nucs', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const nucs = await nucsService.listByScreenId(BigInt(param(req, 'screenId')));
    res.json(
      nucs.map((n) => ({
        id: n.id.toString(),
        nucUid: n.nucUid,
        status: n.status,
        appVersion: n.appVersion,
        lastSeenAt: n.lastSeenAt?.toISOString() ?? null,
        lastIp: n.lastIp,
        lastHeartbeatAt: n.lastHeartbeatAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.post('/screens/:screenId/nucs', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const { nuc, authKey } = await nucsService.create(BigInt(param(req, 'screenId')));
    res.status(201).json({
      id: nuc.id.toString(),
      nucUid: nuc.nucUid,
      authKey,
      status: nuc.status,
      warning: 'IMPORTANT: Copy the authKey now. It will never be shown again.',
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/nucs/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    const data = validate(updateNucSchema, req.body);
    const nuc = await nucsService.update(BigInt(param(req, 'id')), data);
    res.json({
      id: nuc.id.toString(),
      nucUid: nuc.nucUid,
      status: nuc.status,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/nucs/:id', requireAuth(['super_admin']), async (req, res, next) => {
  try {
    await nucsService.remove(BigInt(param(req, 'id')));
    res.json({ message: 'NUC deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/nuc/heartbeat', async (req, res, next) => {
  try {
    const data = validate(heartbeatSchema, req.body);
    const result = await nucsService.heartbeat(data.nucUid, data.authKey, data.appVersion, data.ip);
    res.json({ status: result.status });
    const io = getIo(req);
    if (io && result.cameOnline) {
      broadcastNucStatusChanged(io, {
        nucId: result.nucId.toString(),
        screenId: result.screenId.toString(),
        status: 'online',
      });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/nucs/auth', async (req, res, next) => {
  try {
    const data = validate(nucAuthSchema, req.body);
    const result = await nucsService.authenticateNuc(
      data.nucUid,
      data.authKey,
      req.ip ?? undefined,
    );

    const token = await signNucJwt({
      nucId: result.nucId.toString(),
      screenId: result.screenId.toString(),
    });

    const io = getIo(req);
    if (io && result.cameOnline) {
      broadcastNucStatusChanged(io, {
        nucId: result.nucId.toString(),
        screenId: result.screenId.toString(),
        status: 'online',
      });
    }

    res.cookie('nuc_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      nucId: result.nucId.toString(),
      screenId: result.screenId.toString(),
      cinemaSlug: result.cinemaSlug,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/nucs/heartbeat', requireNucAuth(), async (req, res, next) => {
  try {
    const data = validate(nucHeartbeatCookieSchema, req.body);
    const hb = await nucsService.heartbeatCookie(req.nuc!.id, data.appVersion, req.ip ?? undefined);
    res.json({ ok: true });
    const io = getIo(req);
    if (io && hb.cameOnline) {
      broadcastNucStatusChanged(io, {
        nucId: hb.nucId.toString(),
        screenId: hb.screenId.toString(),
        status: 'online',
      });
    }
  } catch (error) {
    next(error);
  }
});

export { router as nucsRouter };
