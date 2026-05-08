import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';
import type { UpdateNucInput } from './nucs.schemas.js';

const SALT_ROUNDS = 10;

export const nucsService = {
  async listByScreenId(screenId: bigint) {
    return prisma.nuc.findMany({
      where: { screenId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(screenId: bigint) {
    const screen = await prisma.screen.findUnique({ where: { id: screenId } });
    if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');

    const nucUid = nanoid(16);
    const authKey = nanoid(64);
    const authKeyHash = await bcrypt.hash(authKey, SALT_ROUNDS);

    const nuc = await prisma.nuc.create({
      data: {
        screenId,
        nucUid,
        authKeyHash,
        status: 'provisioning',
      },
    });

    logger.info({ nucId: nuc.id.toString(), nucUid, screenId: screenId.toString() }, 'NUC created');

    return { nuc, authKey };
  },

  async update(id: bigint, input: UpdateNucInput) {
    const nuc = await prisma.nuc.findUnique({ where: { id } });
    if (!nuc) throw new AppError('NUC not found', 404, 'NUC_NOT_FOUND');

    const data: Record<string, unknown> = {};
    if (input.status !== undefined) data.status = input.status;

    return prisma.nuc.update({ where: { id }, data });
  },

  async remove(id: bigint) {
    const nuc = await prisma.nuc.findUnique({ where: { id } });
    if (!nuc) throw new AppError('NUC not found', 404, 'NUC_NOT_FOUND');

    await prisma.nuc.delete({ where: { id } });
    logger.info({ nucId: id.toString(), nucUid: nuc.nucUid }, 'NUC deleted');
  },

  async heartbeat(
    nucUid: string,
    authKey: string,
    appVersion?: string | undefined,
    ip?: string | undefined,
  ) {
    const nuc = await prisma.nuc.findUnique({ where: { nucUid } });
    if (!nuc) throw new AppError('NUC not found', 404, 'NUC_NOT_FOUND');

    if (!nuc.authKeyHash)
      throw new AppError('NUC has no auth key configured', 401, 'NUC_AUTH_MISSING');

    const isValid = await bcrypt.compare(authKey, nuc.authKeyHash);
    if (!isValid) throw new AppError('Invalid auth key', 401, 'NUC_AUTH_INVALID');

    const now = new Date();
    await prisma.nuc.update({
      where: { id: nuc.id },
      data: {
        lastSeenAt: now,
        lastHeartbeatAt: now,
        lastIp: ip ?? null,
        appVersion: appVersion ?? nuc.appVersion,
        status: 'online',
      },
    });

    return { status: 'ok' };
  },
};
