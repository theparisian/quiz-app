import { z } from 'zod';

export const createCinemaSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(5).optional(),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  notes: z.string().optional(),
});

export const updateCinemaSchema = createCinemaSchema.partial().omit({ slug: true });

export const listCinemasQuerySchema = z
  .object({
    status: z.enum(['active', 'paused', 'trial']).optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    status: v.status,
    search: v.search,
    page: v.page ?? 1,
    limit: v.limit ?? 20,
  }));

export type CreateCinemaInput = z.infer<typeof createCinemaSchema>;
export type UpdateCinemaInput = z.infer<typeof updateCinemaSchema>;
