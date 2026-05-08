import { z } from 'zod';

export const updateMeSchema = z.object({
  displayName: z.string().min(2).max(100),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
