import { describe, expect, it } from 'vitest';
import { pollConsoleViewSchema } from '@quiz-app/validation';
import { pollConsoleRules } from './console-rules';

const common = {
  questionIndex: 1,
  totalQuestions: 3,
  question: {
    id: 'q2',
    text: 'Popcorn ?',
    options: [
      { id: 'sweet', text: 'Sucré' },
      { id: 'salty', text: 'Salé' },
    ],
    durationMs: 20000,
  },
  endsAt: null,
  pausedRemainingMs: null,
  totalVotes: 1,
  totalPlayers: 4,
};
const counts = [
  { optionId: 'sweet', votes: 1 },
  { optionId: 'salty', votes: 0 },
];
const question = pollConsoleViewSchema.parse({ phase: 'question', ...common });
const results = pollConsoleViewSchema.parse({ phase: 'results', ...common, counts });
const done = pollConsoleViewSchema.parse({ phase: 'done', ...common, counts });

describe('poll console rules', () => {
  it('progress label, force-advance (vote and results), no scoreboard', () => {
    expect(pollConsoleRules.progressLabel(question)).toBe('Sondage — question 2 / 3');
    expect(pollConsoleRules.canForceAdvance(question)).toBe(true);
    expect(pollConsoleRules.canForceAdvance(results)).toBe(true);
    expect(pollConsoleRules.canForceAdvance(done)).toBe(false);
    expect(pollConsoleRules.scoreboard(results)).toBeNull();
  });
});
