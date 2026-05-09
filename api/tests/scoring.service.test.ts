import { describe, expect, it } from 'vitest';
import { computeScore } from '../src/shared/scoring/scoring.service.js';

describe('computeScore', () => {
  const base = {
    totalTimeMs: 20_000,
    pointsMax: 1000,
    pointsFloor: 500,
  };

  it('correct answer at 0ms (instant) → pointsMax', () => {
    expect(computeScore({ ...base, isCorrect: true, timeToAnswerMs: 1 })).toBe(1000);
  });

  it('correct answer at totalTime exact → pointsFloor', () => {
    expect(computeScore({ ...base, isCorrect: true, timeToAnswerMs: 20_000 })).toBe(500);
  });

  it('correct answer at half time → ~750 (ratio 0.5)', () => {
    const score = computeScore({ ...base, isCorrect: true, timeToAnswerMs: 10_000 });
    expect(score).toBe(500);
  });

  it('correct answer at quarter time → 750', () => {
    const score = computeScore({ ...base, isCorrect: true, timeToAnswerMs: 5_000 });
    expect(score).toBe(750);
  });

  it('incorrect answer → 0', () => {
    expect(computeScore({ ...base, isCorrect: false, timeToAnswerMs: 1000 })).toBe(0);
  });

  it('no answer (timeToAnswerMs = 0) → 0', () => {
    expect(computeScore({ ...base, isCorrect: true, timeToAnswerMs: 0 })).toBe(0);
  });

  it('negative timeToAnswerMs → 0', () => {
    expect(computeScore({ ...base, isCorrect: true, timeToAnswerMs: -100 })).toBe(0);
  });

  it('timeToAnswer > totalTime (latency tolerance) → pointsFloor', () => {
    expect(computeScore({ ...base, isCorrect: true, timeToAnswerMs: 25_000 })).toBe(500);
  });

  it('pointsFloor > computed → pointsFloor wins', () => {
    const score = computeScore({
      isCorrect: true,
      timeToAnswerMs: 19_500,
      totalTimeMs: 20_000,
      pointsMax: 1000,
      pointsFloor: 500,
    });
    expect(score).toBe(500);
  });

  it('custom pointsMax and pointsFloor', () => {
    const score = computeScore({
      isCorrect: true,
      timeToAnswerMs: 1,
      totalTimeMs: 10_000,
      pointsMax: 2000,
      pointsFloor: 200,
    });
    expect(score).toBe(2000);
  });
});
