import { describe, expect, it, beforeEach } from 'vitest';
import { generateShortCode, formatShortCode } from '../src/modules/prizes/short-code.service.js';

describe('shortCode generation', () => {
  it('uses unambiguous alphabet only', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode(() => Math.random());
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{3}-[23456789]{3}$/);
      expect(code).not.toMatch(/[OI01]/);
    }
  });

  it('formatShortCode builds ABC-123 shape', () => {
    expect(formatShortCode('ABC', '123')).toBe('ABC-123');
  });
});
