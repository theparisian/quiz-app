import { z } from 'zod';

// ─── Campagnes, diffusions, relevés (C3) ─────────────────
// Tous les montants sont des entiers en centimes d'euro.

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'ended'] as const;
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export type CampaignStatusValue = z.infer<typeof campaignStatusSchema>;

export const CAMPAIGN_PRICINGS = ['per_session', 'per_participant'] as const;
export const campaignPricingSchema = z.enum(CAMPAIGN_PRICINGS);
export type CampaignPricingValue = z.infer<typeof campaignPricingSchema>;

/**
 * Raisons pour lesquelles une diffusion n'est pas facturable, dans l'ordre où elles sont
 * vérifiées (la première qui s'applique est retenue).
 */
export const NON_BILLABLE_REASONS = [
  'no_proof',
  'too_few_players',
  'daily_cap',
  'campaign_cap',
] as const;
export const nonBillableReasonSchema = z.enum(NON_BILLABLE_REASONS);
export type NonBillableReason = z.infer<typeof nonBillableReasonSchema>;

/** Participants minimum pour qu'une diffusion soit facturable. */
export const MIN_BILLABLE_PARTICIPANTS = 3;

/** Plafond par salle et par jour appliqué quand la campagne n'en précise pas à la création. */
export const DEFAULT_MAX_SESSIONS_PER_SCREEN_PER_DAY = 3;

/** Prix unitaire maximal accepté (100 000 €), garde-fou de saisie. */
export const MAX_UNIT_PRICE_CENTS = 10_000_000;

/** Entrées maximales saisissables pour une séance. */
export const MAX_SESSION_ATTENDANCE = 2000;

const isoDateSchema = z.string().datetime({ offset: true });

const campaignFieldsSchema = z.object({
  name: z.string().trim().min(2).max(255),
  startsAt: isoDateSchema,
  endsAt: isoDateSchema,
  pricing: campaignPricingSchema,
  unitPriceCents: z.number().int().min(0).max(MAX_UNIT_PRICE_CENTS),
  cinemaSharePercent: z.number().int().min(0).max(100),
  maxSessions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  maxSessionsPerScreenPerDay: z.number().int().min(1).max(100).nullable().optional(),
  emailSharingEnabled: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const datesInOrder = (b: { startsAt?: string | undefined; endsAt?: string | undefined }) =>
  b.startsAt === undefined ||
  b.endsAt === undefined ||
  new Date(b.endsAt).getTime() > new Date(b.startsAt).getTime();

/** POST /api/campaigns : campagne créée en brouillon. */
export const createCampaignBodySchema = campaignFieldsSchema
  .extend({
    sponsorSlug: z.string().min(1).max(100),
    gameSlug: z.string().min(1).max(100),
  })
  .refine(datesInOrder, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
export type CreateCampaignBody = z.infer<typeof createCampaignBodySchema>;

/** PATCH /api/campaigns/:id : le sponsor et le jeu ne changent pas. */
export const updateCampaignBodySchema = campaignFieldsSchema
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'At least one field is required',
  })
  .refine(datesInOrder, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
export type UpdateCampaignBody = z.infer<typeof updateCampaignBodySchema>;

/** GET /api/campaigns */
export const listCampaignsQuerySchema = z.object({
  sponsorSlug: z.string().min(1).max(100).optional(),
  gameSlug: z.string().min(1).max(100).optional(),
  status: campaignStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;

/** GET /api/campaigns/:id/deliveries */
export const listDeliveriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;

export const campaignTotalsSchema = z.object({
  deliveries: z.number().int(),
  billableDeliveries: z.number().int(),
  participants: z.number().int(),
  amountCents: z.number().int(),
  cinemaShareCents: z.number().int(),
});
export type CampaignTotals = z.infer<typeof campaignTotalsSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  sponsor: z.object({ slug: z.string(), name: z.string() }),
  game: z.object({ slug: z.string(), title: z.string() }),
  name: z.string(),
  status: campaignStatusSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  pricing: campaignPricingSchema,
  unitPriceCents: z.number().int(),
  cinemaSharePercent: z.number().int(),
  maxSessions: z.number().int().nullable(),
  maxSessionsPerScreenPerDay: z.number().int().nullable(),
  emailSharingEnabled: z.boolean(),
  notes: z.string().nullable(),
  totals: campaignTotalsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const campaignListResponseSchema = z.object({
  items: z.array(campaignSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;

export const deliverySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  sessionId: z.string(),
  sessionCode: z.string(),
  roundId: z.string(),
  screen: z.object({ id: z.string(), name: z.string() }),
  cinema: z.object({ slug: z.string(), name: z.string() }),
  playedAt: z.string(),
  proofDisplayedAt: z.string().nullable(),
  participants: z.number().int(),
  finishers: z.number().int(),
  prizesIssued: z.number().int(),
  attendance: z.number().int().nullable(),
  billable: z.boolean(),
  nonBillableReason: z.string().nullable(),
  amountCents: z.number().int(),
  cinemaShareCents: z.number().int(),
});
export type Delivery = z.infer<typeof deliverySchema>;

export const deliveryListResponseSchema = z.object({
  items: z.array(deliverySchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type DeliveryListResponse = z.infer<typeof deliveryListResponseSchema>;

/** GET /api/cinemas/:slug/statement(.csv)?month=YYYY-MM (mois civil, heure de Paris). */
export const statementQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export type StatementQuery = z.infer<typeof statementQuerySchema>;

/** Ligne du relevé : une manche sponsorisée diffusée dans une séance. */
export const statementLineSchema = z.object({
  deliveryId: z.string(),
  sessionId: z.string(),
  sessionCode: z.string(),
  playedAt: z.string(),
  screenName: z.string(),
  gameTitle: z.string(),
  sponsorName: z.string(),
  campaignName: z.string(),
  pricing: campaignPricingSchema,
  participants: z.number().int(),
  finishers: z.number().int(),
  attendance: z.number().int().nullable(),
  billable: z.boolean(),
  nonBillableReason: z.string().nullable(),
  amountCents: z.number().int(),
  cinemaShareCents: z.number().int(),
});
export type StatementLine = z.infer<typeof statementLineSchema>;

export const statementSchema = z.object({
  cinema: z.object({ slug: z.string(), name: z.string() }),
  month: z.string(),
  lines: z.array(statementLineSchema),
  totals: z.object({
    deliveries: z.number().int(),
    billableDeliveries: z.number().int(),
    participants: z.number().int(),
    amountCents: z.number().int(),
    cinemaShareCents: z.number().int(),
  }),
});
export type Statement = z.infer<typeof statementSchema>;

/** PATCH /api/sessions/:id/attendance */
export const sessionAttendanceBodySchema = z.object({
  attendance: z.number().int().min(0).max(MAX_SESSION_ATTENDANCE),
});
export type SessionAttendanceBody = z.infer<typeof sessionAttendanceBodySchema>;

/** Ce que rapporte au cinéma un jeu du catalogue sous campagne active (part du cinéma). */
export const catalogRevenueSchema = z.object({
  pricing: campaignPricingSchema,
  cinemaAmountCents: z.number().int().nonnegative(),
});
export type CatalogRevenue = z.infer<typeof catalogRevenueSchema>;

/** Part du cinéma : arrondi à l'entier le plus proche de amount × pourcentage / 100. */
export function cinemaShareOf(amountCents: number, cinemaSharePercent: number): number {
  return Math.round((amountCents * cinemaSharePercent) / 100);
}

/** Montant en euros à la française : « 1 234,50 € » (espaces insécables). */
export function formatEuroCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rest}\u00a0€`;
}

/** Libellés des raisons de non-facturation (interfaces cinéma et super-admin). */
export const NON_BILLABLE_REASON_LABELS: Record<NonBillableReason, string> = {
  no_proof: 'Diffusion non confirmée par l’écran',
  too_few_players: `Moins de ${MIN_BILLABLE_PARTICIPANTS} participants`,
  daily_cap: 'Plafond journalier de la salle atteint',
  campaign_cap: 'Plafond de la campagne atteint',
};

export function nonBillableReasonLabel(reason: string | null): string {
  if (!reason) return '';
  return (NON_BILLABLE_REASON_LABELS as Record<string, string>)[reason] ?? reason;
}

/** Mois civil parisien (`YYYY-MM`) contenant `at`. */
export function parisMonthOf(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(at).slice(0, 7);
}
