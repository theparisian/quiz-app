import { Prisma, type PrizeRedeemMode } from '@prisma/client';
import type { AuthUser } from '../../shared/auth/middleware.js';
import { assertCanAccessCinema } from '../../shared/auth/tenant-scope.js';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import {
  MAX_PRIZE_CODES_PER_IMPORT,
  PRIZE_CODE_MAX_LENGTH,
  parsePrizeCodesText,
  type ImportPrizeCodesResponse,
  type PrizeCodesStats,
  createPrizeTemplateBodySchema,
  updatePrizeTemplateBodySchema,
} from '@quiz-app/validation';
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
  redeemMode: PrizeRedeemMode;
  staticCode: string | null;
  redeemInstructions: string | null;
  redeemUrl: string | null;
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
    redeemMode: t.redeemMode,
    staticCode: t.staticCode,
    redeemInstructions: t.redeemInstructions,
    redeemUrl: t.redeemUrl,
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

/**
 * Qui gère un gabarit (mode de retrait, code fixe, consignes, lien, import et stock de codes) :
 * - gabarit SPONSOR (sponsorId renseigné) : super_admin seul (conditions convenues avec la marque) ;
 * - gabarit CINÉMA : super_admin, ou cinema_admin de CE cinéma (cloisonnement tenant-scope).
 * Tout autre cas : 403 FORBIDDEN.
 */
async function assertCanManageTemplate(
  user: AuthUser,
  template: { cinemaId: bigint | null; sponsorId: bigint | null },
): Promise<void> {
  if (user.role === 'super_admin') return;
  if (user.role !== 'cinema_admin' || template.sponsorId !== null || template.cinemaId === null) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
  await assertCanAccessCinema(user, template.cinemaId);
}

function payloadFromValue(value?: string) {
  if (value === undefined) return undefined;
  return { value };
}

function stockManagedByCodes(): AppError {
  return new AppError(
    'Le stock de ce lot est le nombre de codes restants.',
    409,
    'STOCK_MANAGED_BY_CODES',
  );
}

/**
 * Champs de retrait à la création (C5). En mode code_pool, le stock est le nombre de codes
 * restants : 0 tant qu'aucun code n'est importé.
 */
function redeemCreateData(data: CreatePrizeTemplateBody) {
  const redeemMode = data.redeemMode ?? 'staff_pin';
  if (redeemMode === 'code_pool' && data.stock != null) throw stockManagedByCodes();
  const stock = redeemMode === 'code_pool' ? 0 : (data.stock ?? null);
  return {
    redeemMode,
    staticCode: redeemMode === 'static_code' ? (data.staticCode ?? null) : null,
    redeemInstructions: data.redeemInstructions ?? null,
    redeemUrl: data.redeemUrl ?? null,
    stock,
    stockInitial: stock,
  };
}

/** Nombre de codes d'un gabarit, attribués ou non. */
async function countCodes(
  db: Prisma.TransactionClient | typeof prisma,
  templateId: bigint,
): Promise<PrizeCodesStats> {
  const [total, remaining] = await Promise.all([
    db.prizeCode.count({ where: { templateId } }),
    db.prizeCode.count({ where: { templateId, prizeId: null } }),
  ]);
  return { total, assigned: total - remaining, remaining };
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
    const payload = payloadFromValue(data.value);
    const created = await prisma.prizeTemplate.create({
      data: {
        cinemaId: cinema.id,
        label: data.label,
        type: data.type,
        payloadJson: payload ?? Prisma.JsonNull,
        validityDays: data.validityDays ?? null,
        ...redeemCreateData(data),
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
    const payload = payloadFromValue(data.value);
    const created = await prisma.prizeTemplate.create({
      data: {
        sponsorId: sponsor.id,
        label: data.label,
        type: data.type,
        payloadJson: payload ?? Prisma.JsonNull,
        validityDays: data.validityDays ?? null,
        ...redeemCreateData(data),
      },
    });
    return shapeTemplate(created);
  },

  async getByIdForUser(id: bigint, user: AuthUser) {
    const template = await prisma.prizeTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError('Prize template not found', 404, 'PRIZE_TEMPLATE_NOT_FOUND');
    await assertCanManageTemplate(user, template);
    return template;
  },

  async update(id: bigint, user: AuthUser, data: UpdatePrizeTemplateBody) {
    const existing = await this.getByIdForUser(id, user);
    const payloadUpdate =
      data.value !== undefined ? (payloadFromValue(data.value) ?? Prisma.JsonNull) : undefined;

    // Mode de retrait (C5).
    const nextMode = data.redeemMode ?? existing.redeemMode;
    const nextStaticCode = data.staticCode !== undefined ? data.staticCode : existing.staticCode;
    if (nextMode === 'static_code' && !nextStaticCode) {
      throw new AppError('Un code fixe est requis pour ce mode.', 400, 'STATIC_CODE_REQUIRED');
    }
    if (nextMode === 'code_pool' && data.stock !== undefined) throw stockManagedByCodes();
    let codeStock: { stock: number; stockInitial: number } | null = null;
    if (nextMode === 'code_pool' && existing.redeemMode !== 'code_pool') {
      const stats = await countCodes(prisma, existing.id);
      codeStock = { stock: stats.remaining, stockInitial: stats.total };
    }

    const updated = await prisma.prizeTemplate.update({
      where: { id: existing.id },
      data: {
        ...(data.redeemMode !== undefined ? { redeemMode: data.redeemMode } : {}),
        ...(data.staticCode !== undefined || data.redeemMode !== undefined
          ? { staticCode: nextMode === 'static_code' ? nextStaticCode : null }
          : {}),
        ...(data.redeemInstructions !== undefined
          ? { redeemInstructions: data.redeemInstructions }
          : {}),
        ...(data.redeemUrl !== undefined ? { redeemUrl: data.redeemUrl } : {}),
        ...(codeStock ?? {}),
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

  /**
   * Import de codes (C5 ; droits : assertCanManageTemplate). Un code par ligne, doublons
   * ignorés (dans le fichier et avec les codes déjà importés), 10 000 lignes au plus. Le stock
   * du gabarit devient le nombre de codes restants.
   */
  async importCodes(id: bigint, text: string, user: AuthUser): Promise<ImportPrizeCodesResponse> {
    const template = await this.getByIdForUser(id, user);
    if (template.redeemMode !== 'code_pool') {
      throw new AppError(
        "Ce lot n'est pas en mode « codes fournis par la marque ».",
        409,
        'NOT_CODE_POOL',
      );
    }
    const { codes, lineCount } = parsePrizeCodesText(text);
    if (lineCount === 0) throw new AppError('Aucun code dans le fichier.', 400, 'NO_CODES');
    if (lineCount > MAX_PRIZE_CODES_PER_IMPORT) {
      throw new AppError(
        `${MAX_PRIZE_CODES_PER_IMPORT} codes au plus par import.`,
        400,
        'TOO_MANY_CODES',
      );
    }
    const tooLong = codes.find((c) => c.length > PRIZE_CODE_MAX_LENGTH);
    if (tooLong !== undefined) {
      throw new AppError(
        `Code trop long (${PRIZE_CODE_MAX_LENGTH} caractères au plus).`,
        400,
        'INVALID_CODE',
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Même verrou que l'attribution d'un lot (décrément du stock) : stock et codes restent alignés.
      await tx.$queryRaw`SELECT id FROM prize_templates WHERE id = ${template.id} FOR UPDATE`;
      const created = await tx.prizeCode.createMany({
        data: codes.map((code) => ({ templateId: template.id, code })),
        skipDuplicates: true,
      });
      const stats = await countCodes(tx, template.id);
      await tx.prizeTemplate.update({
        where: { id: template.id },
        data: { stock: stats.remaining, stockInitial: stats.total },
      });
      return { ...stats, imported: created.count, duplicates: lineCount - created.count };
    });

    logEvent({
      level: 'info',
      eventType: 'prize.codes_imported',
      ...(template.cinemaId !== null ? { cinemaId: template.cinemaId } : {}),
      payload: {
        templateId: template.id.toString(),
        imported: result.imported,
        duplicates: result.duplicates,
        userId: user.id.toString(),
      },
    });
    return result;
  },

  async codesStats(id: bigint, user: AuthUser): Promise<PrizeCodesStats> {
    const template = await this.getByIdForUser(id, user);
    return countCodes(prisma, template.id);
  },
};
