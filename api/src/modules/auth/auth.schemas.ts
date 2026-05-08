import { z } from 'zod';

export const magicLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const magicLinkVerifySchema = z.object({
  token: z.string().min(1),
});

export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestSchema>;
export type MagicLinkVerifyInput = z.infer<typeof magicLinkVerifySchema>;
