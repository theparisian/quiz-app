import { describe, expect, it } from 'vitest';
import { buildToolSchema } from '../src/shared/ai/prompt.js';
import { generatedQuizPayloadSchema } from '../src/shared/ai/generated-quiz.zod.js';
import { makeValidQuiz } from './helpers/ai-fixtures.js';

describe('submit_quiz tool JSON schema', () => {
  it('is an object schema with questions array', () => {
    const s = buildToolSchema();
    expect(s.type).toBe('object');
    expect(s).toHaveProperty('properties');
  });

  it('matches Zod on valid and invalid payloads', () => {
    const valid = makeValidQuiz(5);
    expect(generatedQuizPayloadSchema.safeParse(valid).success).toBe(true);
    const bad = { questions: makeValidQuiz(2).questions };
    expect(generatedQuizPayloadSchema.safeParse(bad).success).toBe(false);
  });
});
