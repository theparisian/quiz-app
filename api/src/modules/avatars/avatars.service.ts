import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { extractKeyFromPublicUrl } from '../../shared/storage/storage-url.js';
import type { StorageProvider } from '../../shared/storage/storage-provider.js';
import type { CreateAvatarLibraryInput, UpdateAvatarLibraryInput } from './avatars.schemas.js';

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

async function allocateUniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'avatars';
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const exists = await prisma.avatarLibrary.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

export const avatarsService = {
  async list(filters: { active?: boolean | undefined }) {
    const where = filters.active === undefined ? {} : { isActive: filters.active };
    return prisma.avatarLibrary.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { avatars: true, quizzes: true } } },
    });
  },

  async getBySlug(slug: string) {
    const library = await prisma.avatarLibrary.findUnique({
      where: { slug },
      include: {
        avatars: { orderBy: { position: 'asc' } },
        _count: { select: { quizzes: true } },
      },
    });
    if (!library) throw new AppError('Avatar library not found', 404, 'AVATAR_LIBRARY_NOT_FOUND');
    return library;
  },

  async create(input: CreateAvatarLibraryInput) {
    const slug = await allocateUniqueSlug(input.slug ?? input.name);
    return prisma.avatarLibrary.create({
      data: {
        slug,
        name: input.name,
        description: input.description ?? null,
        isActive: true,
      },
    });
  },

  async update(slug: string, input: UpdateAvatarLibraryInput) {
    const library = await prisma.avatarLibrary.findUnique({ where: { slug } });
    if (!library) throw new AppError('Avatar library not found', 404, 'AVATAR_LIBRARY_NOT_FOUND');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description ?? null;
    return prisma.avatarLibrary.update({ where: { id: library.id }, data });
  },

  async setActive(slug: string, isActive: boolean) {
    const library = await prisma.avatarLibrary.findUnique({ where: { slug } });
    if (!library) throw new AppError('Avatar library not found', 404, 'AVATAR_LIBRARY_NOT_FOUND');
    return prisma.avatarLibrary.update({ where: { id: library.id }, data: { isActive } });
  },

  async delete(slug: string, storage: StorageProvider) {
    const library = await prisma.avatarLibrary.findUnique({
      where: { slug },
      include: { avatars: true, _count: { select: { quizzes: true } } },
    });
    if (!library) throw new AppError('Avatar library not found', 404, 'AVATAR_LIBRARY_NOT_FOUND');
    if (library._count.quizzes > 0) {
      throw new AppError('Library is used by quizzes', 409, 'AVATAR_LIBRARY_IN_USE');
    }
    const base = storagePublicBase();
    for (const a of library.avatars) {
      const key = a.imageKey || extractKeyFromPublicUrl(a.imageUrl, base);
      if (key) await storage.delete(key).catch(() => {});
    }
    await prisma.avatarLibrary.delete({ where: { id: library.id } });
  },

  async addAvatar(
    slug: string,
    params: { imageUrl: string; imageKey: string; label?: string | null },
  ) {
    const library = await prisma.avatarLibrary.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!library) throw new AppError('Avatar library not found', 404, 'AVATAR_LIBRARY_NOT_FOUND');
    const last = await prisma.avatar.findFirst({
      where: { libraryId: library.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;
    return prisma.avatar.create({
      data: {
        libraryId: library.id,
        imageUrl: params.imageUrl,
        imageKey: params.imageKey,
        label: params.label ?? null,
        position,
      },
    });
  },

  async removeAvatar(slug: string, avatarId: bigint, storage: StorageProvider) {
    const library = await prisma.avatarLibrary.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!library) throw new AppError('Avatar library not found', 404, 'AVATAR_LIBRARY_NOT_FOUND');
    const avatar = await prisma.avatar.findFirst({
      where: { id: avatarId, libraryId: library.id },
    });
    if (!avatar) throw new AppError('Avatar not found', 404, 'AVATAR_NOT_FOUND');
    const base = storagePublicBase();
    const key = avatar.imageKey || extractKeyFromPublicUrl(avatar.imageUrl, base);
    if (key) await storage.delete(key).catch(() => {});
    await prisma.avatar.delete({ where: { id: avatar.id } });
  },

  async reorder(slug: string, orderedIds: string[]) {
    const library = await prisma.avatarLibrary.findUnique({
      where: { slug },
      include: { avatars: { select: { id: true } } },
    });
    if (!library) throw new AppError('Avatar library not found', 404, 'AVATAR_LIBRARY_NOT_FOUND');
    const known = new Set(library.avatars.map((a) => a.id.toString()));
    await prisma.$transaction(
      orderedIds
        .filter((id) => known.has(id))
        .map((id, index) =>
          prisma.avatar.update({ where: { id: BigInt(id) }, data: { position: index } }),
        ),
    );
  },
};
