import { z } from 'zod';
export {
  generatedQuizPayloadSchema,
  type GeneratedQuizPayload,
  type GeneratedQuestionPayload,
} from '../../shared/ai/generated-quiz.zod.js';

export const generateQuizInputSchema = z.object({
  sourceText: z.string().min(50).max(50000),
  numQuestions: z.number().int().min(3).max(15),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tone: z.enum(['serious', 'casual', 'humorous']),
  language: z.enum(['fr', 'en']),
  contextHint: z.string().max(500).nullable().optional(),
  includeExplanations: z.boolean(),
  type: z.enum(['standard', 'sponsored', 'custom']),
  imageUrls: z.array(z.string().url()).max(5).default([]),
  model: z.enum(['claude-sonnet-4-6', 'claude-opus-4-7']).default('claude-sonnet-4-6'),
});

export type GenerateQuizRouteInput = z.infer<typeof generateQuizInputSchema>;

const aiStatusSchema = z.enum(['success', 'failed', 'partial']);

export const listGenerationsQuerySchema = z
  .object({
    userId: z.string().optional(),
    status: z.union([aiStatusSchema, z.array(aiStatusSchema)]).optional(),
    model: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    userId: v.userId,
    status: v.status === undefined ? undefined : Array.isArray(v.status) ? v.status : [v.status],
    model: v.model,
    search: v.search,
    page: v.page ?? 1,
    limit: v.limit ?? 20,
  }));

export type ListGenerationsQuery = z.infer<typeof listGenerationsQuerySchema>;

export const usageStatsQuerySchema = z.object({
  since: z.string().datetime().optional(),
});
