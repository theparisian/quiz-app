import { describe, expect, it } from 'vitest';
import { TOWER_BOOKS, towerSettle, type TowerBook } from '@quiz-app/validation';
import {
  TIP_RELEASE_ANGLE,
  landingImpulse,
  restingLean,
  stabilityLabel,
  startTipping,
  stepDebris,
  stepSway,
  stepTipping,
  tippedCenter,
} from './sim';

const book = (x: number): TowerBook => ({ k: 'roman', x });

describe('tower animation helpers', () => {
  it('a collapse tips around the edge of its support, on the side it fell, then breaks apart', () => {
    const settled = towerSettle([book(0), book(0), book(14), book(26)]);
    expect(settled.side).toBe(1);
    const tip = startTipping(settled.books, settled.fallen, 1);
    expect(tip.pivotX).toBe(settled.books.at(-1)!.x + TOWER_BOOKS.roman.width / 2);

    // Au départ, les livres sont à leur place.
    const start = tippedCenter(tip, 0);
    expect(start.cx).toBeCloseTo(settled.fallen[0]!.x);

    let debris = null;
    for (let i = 0; i < 200 && !debris; i++) debris = stepTipping(tip, 1 / 60);
    expect(debris).not.toBeNull();
    expect(tip.angle).toBeGreaterThanOrEqual(TIP_RELEASE_ANGLE);
    expect(debris).toHaveLength(settled.fallen.length);
    // Tout part vers la droite, puis tombe.
    for (const d of debris!) {
      expect(d.cx).toBeGreaterThan(start.cx - 1);
      const y0 = d.cy;
      for (let i = 0; i < 60; i++) stepDebris(d, 1 / 60);
      expect(d.cy).toBeLessThan(y0);
    }
  });

  it('tipping to the left mirrors the right', () => {
    const tip = startTipping([book(0)], [book(-20)], -1);
    let debris = null;
    for (let i = 0; i < 200 && !debris; i++) debris = stepTipping(tip, 1 / 60);
    expect(tip.angle).toBeLessThan(0);
    expect(debris![0]!.vx).toBeLessThan(0);
  });

  it('the sway settles back to rest', () => {
    const sway = { angle: 0, omega: landingImpulse([book(0), book(10)]) };
    expect(sway.omega).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) stepSway(sway, 1 / 60, 40);
    expect(Math.abs(sway.angle)).toBeLessThan(0.001);
  });

  it('a tower leans towards its most stressed side, more when close to falling', () => {
    expect(restingLean([book(0), book(0)])).toBe(0);
    const slight = restingLean([book(0), book(5)]);
    const strong = restingLean([book(0), book(13)]);
    expect(slight).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(slight);
    expect(restingLean([book(0), book(-13)])).toBeCloseTo(-strong);
  });

  it('labels the stability gauge', () => {
    expect(stabilityLabel(0.1).tone).toBe('ok');
    expect(stabilityLabel(0.6).tone).toBe('warn');
    expect(stabilityLabel(0.9).tone).toBe('danger');
  });
});
