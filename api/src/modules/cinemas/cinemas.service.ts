import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { CreateCinemaInput, UpdateCinemaInput } from './cinemas.schemas.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const cinemasService = {
  async create(input: CreateCinemaInput) {
    const slug = input.slug ?? slugify(input.name);

    const existing = await prisma.cinema.findUnique({ where: { slug } });
    if (existing)
      throw new AppError('A cinema with this slug already exists', 409, 'CINEMA_SLUG_EXISTS');

    return prisma.cinema.create({
      data: {
        slug,
        name: input.name,
        address: input.address ?? null,
        city: input.city ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? 'FR',
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        notes: input.notes ?? null,
      },
    });
  },

  async getBySlug(slug: string) {
    const cinema = await prisma.cinema.findUnique({
      where: { slug },
      include: {
        screens: {
          include: {
            nucs: true,
          },
          orderBy: { name: 'asc' },
        },
        _count: { select: { users: true, invitations: true } },
      },
    });
    if (!cinema || cinema.deletedAt)
      throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
    return cinema;
  },

  async update(slug: string, input: UpdateCinemaInput) {
    const cinema = await prisma.cinema.findUnique({ where: { slug } });
    if (!cinema || cinema.deletedAt)
      throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.address !== undefined) data.address = input.address ?? null;
    if (input.city !== undefined) data.city = input.city ?? null;
    if (input.postalCode !== undefined) data.postalCode = input.postalCode ?? null;
    if (input.country !== undefined) data.country = input.country;
    if (input.contactName !== undefined) data.contactName = input.contactName ?? null;
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail ?? null;
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    return prisma.cinema.update({
      where: { id: cinema.id },
      data,
    });
  },

  async archive(slug: string) {
    const cinema = await prisma.cinema.findUnique({ where: { slug } });
    if (!cinema || cinema.deletedAt)
      throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');

    return prisma.cinema.update({
      where: { id: cinema.id },
      data: { status: 'paused', deletedAt: new Date() },
    });
  },

  async list(filters: {
    status?: string | undefined;
    search?: string | undefined;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.name = { contains: filters.search };
    }

    const [items, total] = await Promise.all([
      prisma.cinema.findMany({
        where,
        include: {
          _count: { select: { screens: true, users: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.cinema.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id.toString(),
        slug: c.slug,
        name: c.name,
        city: c.city,
        status: c.status,
        screensCount: c._count.screens,
        usersCount: c._count.users,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page: filters.page,
      limit: filters.limit,
    };
  },
};
