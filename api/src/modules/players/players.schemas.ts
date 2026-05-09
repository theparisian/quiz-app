import { z } from 'zod';

export const pseudoRegex = /^[\p{L}\p{N} _.-]+$/u;

export const joinSessionSchema = z.object({
  sessionSlugShort: z.string().regex(/^\d{4}$/),
  pseudo: z.string().min(2).max(30).regex(pseudoRegex, 'Pseudo contains invalid characters'),
});

export const updateEmailSchema = z.object({
  email: z.string().email(),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
