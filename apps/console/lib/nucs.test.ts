import { describe, expect, it } from 'vitest';
import { latestNuc } from './nucs';

describe('latestNuc', () => {
  it('picks the most recently seen NUC, never-seen ones last', () => {
    const nucs = [
      { id: 'a', lastSeenAt: null },
      { id: 'b', lastSeenAt: '2026-11-18T10:00:00.000Z' },
      { id: 'c', lastSeenAt: '2026-11-19T09:00:00.000Z' },
    ];
    expect(latestNuc(nucs)?.id).toBe('c');
    expect(latestNuc([{ id: 'a', lastSeenAt: null }])?.id).toBe('a');
    expect(latestNuc([])).toBeUndefined();
  });
});
