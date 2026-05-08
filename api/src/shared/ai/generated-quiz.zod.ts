import { z } from 'zod';

const generatedAnswerSchema = z.object({
  position: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(1).max(500),
  isCorrect: z.boolean(),
});

const generatedQuestionSchema = z
  .object({
    text: z.string().min(1).max(2000),
    imageUrl: z.string().url().nullable().optional(),
    timeLimitSeconds: z.number().int().min(5).max(120),
    pointsMax: z.number().int().min(100).max(10000),
    pointsFloor: z.number().int().min(0).max(9999),
    explanation: z.string().max(500).nullable().optional(),
    answers: z.array(generatedAnswerSchema).length(4),
  })
  .refine((q) => q.pointsFloor < q.pointsMax)
  .refine((q) => q.answers.filter((a) => a.isCorrect).length === 1)
  .refine((q) => new Set(q.answers.map((a) => a.position)).size === 4);

export const generatedQuizPayloadSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(3).max(15),
});

export type GeneratedQuestionPayload = z.infer<typeof generatedQuestionSchema>;
export type GeneratedQuizPayload = z.infer<typeof generatedQuizPayloadSchema>;
