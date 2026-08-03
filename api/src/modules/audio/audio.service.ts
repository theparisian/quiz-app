import type { SoundKind } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { extractKeyFromPublicUrl } from '../../shared/storage/storage-url.js';
import type { StorageProvider } from '../../shared/storage/storage-provider.js';
import type {
  CreateSoundLibraryInput,
  UpdateSoundInput,
  UpdateSoundLibraryInput,
} from './audio.schemas.js';

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
  const root = slugify(base) || 'sons';
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const exists = await prisma.soundLibrary.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

async function deleteStoredFile(
  storage: StorageProvider,
  sound: { audioKey: string; audioUrl: string },
) {
  const key = sound.audioKey || extractKeyFromPublicUrl(sound.audioUrl, storagePublicBase());
  if (key) await storage.delete(key).catch(() => {});
}

async function nextPosition(where: { libraryId: bigint } | { quizId: bigint }): Promise<number> {
  const last = await prisma.sound.findFirst({
    where,
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

export interface AddSoundParams {
  audioUrl: string;
  audioKey: string;
  label: string;
  kind: SoundKind;
  mimeType: string;
  sizeBytes: number;
}

export const audioService = {
  async listLibraries(filters: { active?: boolean | undefined }) {
    const where = filters.active === undefined ? {} : { isActive: filters.active };
    return prisma.soundLibrary.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { sounds: true } } },
    });
  },

  async getLibraryBySlug(slug: string) {
    const library = await prisma.soundLibrary.findUnique({
      where: { slug },
      include: { sounds: { orderBy: [{ kind: 'asc' }, { position: 'asc' }] } },
    });
    if (!library) throw new AppError('Sound library not found', 404, 'SOUND_LIBRARY_NOT_FOUND');
    return library;
  },

  async createLibrary(input: CreateSoundLibraryInput) {
    const slug = await allocateUniqueSlug(input.slug ?? input.name);
    return prisma.soundLibrary.create({
      data: {
        slug,
        name: input.name,
        description: input.description ?? null,
        isActive: true,
      },
    });
  },

  async updateLibrary(slug: string, input: UpdateSoundLibraryInput) {
    const library = await prisma.soundLibrary.findUnique({ where: { slug } });
    if (!library) throw new AppError('Sound library not found', 404, 'SOUND_LIBRARY_NOT_FOUND');
    const data: { name?: string; description?: string | null } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description ?? null;
    return prisma.soundLibrary.update({ where: { id: library.id }, data });
  },

  async setLibraryActive(slug: string, isActive: boolean) {
    const library = await prisma.soundLibrary.findUnique({ where: { slug } });
    if (!library) throw new AppError('Sound library not found', 404, 'SOUND_LIBRARY_NOT_FOUND');
    return prisma.soundLibrary.update({ where: { id: library.id }, data: { isActive } });
  },

  async deleteLibrary(slug: string, storage: StorageProvider) {
    const library = await prisma.soundLibrary.findUnique({
      where: { slug },
      include: { sounds: true },
    });
    if (!library) throw new AppError('Sound library not found', 404, 'SOUND_LIBRARY_NOT_FOUND');
    for (const sound of library.sounds) {
      await deleteStoredFile(storage, sound);
    }
    await prisma.soundLibrary.delete({ where: { id: library.id } });
  },

  async addLibrarySound(slug: string, params: AddSoundParams) {
    const library = await prisma.soundLibrary.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!library) throw new AppError('Sound library not found', 404, 'SOUND_LIBRARY_NOT_FOUND');
    return prisma.sound.create({
      data: {
        libraryId: library.id,
        position: await nextPosition({ libraryId: library.id }),
        ...params,
      },
    });
  },

  async addQuizSound(quizId: bigint, params: AddSoundParams) {
    return prisma.sound.create({
      data: {
        quizId,
        position: await nextPosition({ quizId }),
        ...params,
      },
    });
  },

  async updateSound(soundId: bigint, input: UpdateSoundInput) {
    const sound = await prisma.sound.findUnique({ where: { id: soundId } });
    if (!sound) throw new AppError('Sound not found', 404, 'SOUND_NOT_FOUND');
    const data: { label?: string; kind?: SoundKind } = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.kind !== undefined) data.kind = input.kind;
    return prisma.sound.update({ where: { id: soundId }, data });
  },

  /**
   * Supprime un son. Les quiz qui le référençaient retombent silencieusement sur
   * le son intégré ou le silence : aucune session ne peut casser à cause d'un son manquant.
   */
  async removeSound(
    soundId: bigint,
    scope: { libraryId?: bigint; quizId?: bigint },
    storage: StorageProvider,
  ) {
    const sound = await prisma.sound.findUnique({ where: { id: soundId } });
    if (!sound) throw new AppError('Sound not found', 404, 'SOUND_NOT_FOUND');
    if (scope.libraryId !== undefined && sound.libraryId !== scope.libraryId) {
      throw new AppError('Sound not found', 404, 'SOUND_NOT_FOUND');
    }
    if (scope.quizId !== undefined && sound.quizId !== scope.quizId) {
      throw new AppError('Sound not found', 404, 'SOUND_NOT_FOUND');
    }
    await deleteStoredFile(storage, sound);
    await prisma.sound.delete({ where: { id: sound.id } });
  },

  async reorderLibrarySounds(slug: string, orderedIds: string[]) {
    const library = await prisma.soundLibrary.findUnique({
      where: { slug },
      include: { sounds: { select: { id: true } } },
    });
    if (!library) throw new AppError('Sound library not found', 404, 'SOUND_LIBRARY_NOT_FOUND');
    const known = new Set(library.sounds.map((s) => s.id.toString()));
    await prisma.$transaction(
      orderedIds
        .filter((id) => known.has(id))
        .map((id, index) =>
          prisma.sound.update({ where: { id: BigInt(id) }, data: { position: index } }),
        ),
    );
  },

  async listQuizSounds(quizId: bigint) {
    return prisma.sound.findMany({
      where: { quizId },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
    });
  },

  /**
   * Sons sélectionnables pour un quiz : bibliothèques actives + sons propres au quiz.
   */
  async listSelectableSounds(quizId: bigint) {
    const [libraries, quizSounds] = await Promise.all([
      prisma.soundLibrary.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: { sounds: { orderBy: [{ kind: 'asc' }, { position: 'asc' }] } },
      }),
      this.listQuizSounds(quizId),
    ]);
    return { libraries, quizSounds };
  },

  /**
   * Vérifie que chaque id référencé existe et est utilisable par ce quiz
   * (son de bibliothèque, ou son local à ce quiz — jamais celui d'un autre quiz).
   */
  async assertSoundIdsUsableByQuiz(quizId: bigint, soundIds: string[]): Promise<void> {
    const unique = [...new Set(soundIds)];
    if (unique.length === 0) return;

    let ids: bigint[];
    try {
      ids = unique.map((id) => BigInt(id));
    } catch {
      throw new AppError('Invalid sound id', 400, 'INVALID_SOUND_ID');
    }

    const found = await prisma.sound.findMany({
      where: { id: { in: ids }, OR: [{ quizId: null }, { quizId }] },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new AppError('Unknown or unusable sound reference', 400, 'SOUND_NOT_USABLE');
    }
  },
};
