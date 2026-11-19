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

// ─── Lots retirés hors du cinéma (C5) ────────────────────
/**
 * Mode de retrait d'un lot : `staff_pin` (validation au comptoir avec le PIN du cinéma),
 * `code_pool` (un code unique fourni par la marque, attribué à chaque lot), `static_code`
 * (le même code pour tous). Les lots à code ne passent jamais par le PIN du comptoir.
 */
export const PRIZE_REDEEM_MODES = ['staff_pin', 'code_pool', 'static_code'] as const;
export const prizeRedeemModeSchema = z.enum(PRIZE_REDEEM_MODES);
export type PrizeRedeemMode = z.infer<typeof prizeRedeemModeSchema>;

/** Nombre maximal de codes par import (POST /api/prize-templates/:id/codes/import). */
export const MAX_PRIZE_CODES_PER_IMPORT = 10_000;
export const PRIZE_CODE_MAX_LENGTH = 100;

const httpUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: 'URL must start with http(s)://' });

const prizeRedeemFieldsSchema = z.object({
  redeemMode: prizeRedeemModeSchema.optional(),
  staticCode: z.string().trim().min(1).max(PRIZE_CODE_MAX_LENGTH).nullable().optional(),
  redeemInstructions: z.string().trim().max(2000).nullable().optional(),
  redeemUrl: httpUrlSchema.nullable().optional(),
});

export const createPrizeTemplateBodySchema = z
  .object({
    label: z.string().min(1).max(255),
    type: prizeTypeSchema,
    value: z.string().max(500).optional(),
    validityDays: z.number().int().min(1).max(3650).nullable().optional(),
    stock: z.number().int().min(0).nullable().optional(),
  })
  .merge(prizeRedeemFieldsSchema)
  .refine((b) => b.redeemMode !== 'static_code' || !!b.staticCode, {
    message: 'staticCode is required for static_code',
    path: ['staticCode'],
  });

export const updatePrizeTemplateBodySchema = z
  .object({
    label: z.string().min(1).max(255).optional(),
    type: prizeTypeSchema.optional(),
    value: z.string().max(500).optional(),
    validityDays: z.number().int().min(1).max(3650).nullable().optional(),
    stock: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .merge(prizeRedeemFieldsSchema);

/** POST /api/prize-templates/:id/codes/import : contenu CSV ou texte, un code par ligne. */
export const importPrizeCodesBodySchema = z.object({
  text: z.string().min(1).max(2_000_000),
});
export type ImportPrizeCodesBody = z.infer<typeof importPrizeCodesBodySchema>;

export const prizeCodesStatsSchema = z.object({
  total: z.number().int(),
  assigned: z.number().int(),
  remaining: z.number().int(),
});
export type PrizeCodesStats = z.infer<typeof prizeCodesStatsSchema>;

export const importPrizeCodesResponseSchema = prizeCodesStatsSchema.extend({
  imported: z.number().int(),
  duplicates: z.number().int(),
});
export type ImportPrizeCodesResponse = z.infer<typeof importPrizeCodesResponseSchema>;

/**
 * Codes d'un fichier CSV ou texte : un code par ligne (première colonne d'un CSV, guillemets
 * retirés), lignes vides et en-tête « code » ignorés, doublons du fichier retirés.
 * `lineCount` = lignes de codes lues (doublons compris).
 */
export function parsePrizeCodesText(text: string): { codes: string[]; lineCount: number } {
  const seen = new Set<string>();
  let lineCount = 0;
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((line, index) => {
    let cell = (line.split(/[,;\t]/)[0] ?? '').trim();
    if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
      cell = cell.slice(1, -1).replace(/""/g, '"').trim();
    }
    if (!cell) return;
    if (index === 0 && cell.toLowerCase() === 'code') return;
    lineCount += 1;
    seen.add(cell);
  });
  return { codes: [...seen], lineCount };
}

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
  /** C5 : lot à code (`code_pool`, `static_code`) = à présenter chez le partenaire, sans PIN. */
  redeemMode: prizeRedeemModeSchema,
  partnerCode: z.string().nullable(),
  partnerQrDataUrl: z.string().nullable(),
  redeemInstructions: z.string().nullable(),
  redeemUrl: z.string().nullable(),
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
