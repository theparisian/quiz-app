import type { GeneratedQuizPayload } from './generated-quiz.zod.js';

export type { GeneratedQuizPayload, GeneratedQuestionPayload } from './generated-quiz.zod.js';

export interface GenerateQuizInput {
  systemPrompt: string;
  sourceText: string;
  imageUrls: string[];
  parameters: {
    numQuestions: number;
    difficulty: 'easy' | 'medium' | 'hard';
    tone: 'serious' | 'casual' | 'humorous';
    language: 'fr' | 'en';
    contextHint: string | null;
    includeExplanations: boolean;
  };
  model: 'claude-sonnet-4-6' | 'claude-opus-4-7';
  maxTokens: number;
}

export interface GenerateQuizResult {
  quiz: GeneratedQuizPayload;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostEur: number;
  };
  rawResponse: unknown;
}

export interface AiClient {
  generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizResult>;
}
