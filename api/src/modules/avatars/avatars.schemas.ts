import { z } from 'zod';

export const createAvatarLibrarySchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const updateAvatarLibrarySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const reorderAvatarsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const listAvatarLibrariesQuerySchema = z
  .object({
    active: z
      .union([z.literal('true'), z.literal('false')])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
  })
  .optional()
  .transform((v) => v ?? {});

export type CreateAvatarLibraryInput = z.infer<typeof createAvatarLibrarySchema>;
export type UpdateAvatarLibraryInput = z.infer<typeof updateAvatarLibrarySchema>;
export type ReorderAvatarsInput = z.infer<typeof reorderAvatarsSchema>;
