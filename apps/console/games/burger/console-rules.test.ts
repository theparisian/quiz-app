import { describe, expect, it } from 'vitest';
import type { BurgerConsoleView } from '@quiz-app/validation';
import { burgerConsoleRules } from './console-rules';

function view(phase: BurgerConsoleView['phase']): BurgerConsoleView {
  return {
    phase,
    endsAt: null,
    pausedRemainingMs: null,
    durationMs: 60_000,
    countdownMs: 4_000,
    totalLayers: 8,
    totalPlayers: 2,
    finishedCount: 0,
    racers: [],
    recipe: [],
  } as unknown as BurgerConsoleView;
}

describe('burger console rules', () => {
  it('labels each phase', () => {
    expect(burgerConsoleRules.progressLabel(view('build'))).toBe('Burger — course en cours');
    expect(burgerConsoleRules.progressLabel(view('countdown'))).toBe('Burger — départ');
  });

  it('force-advance until the end, no live scoreboard', () => {
    expect(burgerConsoleRules.canForceAdvance(view('countdown'))).toBe(true);
    expect(burgerConsoleRules.canForceAdvance(view('build'))).toBe(true);
    expect(burgerConsoleRules.canForceAdvance(view('results'))).toBe(true);
    expect(burgerConsoleRules.canForceAdvance(view('done'))).toBe(false);
    expect(burgerConsoleRules.scoreboard(view('build'))).toBeNull();
  });
});
