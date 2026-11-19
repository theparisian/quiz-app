import { z } from 'zod';

// ─── Consentements email (C5) ────────────────────────────
// La plateforme collecte et conserve. Rien n'est transmis à un cinéma ou à un sponsor sans
// accord enregistré (cinéma : `emailSharingEnabled` du cinéma ; sponsor : celui d'une campagne)
// ET case cochée par le joueur. Les exports sont réservés au super_admin.

/**
 * Rétention des contacts : un contact n'est jamais supprimé (preuve du consentement), mais sans
 * activité depuis ce nombre d'années il sort de toutes les listes et de tous les exports. Toute
 * nouvelle activité (consentement donné ou réactivé, email saisi pour un lot) relance le délai.
 */
export const CONTACT_INACTIVITY_YEARS = 3;

/** Date avant laquelle la dernière activité d'un contact le rend inactif. */
export function contactInactivityCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - CONTACT_INACTIVITY_YEARS);
  return cutoff;
}

/**
 * Email saisi pour un lot sans case facultative cochée : effacé de `players` ce nombre de jours
 * après la fin de la séance, sauf si l'adresse a un consentement actif.
 */
export const PRIZE_EMAIL_RETENTION_DAYS = 90;

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

/**
 * GET /api/contacts/stats (super_admin) : consentements actifs par périmètre (contacts actifs
 * depuis moins de CONTACT_INACTIVITY_YEARS ans et non désinscrits).
 */
export const contactsStatsResponseSchema = z.object({
  contacts: z.number().int(),
  unsubscribed: z.number().int(),
  /** Contacts sans activité depuis CONTACT_INACTIVITY_YEARS ans (exclus des exports et comptes). */
  inactive: z.number().int(),
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
