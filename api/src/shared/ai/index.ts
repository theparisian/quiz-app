import type { AiClient } from './ai-client.js';
import { AnthropicClient } from './anthropic-client.js';
import { MockAiClient } from './mock-client.js';

export type * from './ai-client.js';
export * from './errors.js';
export * from './generated-quiz.zod.js';
export * from './prompt.js';
export { AnthropicClient } from './anthropic-client.js';
export { MockAiClient, type MockAiClientOptions } from './mock-client.js';

let testOverride: AiClient | null = null;
let lazySingleton: AiClient | null = null;

export function setAiClientForTests(client: AiClient | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setAiClientForTests is only allowed when NODE_ENV=test');
  }
  testOverride = client;
}

export function resetAiClientSingletonForTests(): void {
  lazySingleton = null;
}

export function validateAiEnvironment(): void {
  const provider = process.env.AI_PROVIDER ?? 'anthropic';
  if (provider !== 'anthropic' && provider !== 'mock') {
    throw new Error(`AI_PROVIDER must be "anthropic" or "mock", got: ${provider}`);
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
  }
}

export function getAiClient(): AiClient {
  if (testOverride !== null) return testOverride;

  const provider = process.env.AI_PROVIDER ?? 'anthropic';
  if (provider === 'mock') {
    lazySingleton ??= new MockAiClient();
    return lazySingleton;
  }
  lazySingleton ??= new AnthropicClient();
  return lazySingleton;
}
