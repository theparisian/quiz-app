import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import { MockAiClient } from '../src/shared/ai/mock-client.js';
import { setAiClientForTests, resetAiClientSingletonForTests } from '../src/shared/ai/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
} from './helpers/integration.js';
import { logger } from '../src/shared/logger/index.js';
import { makeInvalidQuizTwoCorrect, makeValidQuiz } from './helpers/ai-fixtures.js';

function genBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceText: 'x'.repeat(50),
    numQuestions: 8,
    difficulty: 'medium',
    tone: 'serious',
    language: 'fr',
    includeExplanations: false,
    type: 'standard',
    imageUrls: [],
    model: 'claude-sonnet-4-6',
    ...overrides,
  };
}

describe('ai generate-quiz', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
    resetAiClientSingletonForTests();
    setAiClientForTests(
      new MockAiClient({
        quiz: makeValidQuiz(8),
        usage: { inputTokens: 100, outputTokens: 200, estimatedCostEur: 0.02 },
      }),
    );
  });

  afterEach(() => {
    setAiClientForTests(null);
    resetAiClientSingletonForTests();
    vi.restoreAllMocks();
  });

  it('returns quiz payload and persists success row', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const res = await authed(request(app).post('/api/ai/generate-quiz'), token)
      .send(genBody())
      .expect(200);
    expect(res.body.generationId).toBeDefined();
    expect(res.body.quiz.questions).toHaveLength(8);
    const row = await prisma.aiGeneration.findFirst({ where: { status: 'success' } });
    expect(row).not.toBeNull();
    expect(row?.tokensInput).toBe(100);
    expect(row?.tokensOutput).toBe(200);
  });

  it('rejects invalid Zod output with 502 and failed row', async () => {
    setAiClientForTests(new MockAiClient({ quiz: makeInvalidQuizTwoCorrect() }));
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    await authed(request(app).post('/api/ai/generate-quiz'), token).send(genBody()).expect(502);
    const row = await prisma.aiGeneration.findFirst({ where: { status: 'failed' } });
    expect(row).not.toBeNull();
    expect(row?.errorDetails).not.toBeNull();
  });

  it('clears invented image URL and logs', async () => {
    const spy = vi.spyOn(logger, 'warn');
    const quiz = makeValidQuiz(8);
    const q0 = quiz.questions[0];
    if (q0) q0.imageUrl = 'https://attacker.example/evil.png';
    setAiClientForTests(new MockAiClient({ quiz }));
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const allowedUrl = 'https://example.com/ok.png';
    const res = await authed(request(app).post('/api/ai/generate-quiz'), token)
      .send(genBody({ imageUrls: [allowedUrl] }))
      .expect(200);
    expect(res.body.quiz.questions[0].imageUrl).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('validates input: short sourceText 400', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    await authed(request(app).post('/api/ai/generate-quiz'), token)
      .send(genBody({ sourceText: 'short' }))
      .expect(400);
  });

  it('validates numQuestions bounds 400', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    await authed(request(app).post('/api/ai/generate-quiz'), token)
      .send(genBody({ sourceText: 'x'.repeat(50), numQuestions: 99 }))
      .expect(400);
  });
});
