import { z } from 'zod';

// ─── Consentements email (C5) ────────────────────────────
// La plateforme collecte et conserve. Rien n'est transmis à un cinéma ou à un sponsor sans
// accord enregistré (cinéma : `emailSharingEnabled` du cinéma ; sponsor : celui d'une campagne)
// ET case cochée par le joueur. Les exports sont réservés au super_admin.

/** Version des libellés des cases affichées au joueur, enregistrée avec chaque consentement. */
export const CONSENT_WORDING_VERSION = '2026-11';

export const CONSENT_SCOPES = ['platform', 'cinema', 'sponsor'] as const;
export const consentScopeSchema = z.enum(CONSENT_SCOPES);
export type ConsentScopeValue = z.infer<typeof consentScopeSchema>;

/**
 * PATCH /api/players/:id/email (seul schéma de cette route, réexporté par l'API).
 * `consent` = case obligatoire « recevoir mon lot » : le serveur refuse `false` avec
 * 400 CONSENT_REQUIRED. Les trois cases facultatives valent false par défaut.
 */
export const playerUpdateEmailBodySchema = z.object({
  email: z.string().email().max(255),
  consent: z.boolean(),
  optInPlatform: z.boolean().default(false),
  optInCinema: z.boolean().default(false),
  optInSponsor: z.boolean().default(false),
});
export type PlayerUpdateEmailBody = z.infer<typeof playerUpdateEmailBodySchema>;

/** GET /api/players/:id/consent-options : cases facultatives à montrer au joueur. */
export const consentOptionsResponseSchema = z.object({
  cinema: z.object({ name: z.string() }).nullable(),
  sponsor: z.object({ name: z.string() }).nullable(),
});
export type ConsentOptionsResponse = z.infer<typeof consentOptionsResponseSchema>;

/** PUT /api/cinemas/:slug/email-sharing (super_admin) : accord de partage avec le cinéma. */
export const emailSharingBodySchema = z.object({
  enabled: z.boolean(),
});
export type EmailSharingBody = z.infer<typeof emailSharingBodySchema>;

/** GET /api/contacts/export.csv (super_admin). */
export const contactsExportQuerySchema = z
  .object({
    scope: consentScopeSchema,
    cinemaSlug: z.string().min(1).max(100).optional(),
    sponsorSlug: z.string().min(1).max(100).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.scope === 'cinema' && !q.cinemaSlug) {
      ctx.addIssue({ code: 'custom', path: ['cinemaSlug'], message: 'cinemaSlug is required' });
    }
    if (q.scope === 'sponsor' && !q.sponsorSlug) {
      ctx.addIssue({ code: 'custom', path: ['sponsorSlug'], message: 'sponsorSlug is required' });
    }
  });
export type ContactsExportQuery = z.infer<typeof contactsExportQuerySchema>;

/** GET /api/contacts/stats (super_admin) : consentements actifs par périmètre. */
export const contactsStatsResponseSchema = z.object({
  contacts: z.number().int(),
  unsubscribed: z.number().int(),
  platform: z.number().int(),
  cinemas: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      emailSharingEnabled: z.boolean(),
      count: z.number().int(),
    }),
  ),
  sponsors: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      emailSharingEnabled: z.boolean(),
      count: z.number().int(),
    }),
  ),
});
export type ContactsStatsResponse = z.infer<typeof contactsStatsResponseSchema>;
