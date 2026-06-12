import { z } from 'zod';

export const prizeTypeSchema = z.enum(['discount_qr', 'video', 'other']);

export const prizeConfigEntrySchema = z.object({
  type: prizeTypeSchema,
  label: z.string().min(1).max(255),
  value: z.string().max(500).optional(),
});

export const prizesConfigSchema = z.object({
  rank1: prizeConfigEntrySchema.optional(),
  rank2: prizeConfigEntrySchema.optional(),
  rank3: prizeConfigEntrySchema.optional(),
  all: prizeConfigEntrySchema.optional(),
});

export const quizRankAssignmentSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('template'),
    templateId: z.string().min(1),
  }),
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('inherit') }),
]);

export const quizPrizesConfigSchema = z.object({
  rank1: quizRankAssignmentSchema.optional(),
  rank2: quizRankAssignmentSchema.optional(),
  rank3: quizRankAssignmentSchema.optional(),
  all: quizRankAssignmentSchema.optional(),
});

export const superPrizeConfigSchema = z.object({
  templateId: z.string().min(1),
  oddsOneIn: z.number().int().min(2).max(1000),
  enabled: z.boolean(),
});

export const createPrizeTemplateBodySchema = z.object({
  label: z.string().min(1).max(255),
  type: prizeTypeSchema,
  value: z.string().max(500).optional(),
  validityDays: z.number().int().min(1).max(3650).nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
});

export const updatePrizeTemplateBodySchema = z.object({
  label: z.string().min(1).max(255).optional(),
  type: prizeTypeSchema.optional(),
  value: z.string().max(500).optional(),
  validityDays: z.number().int().min(1).max(3650).nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateQuizPrizesConfigBodySchema = z.object({
  config: quizPrizesConfigSchema,
});

export const updateSuperPrizeConfigBodySchema = z.object({
  config: superPrizeConfigSchema.nullable(),
});

export const staffPinBodySchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
});

export const prizeRedeemQuerySchema = z.object({
  sig: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .transform((s) => s.toLowerCase()),
});

export const prizeRedeemBodySchema = z.object({
  sig: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .transform((s) => s.toLowerCase()),
  staffPin: z.string().regex(/^\d{4,6}$/),
  redeemedVia: z.enum(['qr', 'code']).default('qr'),
});

export const prizeLookupBodySchema = z.object({
  shortCode: z.string().min(6).max(10),
  staffPin: z.string().regex(/^\d{4,6}$/),
});

export const prizeRedeemStatusSchema = z.enum(['valid', 'redeemed', 'expired']);

export const prizeRedeemStatusResponseSchema = z.object({
  label: z.string(),
  type: prizeTypeSchema,
  cinemaName: z.string(),
  status: prizeRedeemStatusSchema,
  redeemedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  shortCode: z.string(),
  redeemCode: z.string().optional(),
  sig: z.string().optional(),
});

export type PrizeRedeemStatus = z.infer<typeof prizeRedeemStatusSchema>;
export type PrizeRedeemStatusResponse = z.infer<typeof prizeRedeemStatusResponseSchema>;

export type PrizeConfigEntry = z.infer<typeof prizeConfigEntrySchema>;
export type PrizesConfig = z.infer<typeof prizesConfigSchema>;
export type QuizPrizesConfig = z.infer<typeof quizPrizesConfigSchema>;
export type QuizRankAssignment = z.infer<typeof quizRankAssignmentSchema>;
export type SuperPrizeConfig = z.infer<typeof superPrizeConfigSchema>;

export const prizeRank1DisplaySchema = z.object({
  label: z.string(),
  isSuperPrize: z.boolean().optional(),
});

export const prizeRankDisplaySchema = z.object({
  label: z.string(),
});

export const sessionPrizesDisplaySchema = z.object({
  rank1: prizeRank1DisplaySchema.optional(),
  rank2: prizeRankDisplaySchema.optional(),
  rank3: prizeRankDisplaySchema.optional(),
  all: prizeRankDisplaySchema.optional(),
});

export type SessionPrizesDisplay = z.infer<typeof sessionPrizesDisplaySchema>;
