import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { validate } from '../../shared/validation/index.js';
import { param } from '../../shared/utils/index.js';
import { updateNucSchema, heartbeatSchema } from './nucs.schemas.js';
import { nucsService } from './nucs.service.js';

const router = Router();

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
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as nucsRouter };
