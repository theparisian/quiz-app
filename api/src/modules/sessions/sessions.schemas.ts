import { z } from 'zod';

export const createSessionSchema = z.object({
  quizSlug: z.string().min(1),
  screenId: z.string().min(1),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const listSessionsQuerySchema = z
  .object({
    status: z.enum(['lobby', 'running', 'paused', 'ended', 'aborted']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((val) => ({
    status: val.status,
    page: val.page ?? 1,
    limit: val.limit ?? 20,
  }));

export type ListSessionsQuery = z.output<typeof listSessionsQuerySchema>;

export const abortSessionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type AbortSessionInput = z.infer<typeof abortSessionSchema>;
