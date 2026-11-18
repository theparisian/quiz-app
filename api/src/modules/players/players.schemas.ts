import { z } from 'zod';
import { sessionJoinTokenSchema } from '@quiz-app/validation';

export const PSEUDO_MIN_LENGTH = 2;
export const PSEUDO_MAX_LENGTH = 30;

export const pseudoRegex = /^[\p{L}\p{N} _.-]+$/u;

export const pseudoSourceSchema = z.enum(['SUGGESTED', 'CUSTOM']);

/** Rejoindre par code à 4 chiffres OU par jeton du QR : exactement l'un des deux. */
export const joinSessionSchema = z
  .object({
    sessionSlugShort: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    joinToken: sessionJoinTokenSchema.optional(),
    pseudo: z
      .string()
      .min(PSEUDO_MIN_LENGTH)
      .max(PSEUDO_MAX_LENGTH)
      .regex(pseudoRegex, 'Pseudo contains invalid characters'),
    pseudoSource: pseudoSourceSchema.optional(),
    avatarId: z.string().min(1).optional(),
  })
  .refine((d) => (d.sessionSlugShort === undefined) !== (d.joinToken === undefined), {
    message: 'Provide exactly one of sessionSlugShort or joinToken',
    path: ['joinToken'],
  });

export const updateEmailSchema = z.object({
  email: z.string().email(),
  consent: z.boolean(),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
