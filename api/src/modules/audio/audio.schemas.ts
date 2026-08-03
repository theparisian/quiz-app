import { z } from 'zod';
import { SOUND_KINDS } from '@quiz-app/validation';

export const createSoundLibrarySchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const updateSoundLibrarySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const soundKindSchema = z.enum(SOUND_KINDS);

export const updateSoundSchema = z.object({
  label: z.string().min(1).max(150).optional(),
  kind: soundKindSchema.optional(),
});

export const reorderSoundsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const listSoundLibrariesQuerySchema = z
  .object({
    active: z.union([z.literal('true'), z.literal('false')]).optional(),
  })
  .optional()
  .transform((v) => ({
    active: v?.active === undefined ? undefined : v.active === 'true',
  }));

/** Champs texte accompagnant un upload multipart (donc reçus en string). */
export const uploadSoundFieldsSchema = z.object({
  label: z.string().min(1).max(150).optional(),
  kind: soundKindSchema.optional(),
});

export type CreateSoundLibraryInput = z.infer<typeof createSoundLibrarySchema>;
export type UpdateSoundLibraryInput = z.infer<typeof updateSoundLibrarySchema>;
export type UpdateSoundInput = z.infer<typeof updateSoundSchema>;
