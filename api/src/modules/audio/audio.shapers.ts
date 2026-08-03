import type { Sound, SoundLibrary } from '@prisma/client';

export interface ShapedSound {
  id: string;
  label: string;
  kind: string;
  audioUrl: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
  scope: 'library' | 'quiz';
  createdAt: string;
}

export function shapeSound(sound: Sound): ShapedSound {
  return {
    id: sound.id.toString(),
    label: sound.label,
    kind: sound.kind,
    audioUrl: sound.audioUrl,
    mimeType: sound.mimeType,
    sizeBytes: sound.sizeBytes,
    position: sound.position,
    scope: sound.quizId !== null ? 'quiz' : 'library',
    createdAt: sound.createdAt.toISOString(),
  };
}

export function shapeSoundLibrary(
  library: SoundLibrary & { sounds?: Sound[]; _count?: { sounds?: number } },
) {
  return {
    id: library.id.toString(),
    slug: library.slug,
    name: library.name,
    description: library.description,
    isActive: library.isActive,
    createdAt: library.createdAt.toISOString(),
    updatedAt: library.updatedAt.toISOString(),
    soundsCount: library._count?.sounds ?? library.sounds?.length,
    ...(library.sounds ? { sounds: library.sounds.map(shapeSound) } : {}),
  };
}
