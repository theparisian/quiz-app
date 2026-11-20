import { describe, expect, it } from 'vitest';
import type { TowerScreenView } from '@quiz-app/validation';
import { towerScreenRules } from './screen-rules';
import { COLUMN_WIDTH_CM, columnFor, stageScale } from './scene';

const NOW = 1_700_000_000_000;

function view(phase: TowerScreenView['phase'], overrides: Partial<TowerScreenView> = {}) {
  const common = {
    endsAt: new Date(NOW + 30_000).toISOString(),
    pausedRemainingMs: null,
    durationMs: 60_000,
    countdownMs: 5_000,
    seed: 42,
    totalPlayers: 3,
    topHeight: 0,
  };
  if (phase === 'countdown') return { phase, ...common, ...overrides } as TowerScreenView;
  return { phase, ...common, racers: [], ...overrides } as TowerScreenView;
}

describe('tower screen rules', () => {
  it('never keeps the lobby and sounds the start and the end of the build', () => {
    expect(towerScreenRules.showsLobby(view('countdown'))).toBe(false);
    expect(towerScreenRules.sfxOnEnter(view('countdown'))).toEqual([]);
    expect(towerScreenRules.sfxOnEnter(view('build'))).toEqual([
      { slot: 'questionStart', delayMs: 0 },
    ]);
    expect(towerScreenRules.sfxOnEnter(view('results'))).toEqual([
      { slot: 'questionEnd', delayMs: 0 },
    ]);
    expect(towerScreenRules.stageKey(view('build'))).toBe('build');
  });

  it('schedules the last-seconds sound during the build only, not when paused', () => {
    const plan = towerScreenRules.timedSfx(view('build'), 0, NOW);
    expect(plan).toMatchObject({ slot: 'lastSeconds', key: 'tower-build' });
    expect(plan!.delayMs).toBeGreaterThan(0);
    expect(towerScreenRules.timedSfx(view('countdown'), 0, NOW)).toBeNull();
    expect(
      towerScreenRules.timedSfx(view('build', { endsAt: null, pausedRemainingMs: 5000 }), 0, NOW),
    ).toBeNull();
  });

  it('a collapse cue plays a sound', () => {
    expect(towerScreenRules.sfxForCue('tower_collapsed', {})).toBe('playerAnswered');
    expect(towerScreenRules.sfxForCue('other', {})).toBeNull();
  });
});

describe('tower scene', () => {
  it('the highest tower is in the middle and every column is used once', () => {
    for (const count of [1, 2, 5, 10]) {
      const cols = Array.from({ length: count }, (_, i) => columnFor(i, count));
      expect(new Set(cols).size).toBe(count);
      expect(Math.abs(cols[0]! - (count - 1) / 2)).toBeLessThanOrEqual(0.5);
    }
  });

  it('the scale shrinks as the highest tower grows, and fits the columns', () => {
    const small = stageScale(4, 30, 1800, 700);
    const tall = stageScale(4, 300, 1800, 700);
    expect(tall).toBeLessThan(small);
    expect(tall * 320).toBeLessThanOrEqual(700);
    expect(stageScale(10, 0, 1800, 700) * 10 * COLUMN_WIDTH_CM).toBeLessThanOrEqual(1800);
  });
});
