import { z } from 'zod';
import {
  prizeConfigEntrySchema,
  prizesConfigSchema,
  quizPrizesConfigSchema,
  superPrizeConfigSchema,
  createPrizeTemplateBodySchema,
  updatePrizeTemplateBodySchema,
  updateQuizPrizesConfigBodySchema,
  updateSuperPrizeConfigBodySchema,
  staffPinBodySchema,
  prizeRedeemBodySchema,
  prizeLookupBodySchema,
  prizeRedeemQuerySchema,
  type PrizeConfigEntry,
  type PrizesConfig,
  type QuizPrizesConfig,
  type SuperPrizeConfig,
  type PrizeRedeemStatus,
} from '@quiz-app/validation';

export {
  prizeConfigEntrySchema,
  prizesConfigSchema,
  quizPrizesConfigSchema,
  superPrizeConfigSchema,
  createPrizeTemplateBodySchema,
  updatePrizeTemplateBodySchema,
  updateQuizPrizesConfigBodySchema,
  updateSuperPrizeConfigBodySchema,
  staffPinBodySchema,
  prizeRedeemBodySchema,
  prizeLookupBodySchema,
  prizeRedeemQuerySchema,
  type PrizeConfigEntry,
  type PrizesConfig,
  type QuizPrizesConfig,
  type SuperPrizeConfig,
  type PrizeRedeemStatus,
};

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
  kind: z.enum(['podium', 'consolation']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
});

export type ListPrizesQuery = z.infer<typeof listPrizesQuerySchema>;
