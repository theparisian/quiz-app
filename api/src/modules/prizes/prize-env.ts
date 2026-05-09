/** Validation au démarrage : secret prizes obligatoire en production. */
export function validatePrizeEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const s = process.env.PRIZE_HMAC_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error('PRIZE_HMAC_SECRET is required in production (min 32 characters)');
  }
}
