import { z } from 'zod';

export const createScreenSchema = z.object({
  name: z.string().min(1).max(100),
  capacity: z.number().int().min(1).optional(),
});

export const updateScreenSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().min(1).nullable().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).optional(),
});

export type CreateScreenInput = z.infer<typeof createScreenSchema>;
export type UpdateScreenInput = z.infer<typeof updateScreenSchema>;
