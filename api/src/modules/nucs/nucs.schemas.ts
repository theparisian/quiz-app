import { z } from 'zod';

export const createNucSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const updateNucSchema = z.object({
  status: z.enum(['online', 'offline', 'error', 'provisioning']).optional(),
});

export const heartbeatSchema = z.object({
  nucUid: z.string().min(1),
  authKey: z.string().min(1),
  appVersion: z.string().optional(),
  ip: z.string().optional(),
});

export type CreateNucInput = z.infer<typeof createNucSchema>;
export type UpdateNucInput = z.infer<typeof updateNucSchema>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
