import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { CreateScreenInput, UpdateScreenInput } from './screens.schemas.js';

export const screensService = {
  async listByCinemaSlug(cinemaSlug: string) {
    const cinema = await prisma.cinema.findUnique({ where: { slug: cinemaSlug } });
    if (!cinema || cinema.deletedAt)
      throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');

    return prisma.screen.findMany({
      where: { cinemaId: cinema.id },
      include: { nucs: true },
      orderBy: { name: 'asc' },
    });
  },

  async create(cinemaSlug: string, input: CreateScreenInput) {
    const cinema = await prisma.cinema.findUnique({ where: { slug: cinemaSlug } });
    if (!cinema || cinema.deletedAt)
      throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');

    return prisma.screen.create({
      data: {
        cinemaId: cinema.id,
        name: input.name,
        capacity: input.capacity ?? null,
      },
    });
  },

  async update(id: bigint, input: UpdateScreenInput) {
    const screen = await prisma.screen.findUnique({ where: { id } });
    if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.capacity !== undefined) data.capacity = input.capacity;
    if (input.status !== undefined) data.status = input.status;

    return prisma.screen.update({ where: { id }, data });
  },

  async remove(id: bigint) {
    const screen = await prisma.screen.findUnique({
      where: { id },
      include: { nucs: { where: { status: { not: 'offline' } } } },
    });
    if (!screen) throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');

    if (screen.nucs.length > 0) {
      throw new AppError(
        'Cannot delete screen with active NUCs. Remove or deactivate NUCs first.',
        400,
        'SCREEN_HAS_ACTIVE_NUCS',
      );
    }

    await prisma.screen.delete({ where: { id } });
  },
};
