import { describe, expect, it } from 'vitest';
import { generateSuggestions } from '../src/shared/pseudo-generator.js';
import { PSEUDO_MAX_LENGTH } from '../src/modules/players/players.schemas.js';

describe('pseudo-generator', () => {
  it('returns distinct suggestions respecting max length', () => {
    const suggestions = generateSuggestions({
      excluded: [],
      count: 3,
      maxLength: PSEUDO_MAX_LENGTH,
    });
    expect(suggestions).toHaveLength(3);
    const lower = suggestions.map((s) => s.toLowerCase());
    expect(new Set(lower).size).toBe(3);
    for (const s of suggestions) {
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(s.length).toBeLessThanOrEqual(PSEUDO_MAX_LENGTH);
    }
  });

  it('excludes taken pseudos case-insensitively', () => {
    const suggestions = generateSuggestions({
      excluded: ['PopcornFurtif'],
      count: 3,
      maxLength: PSEUDO_MAX_LENGTH,
    });
    for (const s of suggestions) {
      expect(s.toLowerCase()).not.toBe('popcornfurtif');
    }
  });

  it('falls back to numeric suffix when base combination collides', () => {
    const suggestions = generateSuggestions({
      excluded: ['PopcornFurtif'],
      count: 1,
      maxLength: PSEUDO_MAX_LENGTH,
    });
    expect(suggestions).toHaveLength(1);
  });
});
