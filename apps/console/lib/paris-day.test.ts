import { describe, expect, it } from 'vitest';
import { parisDayEnd, parisDayStart } from '@quiz-app/validation';

describe('Paris calendar days (C3)', () => {
  it('maps a winter day to UTC+1 bounds', () => {
    expect(parisDayStart('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(parisDayEnd('2026-01-15').toISOString()).toBe('2026-01-15T22:59:59.000Z');
  });

  it('maps a summer day to UTC+2 bounds', () => {
    expect(parisDayStart('2026-07-01').toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(parisDayEnd('2026-07-31').toISOString()).toBe('2026-07-31T21:59:59.000Z');
  });

  it('handles DST switch days (23 h and 25 h)', () => {
    expect(parisDayStart('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(parisDayEnd('2026-03-29').toISOString()).toBe('2026-03-29T21:59:59.000Z');
    expect(parisDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(parisDayEnd('2026-10-25').toISOString()).toBe('2026-10-25T22:59:59.000Z');
  });

  it('handles month and year rollover', () => {
    expect(parisDayEnd('2026-12-31').toISOString()).toBe('2026-12-31T22:59:59.000Z');
    expect(parisDayStart('2027-01-01').toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });
});
