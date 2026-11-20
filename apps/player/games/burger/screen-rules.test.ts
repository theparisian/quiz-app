import { describe, expect, it } from 'vitest';
import type { BurgerScreenView } from '@quiz-app/validation';
import { burgerScreenRules } from './screen-rules';
import { DEPTH_ROWS, centerOut, slotFor } from './scene';

const NOW = 1_700_000_000_000;

function view(phase: BurgerScreenView['phase'], overrides: Partial<BurgerScreenView> = {}) {
  const common = {
    endsAt: new Date(NOW + 30_000).toISOString(),
    pausedRemainingMs: null,
    durationMs: 60_000,
    countdownMs: 4_000,
    totalLayers: 8,
    totalPlayers: 3,
    finishedCount: 0,
  };
  if (phase === 'countdown') return { phase, ...common, ...overrides } as BurgerScreenView;
  if (phase === 'build') return { phase, ...common, racers: [], ...overrides } as BurgerScreenView;
  return { phase, ...common, racers: [], recipe: [], ...overrides } as unknown as BurgerScreenView;
}

describe('burger screen rules', () => {
  it('never keeps the lobby and sounds the start and the end of the race', () => {
    expect(burgerScreenRules.showsLobby(view('countdown'))).toBe(false);
    expect(burgerScreenRules.sfxOnEnter(view('countdown'))).toEqual([]);
    expect(burgerScreenRules.sfxOnEnter(view('build'))).toEqual([
      { slot: 'questionStart', delayMs: 0 },
    ]);
    expect(burgerScreenRules.sfxOnEnter(view('results'))).toEqual([
      { slot: 'questionEnd', delayMs: 0 },
    ]);
    expect(burgerScreenRules.stageKey(view('build'))).toBe('build');
  });

  it('schedules the last-seconds sound during the race only, not when paused', () => {
    const plan = burgerScreenRules.timedSfx(view('build'), 0, NOW);
    expect(plan).toMatchObject({ slot: 'lastSeconds', key: 'burger-build' });
    expect(plan!.delayMs).toBeGreaterThan(0);
    expect(burgerScreenRules.timedSfx(view('countdown'), 0, NOW)).toBeNull();
    expect(
      burgerScreenRules.timedSfx(view('build', { endsAt: null, pausedRemainingMs: 5000 }), 0, NOW),
    ).toBeNull();
  });

  it('a finished burger cue plays a sound', () => {
    expect(burgerScreenRules.sfxForCue('player_finished', {})).toBe('playerAnswered');
    expect(burgerScreenRules.sfxForCue('other', {})).toBeNull();
  });
});

describe('burger scene', () => {
  it('the leader is front and center; further racers go back and shrink', () => {
    const first = slotFor(0)!;
    expect(first.scale).toBe(1);
    expect(Math.abs(first.left - 50)).toBeLessThan(15);
    const back = slotFor(DEPTH_ROWS[0]!.count)!;
    expect(back.scale).toBeLessThan(first.scale);
    expect(back.zIndex).toBeLessThan(first.zIndex);
    const total = DEPTH_ROWS.reduce((n, r) => n + r.count, 0);
    expect(slotFor(total - 1)).not.toBeNull();
    expect(slotFor(total)).toBeNull();
  });

  it('every slot of a row is used exactly once', () => {
    for (const row of DEPTH_ROWS) {
      const positions = Array.from({ length: row.count }, (_, i) => centerOut(i, row.count));
      expect(new Set(positions).size).toBe(row.count);
    }
  });
});
