import { describe, expect, it } from 'vitest';
import { chartGeometry, niceCeil, periodQuery } from './sponsor-portal';

describe('sponsor portal helpers (C4)', () => {
  it('rounds the axis top to 1, 2 or 5 × 10^n', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(12)).toBe(20);
    expect(niceCeil(45)).toBe(50);
    expect(niceCeil(100)).toBe(100);
  });

  it('places the points of the participants curve', () => {
    const g = chartGeometry(
      [
        { day: '2026-11-01', sessions: 1, participants: 0 },
        { day: '2026-11-02', sessions: 2, participants: 20 },
        { day: '2026-11-03', sessions: 1, participants: 10 },
      ],
      200,
      100,
    );
    expect(g.yMax).toBe(20);
    expect(g.ticks).toEqual([0, 10, 20]);
    expect(g.points.map((p) => [p.x, p.y])).toEqual([
      [0, 100],
      [100, 0],
      [200, 50],
    ]);
  });

  it('centres a single day', () => {
    const g = chartGeometry([{ day: '2026-11-01', sessions: 1, participants: 4 }], 200, 100);
    expect(g.points[0]).toMatchObject({ x: 100, y: 20 });
  });

  it('builds the period query string', () => {
    expect(periodQuery('', '')).toBe('');
    expect(periodQuery('2026-11-01', '')).toBe('?from=2026-11-01');
    expect(periodQuery('2026-11-01', '2026-11-30')).toBe('?from=2026-11-01&to=2026-11-30');
  });
});
