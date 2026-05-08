import { z } from 'zod';

export const pingSchema = z.object({
  timestamp: z.string().datetime(),
});

export const pongSchema = z.object({
  timestamp: z.string().datetime(),
  serverTime: z.string().datetime(),
});

export type PingPayload = z.infer<typeof pingSchema>;
export type PongPayload = z.infer<typeof pongSchema>;
