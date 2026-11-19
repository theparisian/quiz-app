import { describe, expect, it } from 'vitest';
import { displayedRoundSponsor, type RoundInfo } from '@quiz-app/validation';
import { borderColorOf, isOpeningCardVisible } from './sponsor-display';

const SPONSOR = { name: 'Popcorn & Co', logoUrl: null, brandColorPrimary: '#123456' };

function round(kind: 'internal' | 'sponsored', sponsor: typeof SPONSOR | null): RoundInfo {
  return {
    roundId: '1',
    position: 1,
    totalRounds: 1,
    engineKey: 'quiz',
    game: { slug: 'g', title: 'Jeu', kind, sponsor },
  };
}

describe('sponsor display (C4)', () => {
  it('shows a sponsor only for a sponsored round that has one', () => {
    expect(displayedRoundSponsor(round('sponsored', SPONSOR))).toEqual(SPONSOR);
    expect(displayedRoundSponsor(round('internal', SPONSOR))).toBeNull();
    expect(displayedRoundSponsor(round('sponsored', null))).toBeNull();
    expect(displayedRoundSponsor(null)).toBeNull();
  });

  it('opening card covers the countdown (lobby / previous ranking) but never the game', () => {
    const base = { isPaused: false, withinWindow: true, hasSponsor: true };
    expect(isOpeningCardVisible({ ...base, display: 'lobby' })).toBe(true);
    expect(isOpeningCardVisible({ ...base, display: 'round_end' })).toBe(true);
    expect(isOpeningCardVisible({ ...base, display: 'game' })).toBe(false);
    expect(isOpeningCardVisible({ ...base, display: 'final_results' })).toBe(false);
    expect(isOpeningCardVisible({ ...base, display: 'lobby', withinWindow: false })).toBe(false);
    expect(isOpeningCardVisible({ ...base, display: 'lobby', hasSponsor: false })).toBe(false);
    expect(isOpeningCardVisible({ ...base, display: 'lobby', isPaused: true })).toBe(false);
  });

  it('accepts only #RRGGBB for the border', () => {
    expect(borderColorOf('#A1b2C3')).toBe('#A1b2C3');
    expect(borderColorOf('red')).toBeNull();
    expect(borderColorOf(null)).toBeNull();
  });
});
