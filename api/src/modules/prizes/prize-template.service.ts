import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../shared/auth/middleware.js';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createPrizeTemplateBodySchema, updatePrizeTemplateBodySchema } from '@quiz-app/validation';
import type { z } from 'zod';

type CreatePrizeTemplateBody = z.infer<typeof createPrizeTemplateBodySchema>;
type UpdatePrizeTemplateBody = z.infer<typeof updatePrizeTemplateBodySchema>;

function shapeTemplate(t: {
  id: bigint;
  cinemaId: bigint | null;
  sponsorId: bigint | null;
  label: string;
  type: string;
  payloadJson: unknown;
  validityDays: number | null;
  stock: number | null;
  stockInitial: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const payload = (t.payloadJson ?? {}) as { value?: string };
  return {
    id: t.id.toString(),
    cinemaId: t.cinemaId?.toString() ?? null,
    sponsorId: t.sponsorId?.toString() ?? null,
    label: t.label,
    type: t.type,
    value: payload.value ?? null,
    validityDays: t.validityDays,
    stock: t.stock,
    stockInitial: t.stockInitial,
    isActive: t.isActive,
    stockLabel:
      t.stock === null
        ? 'Illimité'
        : t.stock === 0
          ? 'Épuisé'
          : t.stockInitial != null
            ? `${t.stock}/${t.stockInitial} restants`
            : `${t.stock} restants`,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

async function assertCinemaStaffCanAccessSlug(user: AuthUser, cinemaSlug: string) {
  const cinema = await prisma.cinema.findFirst({
    where: { slug: cinemaSlug, deletedAt: null },
  });
  if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  if (user.role === 'super_admin') return cinema;
  if (user.role === 'cinema_admin') {
    if (!user.cinemaId || user.cinemaId !== cinema.id) {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }
    return cinema;
  }
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
}

function payloadFromValue(value?: string) {
  if (value === undefined) return undefined;
  return { value };
}

export const prizeTemplateService = {
  shapeTemplate,

  async listByCinemaSlug(cinemaSlug: string, user: AuthUser) {
    const cinema = await assertCinemaStaffCanAccessSlug(user, cinemaSlug);
    const items = await prisma.prizeTemplate.findMany({
      where: { cinemaId: cinema.id },
      orderBy: [{ isActive: 'desc' }, { id: 'desc' }],
    });
    return { items: items.map(shapeTemplate) };
  },

  async createForCinema(cinemaSlug: string, user: AuthUser, data: CreatePrizeTemplateBody) {
    const cinema = await assertCinemaStaffCanAccessSlug(user, cinemaSlug);
    const stock = data.stock ?? null;
    const payload = payloadFromValue(data.value);
    const created = await prisma.prizeTemplate.create({
      data: {
        cinemaId: cinema.id,
        label: data.label,
        type: data.type,
        payloadJson: payload ?? Prisma.JsonNull,
        validityDays: data.validityDays ?? null,
        stock,
        stockInitial: stock,
      },
    });
    return shapeTemplate(created);
  },

  async listBySponsorSlug(sponsorSlug: string) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug: sponsorSlug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    const items = await prisma.prizeTemplate.findMany({
      where: { sponsorId: sponsor.id },
      orderBy: [{ isActive: 'desc' }, { id: 'desc' }],
    });
    return { items: items.map(shapeTemplate) };
  },

  async createForSponsor(sponsorSlug: string, data: CreatePrizeTemplateBody) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug: sponsorSlug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    const stock = data.stock ?? null;
    const payload = payloadFromValue(data.value);
    const created = await prisma.prizeTemplate.create({
      data: {
        sponsorId: sponsor.id,
        label: data.label,
        type: data.type,
        payloadJson: payload ?? Prisma.JsonNull,
        validityDays: data.validityDays ?? null,
        stock,
        stockInitial: stock,
      },
    });
    return shapeTemplate(created);
  },

  async getByIdForUser(id: bigint, user: AuthUser) {
    const template = await prisma.prizeTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError('Prize template not found', 404, 'PRIZE_TEMPLATE_NOT_FOUND');
    if (user.role === 'super_admin') return template;
    if (user.role === 'cinema_admin') {
      if (template.cinemaId && user.cinemaId === template.cinemaId) return template;
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  },

  async update(id: bigint, user: AuthUser, data: UpdatePrizeTemplateBody) {
    const existing = await this.getByIdForUser(id, user);
    const payloadUpdate =
      data.value !== undefined ? (payloadFromValue(data.value) ?? Prisma.JsonNull) : undefined;
    const updated = await prisma.prizeTemplate.update({
      where: { id: existing.id },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(payloadUpdate !== undefined ? { payloadJson: payloadUpdate } : {}),
        ...(data.validityDays !== undefined ? { validityDays: data.validityDays } : {}),
        ...(data.stock !== undefined
          ? {
              stock: data.stock,
              ...(data.stock !== null && existing.stockInitial == null
                ? { stockInitial: data.stock }
                : {}),
            }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return shapeTemplate(updated);
  },

  async archive(id: bigint, user: AuthUser) {
    return this.update(id, user, { isActive: false });
  },
};
