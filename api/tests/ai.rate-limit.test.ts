import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  recordSuccessfulGeneration,
  resetRateLimitBucketsForTests,
} from '../src/modules/ai/ai.rate-limit.js';
import request from 'supertest';
import { setAiClientForTests, resetAiClientSingletonForTests } from '../src/shared/ai/index.js';
import { MockAiClient } from '../src/shared/ai/mock-client.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
} from './helpers/integration.js';
import { makeValidQuiz } from './helpers/ai-fixtures.js';

const body = {
  sourceText: 'x'.repeat(50),
  numQuestions: 8,
  difficulty: 'medium',
  tone: 'serious',
  language: 'fr',
  includeExplanations: false,
  type: 'standard',
  imageUrls: [],
  model: 'claude-sonnet-4-6',
};

describe('ai rate limit', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    resetRateLimitBucketsForTests();
    resetAiClientSingletonForTests();
    setAiClientForTests(new MockAiClient({ quiz: makeValidQuiz(8) }));
  });

  afterEach(() => {
    setAiClientForTests(null);
    resetAiClientSingletonForTests();
    resetRateLimitBucketsForTests();
    vi.useRealTimers();
  });

  it('allows five successful generations then blocks', () => {
    const uid = 42n;
    for (let i = 0; i < 5; i += 1) recordSuccessfulGeneration(uid);
    const r = checkRateLimit(uid);
    expect(r.allowed).toBe(false);
    expect(r.resetAt).not.toBeNull();
  });

  it('keeps separate buckets per user', () => {
    for (let i = 0; i < 5; i += 1) recordSuccessfulGeneration(1n);
    expect(checkRateLimit(1n).allowed).toBe(false);
    expect(checkRateLimit(2n).allowed).toBe(true);
  });

  it('resets window after one hour (simulated)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:00:00.000Z'));
    const uid = 99n;
    for (let i = 0; i < 5; i += 1) recordSuccessfulGeneration(uid);
    expect(checkRateLimit(uid).allowed).toBe(false);
    vi.advanceTimersByTime(60 * 60 * 1000 + 2000);
    expect(checkRateLimit(uid).allowed).toBe(true);
  });

  it('returns 429 on sixth generate request', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    for (let i = 0; i < 5; i += 1) {
      await authed(request(app).post('/api/ai/generate-quiz'), token).send(body).expect(200);
    }
    const res = await authed(request(app).post('/api/ai/generate-quiz'), token)
      .send(body)
      .expect(429);
    expect(res.body.error.code).toBe('AI_RATE_LIMITED');
    expect(res.body.error.details.resetAt).toBeDefined();
  });
});
