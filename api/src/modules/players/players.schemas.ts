import { z } from 'zod';

export const PSEUDO_MIN_LENGTH = 2;
export const PSEUDO_MAX_LENGTH = 30;

export const pseudoRegex = /^[\p{L}\p{N} _.-]+$/u;

export const pseudoSourceSchema = z.enum(['SUGGESTED', 'CUSTOM']);

export const joinSessionSchema = z.object({
  sessionSlugShort: z.string().regex(/^\d{4}$/),
  pseudo: z
    .string()
    .min(PSEUDO_MIN_LENGTH)
    .max(PSEUDO_MAX_LENGTH)
    .regex(pseudoRegex, 'Pseudo contains invalid characters'),
  pseudoSource: pseudoSourceSchema.optional(),
});

export const updateEmailSchema = z.object({
  email: z.string().email(),
  consent: z.boolean(),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
