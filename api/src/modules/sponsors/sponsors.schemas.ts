import { z } from 'zod';

const slugRegex = /^[a-z0-9-]+$/;

export const createSponsorSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().regex(slugRegex, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  brandColorPrimary: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  brandColorSecondary: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  contactEmail: z.string().email().optional(),
  contractTerms: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateSponsorSchema = createSponsorSchema.partial().omit({ slug: true });

export const listSponsorsQuerySchema = z
  .object({
    active: z
      .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
      .optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    active:
      v.active === undefined ? undefined : v.active === 'true' || v.active === '1' ? true : false,
    search: v.search,
    page: v.page ?? 1,
    limit: v.limit ?? 20,
  }));

export type CreateSponsorInput = z.infer<typeof createSponsorSchema>;
export type UpdateSponsorInput = z.infer<typeof updateSponsorSchema>;
