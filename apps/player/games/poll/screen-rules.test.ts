import { describe, expect, it } from 'vitest';
import { pollScreenViewSchema, type PollScreenView } from '@quiz-app/validation';
import { TIMER_URGENT_THRESHOLD_SEC } from '@quiz-app/design-tokens';
import { pollScreenRules } from './screen-rules';
import { pollBars } from './bars';

const NOW = Date.parse('2026-11-19T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const common = {
  questionIndex: 0,
  totalQuestions: 2,
  question: {
    id: 'q1',
    text: 'Film ?',
    options: [
      { id: 'a', text: 'Alien' },
      { id: 'b', text: 'Brazil' },
      { id: 'c', text: 'Casablanca' },
    ],
    durationMs: 20000,
  },
  endsAt: iso(NOW + 20000),
  pausedRemainingMs: null,
  totalVotes: 4,
  totalPlayers: 5,
};
const counts = [
  { optionId: 'a', votes: 3 },
  { optionId: 'b', votes: 1 },
  { optionId: 'c', votes: 0 },
];
const question = pollScreenViewSchema.parse({ phase: 'question', ...common });
const results = pollScreenViewSchema.parse({ phase: 'results', ...common, counts }) as Extract<
  PollScreenView,
  { phase: 'results' }
>;
const done = pollScreenViewSchema.parse({ phase: 'done', ...common, endsAt: null, counts });

describe('poll screen rules', () => {
  it('sounds derived from the view; no cue sound; never keeps the lobby', () => {
    expect(pollScreenRules.sfxOnEnter(question)).toEqual([{ slot: 'questionStart', delayMs: 0 }]);
    expect(pollScreenRules.sfxOnEnter(results)).toEqual([{ slot: 'questionEnd', delayMs: 0 }]);
    expect(pollScreenRules.sfxOnEnter(done)).toEqual([]);
    expect(pollScreenRules.sfxForCue('anything', {})).toBeNull();
    for (const v of [question, results, done]) expect(pollScreenRules.showsLobby(v)).toBe(false);
  });

  it('stage key ignores vote counter and pause re-emissions', () => {
    const k = pollScreenRules.stageKey(question);
    expect(pollScreenRules.stageKey({ ...question, totalVotes: 5 } as PollScreenView)).toBe(k);
    expect(pollScreenRules.stageKey(results)).not.toBe(k);
  });

  it('lastSeconds from endsAt, none when paused or outside the question', () => {
    expect(pollScreenRules.timedSfx(question, 0, NOW)).toEqual({
      slot: 'lastSeconds',
      delayMs: 20000 - TIMER_URGENT_THRESHOLD_SEC * 1000,
      key: 'poll-question:0',
    });
    const paused = { ...question, endsAt: null, pausedRemainingMs: 3000 } as PollScreenView;
    expect(pollScreenRules.timedSfx(paused, 0, NOW)).toBeNull();
    expect(pollScreenRules.timedSfx(results, 0, NOW)).toBeNull();
  });

  it('result bars: letters, colors and rounded percentages in option order', () => {
    expect(pollBars(results).map((b) => [b.letter, b.text, b.votes, b.percent])).toEqual([
      ['A', 'Alien', 3, 75],
      ['B', 'Brazil', 1, 25],
      ['C', 'Casablanca', 0, 0],
    ]);
    expect(pollBars(results)[0]!.color).toMatch(/^#/);
  });
});
