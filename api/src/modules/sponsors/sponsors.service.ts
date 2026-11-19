import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { extractKeyFromPublicUrl } from '../../shared/storage/storage-url.js';
import type { StorageProvider } from '../../shared/storage/storage-provider.js';
import type { SponsorAccess } from '@quiz-app/validation';
import type { CreateSponsorInput, UpdateSponsorInput } from './sponsors.schemas.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function storagePublicBase(): string {
  return (process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:3000/uploads').replace(/\/+$/, '');
}

export const sponsorsService = {
  async create(input: CreateSponsorInput) {
    const slug = input.slug ?? slugify(input.name);
    const existing = await prisma.sponsor.findUnique({ where: { slug } });
    if (existing) throw new AppError('Sponsor slug already exists', 409, 'SPONSOR_SLUG_EXISTS');

    return prisma.sponsor.create({
      data: {
        slug,
        name: input.name,
        brandColorPrimary: input.brandColorPrimary ?? null,
        brandColorSecondary: input.brandColorSecondary ?? null,
        contactEmail: input.contactEmail ?? null,
        contractTerms: input.contractTerms ?? null,
        ...(input.metadata !== undefined
          ? {
              metadata:
                input.metadata === null
                  ? Prisma.JsonNull
                  : (input.metadata as Prisma.InputJsonValue),
            }
          : {}),
        active: true,
      },
    });
  },

  /** Bloc « Accès » de la fiche sponsor (C4) : comptes sponsor actifs et invitations en attente. */
  async getAccess(slug: string): Promise<SponsorAccess> {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug }, select: { id: true } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    const [users, invitations] = await Promise.all([
      prisma.user.findMany({
        where: { sponsorId: sponsor.id, role: 'sponsor', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invitation.findMany({
        where: { sponsorId: sponsor.id, status: 'pending', expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      users: users.map((u) => ({
        id: u.id.toString(),
        email: u.email,
        displayName: u.displayName,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      invitations: invitations.map((i) => ({
        id: i.id.toString(),
        email: i.email,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  },

  /**
   * Révoque l'accès d'un contact sponsor (C4) : il perd le rôle sponsor (redevient `player`,
   * sans sponsor). L'effet est immédiat, le rôle étant relu en base à chaque requête.
   */
  async revokeUserAccess(slug: string, userId: bigint): Promise<void> {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug }, select: { id: true } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    const res = await prisma.user.updateMany({
      where: { id: userId, sponsorId: sponsor.id, role: 'sponsor' },
      data: { role: 'player', sponsorId: null, magicLinkToken: null, magicLinkExpiresAt: null },
    });
    if (res.count === 0) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  },

  async getBySlug(slug: string) {
    const sponsor = await prisma.sponsor.findUnique({
      where: { slug },
      include: { _count: { select: { quizzes: true } } },
    });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    return sponsor;
  },

  async update(slug: string, input: UpdateSponsorInput) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');

    const data: Prisma.SponsorUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.brandColorPrimary !== undefined)
      data.brandColorPrimary = input.brandColorPrimary ?? null;
    if (input.brandColorSecondary !== undefined)
      data.brandColorSecondary = input.brandColorSecondary ?? null;
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail ?? null;
    if (input.contractTerms !== undefined) data.contractTerms = input.contractTerms ?? null;
    if (input.metadata !== undefined) {
      data.metadata =
        input.metadata === null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonValue);
    }

    return prisma.sponsor.update({
      where: { id: sponsor.id },
      data,
    });
  },

  async deactivate(slug: string) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    return prisma.sponsor.update({ where: { id: sponsor.id }, data: { active: false } });
  },

  async activate(slug: string) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    return prisma.sponsor.update({ where: { id: sponsor.id }, data: { active: true } });
  },

  async list(filters: {
    active?: boolean | undefined;
    search?: string | undefined;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.active !== undefined) where.active = filters.active;
    if (filters.search) where.name = { contains: filters.search };

    const [items, total] = await Promise.all([
      prisma.sponsor.findMany({
        where,
        include: { _count: { select: { quizzes: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.sponsor.count({ where }),
    ]);

    return { items, total, page: filters.page, limit: filters.limit };
  },

  async setLogo(slug: string, _key: string, url: string) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    return prisma.sponsor.update({
      where: { id: sponsor.id },
      data: { logoUrl: url },
    });
  },

  async removeLogo(slug: string, storage: StorageProvider) {
    const sponsor = await prisma.sponsor.findUnique({ where: { slug } });
    if (!sponsor) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
    const base = storagePublicBase();
    const key = extractKeyFromPublicUrl(sponsor.logoUrl, base);
    if (key) await storage.delete(key);
    return prisma.sponsor.update({
      where: { id: sponsor.id },
      data: { logoUrl: null },
    });
  },
};
