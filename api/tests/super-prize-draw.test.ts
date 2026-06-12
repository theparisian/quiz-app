import { describe, expect, it, vi } from 'vitest';
import { drawSuperPrizeWin } from '../src/modules/prizes/super-prize-draw.service.js';

describe('drawSuperPrizeWin', () => {
  it('returns false when oddsOneIn < 2', () => {
    expect(drawSuperPrizeWin(1, () => 0)).toBe(false);
  });

  it('wins when rng below threshold', () => {
    expect(drawSuperPrizeWin(10, () => 0.05)).toBe(true);
  });

  it('loses when rng at or above threshold', () => {
    expect(drawSuperPrizeWin(10, () => 0.1)).toBe(false);
  });

  it('respects probability over many draws', () => {
    const odds = 5;
    let wins = 0;
    const rng = () => {
      const v = (wins + 1) / 100;
      return v;
    };
    for (let i = 0; i < 100; i++) {
      if (drawSuperPrizeWin(odds, () => Math.random())) {
        wins++;
      }
    }
    expect(wins).toBeGreaterThan(5);
    expect(wins).toBeLessThan(35);
  });
});
