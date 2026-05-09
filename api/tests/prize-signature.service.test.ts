import crypto from 'crypto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { signPrize, verifyPrizeSignature } from '../src/modules/prizes/prize-signature.service.js';

describe('prize-signature.service', () => {
  const prev = process.env.PRIZE_HMAC_SECRET;

  beforeEach(() => {
    process.env.PRIZE_HMAC_SECRET = 'test-secret-exactly-32-chars-minimum!!';
  });

  afterEach(() => {
    process.env.PRIZE_HMAC_SECRET = prev;
    vi.restoreAllMocks();
  });

  it('sign + verify OK pour un redeemCode', () => {
    const code = 'abc123xyz7890123';
    const sig = signPrize(code);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPrizeSignature(code, sig)).toBe(true);
  });

  it('verify avec mauvaise signature → false', () => {
    const code = 'nanoidlikecode1234';
    const sig = signPrize(code);
    const tampered = `${sig.slice(0, -1)}${sig[sig.length - 1] === '0' ? '1' : '0'}`;
    expect(verifyPrizeSignature(code, tampered)).toBe(false);
  });

  it('verify avec signature trop courte ou trop longue → false (pas de throw)', () => {
    expect(verifyPrizeSignature('code', 'abcd')).toBe(false);
    expect(verifyPrizeSignature('code', 'a'.repeat(128))).toBe(false);
  });

  it('utilise crypto.timingSafeEqual pour la comparaison binaire', async () => {
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    const code = 'verify_timing_safe_01';
    const sig = signPrize(code);
    verifyPrizeSignature(code, sig);
    expect(spy).toHaveBeenCalled();
  });
});
