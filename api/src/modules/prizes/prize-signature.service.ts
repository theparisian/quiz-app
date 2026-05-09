import crypto from 'crypto';

function getPrizeHmacSecret(): string {
  const s = process.env.PRIZE_HMAC_SECRET?.trim();
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PRIZE_HMAC_SECRET is required in production (min 32 characters)');
  }
  /* Dev / test : fallback local uniquement (jamais en prod — cf. validatePrizeEnvironment). */
  return s ?? 'local-dev-prize-hmac-secret-32chars-min!';
}

export function signPrize(redeemCode: string): string {
  return crypto.createHmac('sha256', getPrizeHmacSecret()).update(redeemCode).digest('hex');
}

/** Compare la signature fournie au HMAC attendu (timing-safe). Retourne false si format invalide. */
export function verifyPrizeSignature(redeemCode: string, signature: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const sigNorm = signature.toLowerCase();
  const expected = signPrize(redeemCode);
  const a = Buffer.from(sigNorm, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
