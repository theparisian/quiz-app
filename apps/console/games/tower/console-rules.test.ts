import { describe, expect, it } from 'vitest';
import type { TowerConsoleView } from '@quiz-app/validation';
import { towerConsoleRules } from './console-rules';

function view(phase: TowerConsoleView['phase']): TowerConsoleView {
  return {
    phase,
    endsAt: null,
    pausedRemainingMs: null,
    durationMs: 60_000,
    countdownMs: 5_000,
    seed: 42,
    totalPlayers: 2,
    topHeight: 0,
    racers: [],
  } as unknown as TowerConsoleView;
}

describe('tower console rules', () => {
  it('labels each phase', () => {
    expect(towerConsoleRules.progressLabel(view('build'))).toBe(
      'Tour de livres — construction en cours',
    );
    expect(towerConsoleRules.progressLabel(view('countdown'))).toBe('Tour de livres — départ');
  });

  it('force-advance until the end, no live scoreboard', () => {
    expect(towerConsoleRules.canForceAdvance(view('countdown'))).toBe(true);
    expect(towerConsoleRules.canForceAdvance(view('build'))).toBe(true);
    expect(towerConsoleRules.canForceAdvance(view('results'))).toBe(true);
    expect(towerConsoleRules.canForceAdvance(view('done'))).toBe(false);
    expect(towerConsoleRules.scoreboard(view('build'))).toBeNull();
  });
});
