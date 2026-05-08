import { z } from 'zod';

export const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(['projectionist', 'cinema_admin']),
  cinemaId: z.string().min(1),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(2).max(100),
});

export const listInvitationsQuerySchema = z
  .object({
    status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
    cinemaId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    status: v.status,
    cinemaId: v.cinemaId,
    page: v.page ?? 1,
    limit: v.limit ?? 20,
  }));

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
