import { z } from 'zod';

export const prizeConfigEntrySchema = z.object({
  type: z.enum(['discount_qr', 'video', 'other']),
  label: z.string().min(1).max(255),
  value: z.string().max(500).optional(),
});

export const prizesConfigSchema = z.object({
  rank1: prizeConfigEntrySchema.optional(),
  rank2: prizeConfigEntrySchema.optional(),
  rank3: prizeConfigEntrySchema.optional(),
});

export type PrizeConfigEntry = z.infer<typeof prizeConfigEntrySchema>;
export type PrizesConfig = z.infer<typeof prizesConfigSchema>;

export const updatePrizesConfigBodySchema = z.object({
  config: prizesConfigSchema,
});

export const redeemBodySchema = z.object({
  signature: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .transform((s) => s.toLowerCase()),
});

export const listPrizesQuerySchema = z.object({
  status: z.enum(['sent', 'failed', 'redeemed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
});

export type ListPrizesQuery = z.infer<typeof listPrizesQuerySchema>;
