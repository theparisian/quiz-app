import { z } from 'zod';
import { campaignStatusSchema } from './campaigns';

// ─── Portail sponsor (C4) ────────────────────────────────
// Lecture seule, chiffres agrégés uniquement : jamais de pseudo ni d'email de joueur.

const parisDaySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

/** GET /api/sponsor-portal/campaigns : `sponsorSlug` ne sert qu'au super_admin. */
export const sponsorPortalListQuerySchema = z.object({
  sponsorSlug: z.string().min(1).max(100).optional(),
});
export type SponsorPortalListQuery = z.infer<typeof sponsorPortalListQuerySchema>;

/**
 * GET /api/sponsor-portal/campaigns/:id(.csv)?from=&to= : jours civils de Paris (`YYYY-MM-DD`),
 * bornes incluses. Sans borne : toute la campagne.
 */
export const sponsorPortalPeriodQuerySchema = z
  .object({
    from: parisDaySchema.optional(),
    to: parisDaySchema.optional(),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: 'from must be before to',
    path: ['to'],
  });
export type SponsorPortalPeriodQuery = z.infer<typeof sponsorPortalPeriodQuerySchema>;

export const sponsorPortalCampaignTotalsSchema = z.object({
  sessionsPlayed: z.number().int(),
  participants: z.number().int(),
  prizesIssued: z.number().int(),
  amountCents: z.number().int(),
});
export type SponsorPortalCampaignTotals = z.infer<typeof sponsorPortalCampaignTotalsSchema>;

export const sponsorPortalCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: campaignStatusSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  sponsor: z.object({ slug: z.string(), name: z.string() }),
  game: z.object({ title: z.string() }),
  totals: sponsorPortalCampaignTotalsSchema,
});
export type SponsorPortalCampaign = z.infer<typeof sponsorPortalCampaignSchema>;

export const sponsorPortalCampaignListSchema = z.object({
  items: z.array(sponsorPortalCampaignSchema),
});
export type SponsorPortalCampaignList = z.infer<typeof sponsorPortalCampaignListSchema>;

/** Une séance diffusée = une diffusion (manche sponsorisée terminée, C3). */
export const sponsorPortalDaySchema = z.object({
  day: z.string(),
  sessions: z.number().int(),
  participants: z.number().int(),
});

export const sponsorPortalCinemaSchema = z.object({
  cinemaName: z.string(),
  city: z.string().nullable(),
  sessions: z.number().int(),
  participants: z.number().int(),
});

export const sponsorCampaignStatsSchema = z.object({
  campaign: sponsorPortalCampaignSchema.omit({ totals: true }),
  period: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  sessionsPlayed: z.number().int(),
  billableSessions: z.number().int(),
  participants: z.number().int(),
  finishers: z.number().int(),
  /** finishers / participants, null sans participant. */
  completionRate: z.number().nullable(),
  prizesIssued: z.number().int(),
  /** Lots utilisés ; null quand l'information n'est pas connue. */
  prizesRedeemed: z.number().int().nullable(),
  /** Séances dont les entrées ont été saisies par le cinéma. */
  attendanceKnownSessions: z.number().int(),
  attendanceTotal: z.number().int(),
  /** participants / entrées, sur les seules séances dont les entrées sont connues. */
  participationRate: z.number().nullable(),
  amountCents: z.number().int(),
  byDay: z.array(sponsorPortalDaySchema),
  byCinema: z.array(sponsorPortalCinemaSchema),
});
export type SponsorCampaignStats = z.infer<typeof sponsorCampaignStatsSchema>;

/** POST /api/sponsors/:slug/invitations (super_admin) : inviter un contact du sponsor. */
export const sponsorInvitationBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});
export type SponsorInvitationBody = z.infer<typeof sponsorInvitationBodySchema>;

/** GET /api/sponsors/:slug/access (super_admin) : comptes et invitations en attente. */
export const sponsorAccessSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      email: z.string().nullable(),
      displayName: z.string().nullable(),
      lastLoginAt: z.string().nullable(),
    }),
  ),
  invitations: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      createdAt: z.string(),
      expiresAt: z.string(),
    }),
  ),
});
export type SponsorAccess = z.infer<typeof sponsorAccessSchema>;

/** Taux (0..1) en pourcentage à la française, « — » si inconnu. */
export function formatRatePercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}
