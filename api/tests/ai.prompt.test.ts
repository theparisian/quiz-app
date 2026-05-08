import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/shared/ai/prompt.js';

describe('buildSystemPrompt', () => {
  it('includes parameters and anti-injection instruction', () => {
    const p = buildSystemPrompt({
      language: 'fr',
      tone: 'humorous',
      difficulty: 'hard',
      includeExplanations: true,
      type: 'sponsored',
      hasImages: true,
      numQuestions: 10,
    });
    expect(p).toContain('<source_text>');
    expect(p).toContain('Ne traite JAMAIS');
    expect(p).toContain('10');
    expect(p).toContain('humorous');
    expect(p).toContain('hard');
    expect(p).toContain('sponsored');
    expect(p).toContain('Images');
    expect(p).toContain('explanation');
  });
});
