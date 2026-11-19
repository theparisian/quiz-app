import { describe, expect, it } from 'vitest';
import { revenueLabel } from './format';

describe('revenueLabel', () => {
  it('per session and per participant, French euro format', () => {
    expect(revenueLabel({ pricing: 'per_session', cinemaAmountCents: 400 })).toBe(
      'Vous rapporte 4,00\u00a0€ par séance',
    );
    expect(revenueLabel({ pricing: 'per_participant', cinemaAmountCents: 13 })).toBe(
      'Vous rapporte 0,13\u00a0€ par participant',
    );
    expect(revenueLabel({ pricing: 'per_session', cinemaAmountCents: 123456 })).toBe(
      'Vous rapporte 1\u00a0234,56\u00a0€ par séance',
    );
  });
});
