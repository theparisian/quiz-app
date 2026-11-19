import {
  formatEuroCents,
  type CampaignPricingValue,
  type CampaignStatusValue,
} from '@quiz-app/validation';

/** Campagnes et relevés (C3) : libellés et conversions de l'interface super-admin. */

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatusValue, string> = {
  draft: 'Brouillon',
  active: 'Active',
  paused: 'En pause',
  ended: 'Terminée',
};

export const CAMPAIGN_STATUS_CLASS: Record<CampaignStatusValue, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  ended: 'bg-gray-200 text-gray-500',
};

export const PRICING_LABEL: Record<CampaignPricingValue, string> = {
  per_session: 'par séance',
  per_participant: 'par participant',
};

/** « 1,50 € par séance » */
export function priceLabel(cents: number, pricing: CampaignPricingValue): string {
  return `${formatEuroCents(cents)} ${PRICING_LABEL[pricing]}`;
}

/**
 * Saisie en euros (« 1,5 », « 1.50 », « 12 ») → centimes entiers ; null si invalide.
 * Deux décimales au plus, pas d'arrondi silencieux.
 */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [euros, dec = ''] = s.split('.') as [string, string?];
  return parseInt(euros, 10) * 100 + parseInt(dec.padEnd(2, '0') || '0', 10);
}

/** Centimes → saisie en euros (« 1,50 »). */
export function centsToEuroInput(cents: number): string {
  return `${Math.floor(cents / 100)},${(cents % 100).toString().padStart(2, '0')}`;
}

/** Messages des refus de l'API des campagnes. */
export function campaignErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'CAMPAIGN_OVERLAP':
      return 'Une autre campagne active couvre déjà ce jeu sur cette période.';
    case 'CAMPAIGN_INVALID_TRANSITION':
      return 'Ce changement d’état n’est pas possible.';
    case 'CAMPAIGN_EXPIRED':
      return 'La période de la campagne est terminée.';
    case 'CAMPAIGN_ENDED':
      return 'Une campagne terminée ne peut plus être modifiée.';
    case 'CAMPAIGN_HAS_DELIVERIES':
      return 'Cette campagne a des diffusions : terminez-la au lieu de la supprimer.';
    case 'CAMPAIGN_GAME_SPONSOR_MISMATCH':
      return 'Ce jeu n’est pas sponsorisé par ce sponsor.';
    case 'VALIDATION_ERROR':
      return 'Certains champs sont invalides. Vérifiez le formulaire.';
    default:
      return err instanceof Error ? err.message : 'Une erreur est survenue.';
  }
}

/** Téléchargement authentifié d'un fichier de l'API (CSV). */
export async function downloadApiFile(path: string, filename: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const res = await fetch(`${base}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
