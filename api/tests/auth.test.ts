import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../src/shared/auth/jwt.js';

describe('JWT', () => {
  it('should sign and verify a JWT', async () => {
    const payload = { userId: '1', role: 'super_admin' as const };
    const token = await signJwt(payload);
    expect(token).toBeTruthy();

    const decoded = await verifyJwt(token);
    expect(decoded.userId).toBe('1');
    expect(decoded.role).toBe('super_admin');
  });

  it('should include cinemaId when provided', async () => {
    const payload = { userId: '1', role: 'projectionist' as const, cinemaId: '42' };
    const token = await signJwt(payload);
    const decoded = await verifyJwt(token);
    expect(decoded.cinemaId).toBe('42');
  });

  it('should reject an invalid token', async () => {
    await expect(verifyJwt('invalid.token.here')).rejects.toThrow();
  });
});
