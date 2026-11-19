import type { PrizeRedeemMode } from '@quiz-app/validation';

/**
 * Lots retirés hors du cinéma (C5). Le mode de retrait et le code du partenaire sont figés
 * dans `prizes.payload_json` à l'attribution du lot (le gabarit peut changer ensuite).
 * Un lot sans `redeemMode` (tous les lots antérieurs à C5) est un lot `staff_pin`.
 */
export interface PrizeRedeemInfo {
  redeemMode: PrizeRedeemMode;
  partnerCode: string | null;
  redeemInstructions: string | null;
  redeemUrl: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function readPrizeRedeemInfo(payloadJson: unknown): PrizeRedeemInfo {
  const p = (payloadJson && typeof payloadJson === 'object' ? payloadJson : {}) as Record<
    string,
    unknown
  >;
  const mode = p.redeemMode;
  const redeemMode: PrizeRedeemMode =
    mode === 'code_pool' || mode === 'static_code' ? mode : 'staff_pin';
  if (redeemMode === 'staff_pin') {
    return { redeemMode, partnerCode: null, redeemInstructions: null, redeemUrl: null };
  }
  return {
    redeemMode,
    partnerCode: str(p.partnerCode),
    redeemInstructions: str(p.redeemInstructions),
    redeemUrl: str(p.redeemUrl),
  };
}

/** Lot à code (code_pool ou static_code) : jamais validé au comptoir par PIN. */
export function isCodePrize(payloadJson: unknown): boolean {
  return readPrizeRedeemInfo(payloadJson).redeemMode !== 'staff_pin';
}

/**
 * Lots utilisés d'un ensemble de lots, pour les rapports : null dès qu'un lot à code en fait
 * partie (son utilisation chez le partenaire n'est pas connue de la plateforme).
 */
export function countRedeemedOrNull(
  prizes: Array<{ redeemedAt: Date | null; payloadJson: unknown }>,
): number | null {
  if (prizes.some((p) => isCodePrize(p.payloadJson))) return null;
  return prizes.filter((p) => p.redeemedAt !== null).length;
}
